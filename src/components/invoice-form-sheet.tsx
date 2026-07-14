import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { FormField } from '@/components/form-field';
import { LineItemsEditor } from '@/components/line-items-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  customersAdminApi,
  invoicesAdminApi,
  type InvoiceCreateInput,
  type InvoiceLineItem,
  type InvoicePaymentMethod,
  type InvoiceRow,
  type InvoiceTaxRate,
  type InvoiceUpdateInput,
} from '@/lib/api';
import {
  computeSubtotalCents,
  emptyLine,
  lineNetCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';

// Cent-precision money formatting (utils' formatCurrency rounds to whole euros).
function formatEur(cents: number, bcp47: string, currency = 'EUR'): string {
  return (cents / 100).toLocaleString(bcp47, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function invoiceNumber(inv: InvoiceRow): string {
  return inv.number ?? `#${inv.id}`;
}

/**
 * Seed values for a brand-new invoice. Used when opening the form from a
 * context that already knows the recipient (e.g. a customer detail page), so
 * the operator doesn't retype name/email/address. Ignored in edit mode.
 */
export type InvoicePrefill = {
  recipientName?: string;
  recipientEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  customerType?: 'b2c' | 'b2b';
  paymentTermsDays?: number | null;
};

export function InvoiceFormSheet({
  slug,
  invoice,
  prefill,
  onClose,
  onSaved,
}: {
  slug: CompanySlug;
  invoice: InvoiceRow | null;
  /** Prefill for create mode only; ignored when editing. */
  prefill?: InvoicePrefill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const { projects, setActiveProjectId } = useProject();
  const isEdit = invoice != null;

  // Which brand this new invoice belongs to. Drives the tenant it's created in
  // and therefore the invoice-number prefix (HT-, CL-, TR-). Defaults to the
  // brand the operator is currently viewing; ignored when editing (an issued
  // or draft invoice can't be moved to another brand's ledger).
  const [createSlug, setCreateSlug] = useState<CompanySlug>(slug);
  const targetSlug = isEdit ? slug : createSlug;

  const [fields, setFields] = useState(() => ({
    recipientName: invoice?.recipientName ?? prefill?.recipientName ?? '',
    recipientEmail: invoice?.recipientEmail ?? prefill?.recipientEmail ?? '',
    addressLine1: invoice?.recipientAddressLine1 ?? prefill?.addressLine1 ?? '',
    addressLine2: invoice?.recipientAddressLine2 ?? prefill?.addressLine2 ?? '',
    postalCode: invoice?.recipientPostalCode ?? prefill?.postalCode ?? '',
    city: invoice?.recipientCity ?? prefill?.city ?? '',
    serviceDate: invoice?.serviceDate ?? '',
    serviceDateEnd: invoice?.serviceDateEnd ?? '',
    // Show the Leistungsdatum on the invoice? On for new invoices; for existing
    // ones, on only if a date is already set.
    showServiceDate: invoice ? Boolean(invoice.serviceDate) : true,
    customerType: (invoice?.customerType ?? prefill?.customerType ?? 'b2c') as 'b2c' | 'b2b',
    taxRatePercent: (invoice?.taxRatePercent ?? 19) as InvoiceTaxRate,
    paymentTermsDays: String(invoice?.paymentTermsDays ?? prefill?.paymentTermsDays ?? 7),
    paymentMethod: (invoice?.paymentMethod ?? 'transfer') as InvoicePaymentMethod,
    notes: invoice?.notes ?? '',
  }));
  // Line prices are stored net; the editor shows them net by default. Operators
  // can flip to gross entry (VAT-inclusive) and the net/VAT are backed out live.
  const [priceMode, setPriceMode] = useState<PriceMode>('net');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({
          label: li.label,
          quantity: String(li.quantity),
          unitPriceEur: (li.unitPriceCents / 100).toFixed(2),
          isPackage: li.isPackage ?? false,
        }))
      : [emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);
  // Whether the operator has manually touched the payment term (suppresses the
  // customer-default auto-fill once they've made a deliberate choice).
  const [termTouched, setTermTouched] = useState(false);

  function setField<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  /** Best-effort: pull the recipient customer's default payment term into a new
   *  invoice (unless the operator already picked one). */
  async function maybePrefillTermFromCustomer() {
    if (isEdit || termTouched) return;
    const email = fields.recipientEmail.trim().toLowerCase();
    if (!email) return;
    try {
      const res = await customersAdminApi.list(targetSlug, { email, limit: 1 });
      const term = res.customers[0]?.defaultPaymentTermsDays;
      if (term != null && !termTouched) setField('paymentTermsDays', String(term));
    } catch {
      // ignore lookup failures — the field keeps its current value
    }
  }

  const totals = useMemo(() => {
    const subtotal = computeSubtotalCents(lines, priceMode, fields.taxRatePercent);
    const tax = Math.round((subtotal * fields.taxRatePercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, fields.taxRatePercent, priceMode]);

  const mutation = useMutation({
    mutationFn: () => {
      const lineItems: InvoiceLineItem[] = lines.map((l) => ({
        label: l.label.trim(),
        quantity: toQuantity(l.quantity) || 1,
        unitPriceCents: lineNetCents(l, priceMode, fields.taxRatePercent),
        ...(l.isPackage ? { isPackage: true } : {}),
      }));
      const paymentTermsDays = Number(fields.paymentTermsDays);
      // Leistungsdatum only when the toggle is on; otherwise it's not stored/shown.
      const svcDate = fields.showServiceDate ? fields.serviceDate || null : null;
      const svcDateEnd = fields.showServiceDate ? fields.serviceDateEnd || null : null;

      if (invoice) {
        const patch: InvoiceUpdateInput = {
          recipientName: fields.recipientName.trim(),
          recipientEmail: fields.recipientEmail.trim() || null,
          recipientAddressLine1: fields.addressLine1.trim() || null,
          recipientAddressLine2: fields.addressLine2.trim() || null,
          recipientPostalCode: fields.postalCode.trim() || null,
          recipientCity: fields.city.trim() || null,
          serviceDate: svcDate,
          serviceDateEnd: svcDateEnd,
          lineItems,
          taxRatePercent: fields.taxRatePercent,
          paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
          paymentMethod: fields.paymentMethod,
          notes: fields.notes.trim() || null,
        };
        return invoicesAdminApi.update(slug, invoice.id, patch);
      }

      const input: InvoiceCreateInput = {
        recipientName: fields.recipientName.trim(),
        customerType: fields.customerType,
        lineItems,
        taxRatePercent: fields.taxRatePercent,
        paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
        paymentMethod: fields.paymentMethod,
      };
      if (fields.recipientEmail.trim()) input.recipientEmail = fields.recipientEmail.trim();
      if (fields.addressLine1.trim()) input.recipientAddressLine1 = fields.addressLine1.trim();
      if (fields.addressLine2.trim()) input.recipientAddressLine2 = fields.addressLine2.trim();
      if (fields.postalCode.trim()) input.recipientPostalCode = fields.postalCode.trim();
      if (fields.city.trim()) input.recipientCity = fields.city.trim();
      if (svcDate) input.serviceDate = svcDate;
      if (svcDateEnd) input.serviceDateEnd = svcDateEnd;
      if (fields.notes.trim()) input.notes = fields.notes.trim();
      return invoicesAdminApi.create(targetSlug, input);
    },
    onSuccess: () => {
      // A new invoice may target a brand other than the one in view — switch to
      // it so the freshly-created draft shows up in the (brand-scoped) list.
      if (!isEdit && createSlug !== slug) {
        const created = projects.find((p) => p.companySlug === createSlug);
        if (created) setActiveProjectId(created.id);
      }
      onSaved();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-5 overflow-y-auto bg-card p-5 text-foreground sm:max-w-lg"
      >
        <div className="pr-8">
          <SheetTitle className="not-sr-only font-serif text-xl tracking-tight">
            {invoice
              ? `${t('invoices.edit')} — ${invoiceNumber(invoice)}`
              : t('invoices.newInvoice')}
          </SheetTitle>
          <SheetDescription className="not-sr-only text-sm text-muted-foreground">
            {t('invoices.subtitle')}
          </SheetDescription>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          {!isEdit ? (
            <FormField
              label={t('invoices.form.brand')}
              hint={t('invoices.form.brandHint')}
              required
            >
              <Select
                className="h-11 md:h-9"
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.companySlug} value={p.companySlug}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label={t('invoices.form.recipientName')} required>
            <Input
              className="h-11 md:h-9"
              value={fields.recipientName}
              onChange={(e) => setField('recipientName', e.target.value)}
            />
          </FormField>
          <FormField label={t('invoices.form.recipientEmail')}>
            <Input
              type="email"
              className="h-11 md:h-9"
              value={fields.recipientEmail}
              onChange={(e) => setField('recipientEmail', e.target.value)}
              onBlur={() => void maybePrefillTermFromCustomer()}
            />
          </FormField>
          <FormField
            label={t('invoices.form.addressLine1')}
            hint={t('invoices.form.requiredForIssue')}
          >
            <AddressAutocomplete
              className="h-11 md:h-9"
              value={fields.addressLine1}
              onChange={(v) => setField('addressLine1', v)}
              onPick={(a) => {
                if (a.postcode) setField('postalCode', a.postcode);
                if (a.city) setField('city', a.city);
              }}
            />
          </FormField>
          <FormField label={t('invoices.form.addressLine2')}>
            <Input
              className="h-11 md:h-9"
              value={fields.addressLine2}
              onChange={(e) => setField('addressLine2', e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label={t('invoices.form.postalCode')}
              hint={t('invoices.form.requiredForIssue')}
            >
              <Input
                className="h-11 md:h-9"
                inputMode="numeric"
                value={fields.postalCode}
                onChange={(e) => setField('postalCode', e.target.value)}
              />
            </FormField>
            <FormField label={t('invoices.form.city')} hint={t('invoices.form.requiredForIssue')}>
              <Input
                className="h-11 md:h-9"
                value={fields.city}
                onChange={(e) => setField('city', e.target.value)}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={fields.showServiceDate}
              onChange={(e) => setField('showServiceDate', e.target.checked)}
            />
            {t('invoices.form.showServiceDate')}
          </label>
          {fields.showServiceDate ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('invoices.form.serviceDate')}>
                <Input
                  type="date"
                  className="h-11 md:h-9"
                  value={fields.serviceDate}
                  onChange={(e) => setField('serviceDate', e.target.value)}
                />
              </FormField>
              <FormField
                label={t('invoices.form.serviceDateEnd')}
                hint={t('invoices.form.serviceDateEndHint')}
              >
                <Input
                  type="date"
                  className="h-11 md:h-9"
                  value={fields.serviceDateEnd}
                  onChange={(e) => setField('serviceDateEnd', e.target.value)}
                />
              </FormField>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('invoices.form.customerType')}>
              <Select
                value={fields.customerType}
                disabled={isEdit}
                onChange={(e) => setField('customerType', e.target.value as 'b2c' | 'b2b')}
              >
                <option value="b2c">B2C</option>
                <option value="b2b">B2B</option>
              </Select>
            </FormField>
            <FormField label={t('invoices.form.taxRate')}>
              <Select
                value={String(fields.taxRatePercent)}
                onChange={(e) =>
                  setField('taxRatePercent', Number(e.target.value) as InvoiceTaxRate)
                }
              >
                <option value="0">{t('invoices.form.taxRate0')}</option>
                <option value="7">{t('invoices.form.taxRate7')}</option>
                <option value="19">{t('invoices.form.taxRate19')}</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('invoices.form.paymentMethod')}>
              <Select
                value={fields.paymentMethod}
                onChange={(e) => setField('paymentMethod', e.target.value as InvoicePaymentMethod)}
              >
                <option value="transfer">{t('invoices.form.paymentTransfer')}</option>
                <option value="card">{t('invoices.form.paymentCard')}</option>
                <option value="cash">{t('invoices.form.paymentCash')}</option>
              </Select>
            </FormField>
            <FormField
              label={t('invoices.form.paymentTerms')}
              hint={
                fields.paymentMethod !== 'transfer' ? t('invoices.form.paidNoTerms') : undefined
              }
            >
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className="h-11 md:h-9"
                disabled={fields.paymentMethod !== 'transfer'}
                value={fields.paymentTermsDays}
                onChange={(e) => {
                  setTermTouched(true);
                  setField('paymentTermsDays', e.target.value);
                }}
              />
            </FormField>
          </div>

          <LineItemsEditor
            lines={lines}
            onLinesChange={setLines}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            taxRatePercent={fields.taxRatePercent}
          />

          <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t('invoices.form.subtotal')}</span>
              <span className="tabular-nums">{formatEur(totals.subtotal, bcp47)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('invoices.form.tax')} ({fields.taxRatePercent} %)
              </span>
              <span className="tabular-nums">{formatEur(totals.tax, bcp47)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold">
              <span className="text-xs uppercase tracking-wide">{t('invoices.form.total')}</span>
              <span className="tabular-nums">{formatEur(totals.total, bcp47)}</span>
            </div>
          </div>

          <FormField label={t('invoices.form.notes')}>
            <Textarea
              rows={3}
              value={fields.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </FormField>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 md:min-h-9"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="min-h-11 flex-1 md:min-h-9"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isEdit ? t('invoices.form.save') : t('invoices.form.create')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
