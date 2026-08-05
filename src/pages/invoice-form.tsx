import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { LineItemsEditor } from '@/components/line-items-editor';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  invoicesAdminApi,
  type InvoiceCreateInput,
  type InvoiceLineItem,
  type InvoicePaymentMethod,
  type InvoiceRow,
  type InvoiceTaxRate,
  type InvoiceUpdateInput,
} from '@/lib/api';
import {
  CRAFTSMAN_DEFAULT_VAT_RATE,
  craftsmanNoteText,
  craftsmanVatFromGross,
} from '@/lib/craftsman';
import {
  centsToInput,
  computeSubtotalCents,
  emptyLine,
  lineNetCents,
  toCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';
import { usePageTitle } from '@/lib/use-page-title';

// Cent-precision money formatting (utils' formatCurrency rounds to whole euros).
function formatEur(cents: number, bcp47: string, currency = 'EUR'): string {
  return (cents / 100).toLocaleString(bcp47, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

/**
 * Seed values for a brand-new invoice, handed over through router state by the
 * pages that already know the recipient (e.g. customer detail), so the operator
 * doesn't retype name/email/address. Ignored in edit mode.
 */
export type InvoicePrefill = {
  recipientName?: string;
  /** B2B: company line above the recipient name. */
  recipientCompany?: string;
  /** B2B: USt-IdNr. of the recipient. */
  recipientVatId?: string;
  recipientEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  customerType?: 'b2c' | 'b2b';
  paymentTermsDays?: number | null;
};

interface FormState {
  recipientName: string;
  recipientCompany: string;
  recipientVatId: string;
  recipientEmail: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  subject: string;
  serviceDate: string;
  serviceDateEnd: string;
  showServiceDate: boolean;
  customerType: 'b2c' | 'b2b';
  taxRatePercent: InvoiceTaxRate;
  paymentTermsDays: string;
  paymentMethod: InvoicePaymentMethod;
  notes: string;
  craftsmanService: boolean;
  laborGrossEur: string;
  laborVatEur: string;
  /** Hand-edited §35a wording; empty means "use the composed sentence". */
  craftsmanNote: string;
}

function emptyForm(prefill?: InvoicePrefill): FormState {
  return {
    recipientName: prefill?.recipientName ?? '',
    recipientCompany: prefill?.recipientCompany ?? '',
    recipientVatId: prefill?.recipientVatId ?? '',
    recipientEmail: prefill?.recipientEmail ?? '',
    addressLine1: prefill?.addressLine1 ?? '',
    addressLine2: prefill?.addressLine2 ?? '',
    postalCode: prefill?.postalCode ?? '',
    city: prefill?.city ?? '',
    subject: '',
    serviceDate: '',
    serviceDateEnd: '',
    showServiceDate: true,
    customerType: prefill?.customerType ?? 'b2c',
    taxRatePercent: 19,
    paymentTermsDays: String(prefill?.paymentTermsDays ?? 7),
    paymentMethod: 'transfer',
    notes: '',
    craftsmanService: false,
    laborGrossEur: '',
    laborVatEur: '',
    craftsmanNote: '',
  };
}

function toForm(invoice: InvoiceRow): FormState {
  return {
    recipientName: invoice.recipientName,
    recipientCompany: invoice.recipientCompany ?? '',
    recipientVatId: invoice.recipientVatId ?? '',
    recipientEmail: invoice.recipientEmail ?? '',
    addressLine1: invoice.recipientAddressLine1 ?? '',
    addressLine2: invoice.recipientAddressLine2 ?? '',
    postalCode: invoice.recipientPostalCode ?? '',
    city: invoice.recipientCity ?? '',
    subject: invoice.subject ?? '',
    serviceDate: invoice.serviceDate ?? '',
    serviceDateEnd: invoice.serviceDateEnd ?? '',
    // Only show the Leistungsdatum block if a date is already set.
    showServiceDate: Boolean(invoice.serviceDate),
    customerType: invoice.customerType,
    taxRatePercent: invoice.taxRatePercent as InvoiceTaxRate,
    paymentTermsDays: String(invoice.paymentTermsDays),
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes ?? '',
    craftsmanService: invoice.craftsmanService,
    laborGrossEur: invoice.laborGrossCents != null ? centsToInput(invoice.laborGrossCents) : '',
    laborVatEur: invoice.laborVatCents != null ? centsToInput(invoice.laborVatCents) : '',
    craftsmanNote: invoice.craftsmanNote ?? '',
  };
}

function toLines(invoice: InvoiceRow): LineDraft[] {
  if (invoice.lineItems.length === 0) return [emptyLine()];
  return invoice.lineItems.map((li) => ({
    label: li.label,
    note: li.note ?? '',
    quantity: String(li.quantity),
    unitPriceEur: (li.unitPriceCents / 100).toFixed(2),
    isPackage: li.isPackage ?? false,
  }));
}

export function InvoiceFormPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands, projects, setActiveProjectId } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const prefill = (location.state as { prefill?: InvoicePrefill } | null)?.prefill;

  const id = params.id ? Number(params.id) : null;
  const isEdit = id != null;
  const slug = activeProject.companySlug;

  // Which brand a new invoice belongs to — drives the tenant it lands in and
  // therefore the number prefix (HT-, CL-, TR-). An existing invoice can't be
  // moved to another brand's ledger, so this is create-only.
  const [createSlug, setCreateSlug] = useState<CompanySlug>(slug);
  const targetSlug = isEdit ? slug : createSlug;

  const [form, setForm] = useState<FormState>(() => emptyForm(prefill));
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [priceMode, setPriceMode] = useState<PriceMode>('net');
  const [formError, setFormError] = useState<string | null>(null);
  // Suppresses the customer-default auto-fill once the operator picked a term.
  const [termTouched, setTermTouched] = useState(false);
  // The VAT share and the §35a sentence auto-follow the amounts until edited.
  const [vatTouched, setVatTouched] = useState(false);
  const [noteTouched, setNoteTouched] = useState(false);

  usePageTitle(isEdit ? t('invoices.edit') : t('invoices.newInvoice'));

  const query = useQuery({
    queryKey: ['invoice', slug, id] as const,
    enabled: isEdit && !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => invoicesAdminApi.get(slug, id!, signal),
  });

  // Fill the form from the loaded record once, during render (no effect needed).
  const loaded = query.data?.invoice;
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  if (loaded && hydratedFor !== loaded.id) {
    setHydratedFor(loaded.id);
    setForm(toForm(loaded));
    setLines(toLines(loaded));
    setVatTouched(loaded.laborVatCents != null);
    // A stored wording that differs from the composed one was hand-edited —
    // keep it as the operator's text instead of silently regenerating it.
    setNoteTouched(
      Boolean(loaded.craftsmanNote) &&
        loaded.craftsmanNote !==
          craftsmanNoteText(loaded.laborGrossCents ?? 0, loaded.laborVatCents),
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Best-effort: pull the recipient customer's default payment term. */
  async function maybePrefillTermFromCustomer() {
    if (isEdit || termTouched) return;
    const email = form.recipientEmail.trim().toLowerCase();
    if (!email) return;
    try {
      const res = await customersAdminApi.list(targetSlug, { email, limit: 1 });
      const term = res.customers[0]?.defaultPaymentTermsDays;
      if (term != null && !termTouched) set('paymentTermsDays', String(term));
    } catch {
      // ignore lookup failures — the field keeps its current value
    }
  }

  const totals = useMemo(() => {
    const subtotal = computeSubtotalCents(lines, priceMode, form.taxRatePercent);
    const tax = Math.round((subtotal * form.taxRatePercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, form.taxRatePercent, priceMode]);

  // §35a: the amounts, and the sentence exactly as it will be printed.
  const craftsman = useMemo(() => {
    const grossCents = toCents(form.laborGrossEur);
    const autoVatCents = craftsmanVatFromGross(
      grossCents,
      form.taxRatePercent > 0 ? form.taxRatePercent : CRAFTSMAN_DEFAULT_VAT_RATE,
    );
    const vatCents = vatTouched ? toCents(form.laborVatEur) : autoVatCents;
    const autoNote = craftsmanNoteText(grossCents, vatCents);
    return {
      grossCents,
      vatCents,
      autoVatCents,
      autoNote,
      /** What actually gets stored + printed. */
      note: noteTouched && form.craftsmanNote.trim() ? form.craftsmanNote : autoNote,
      // Only judge the labour share against a total that exists — the operator
      // may well fill this block before adding the line items.
      error:
        grossCents <= 0
          ? t('invoices.form.craftsmanGrossMissing')
          : totals.total > 0 && grossCents > totals.total
            ? t('invoices.form.craftsmanGrossTooHigh')
            : vatCents > grossCents
              ? t('invoices.form.craftsmanVatTooHigh')
              : null,
    };
  }, [
    form.laborGrossEur,
    form.laborVatEur,
    form.craftsmanNote,
    form.taxRatePercent,
    vatTouched,
    noteTouched,
    totals.total,
    t,
  ]);

  const save = useMutation({
    mutationFn: () => {
      const lineItems: InvoiceLineItem[] = lines.map((l) => ({
        label: l.label.trim(),
        quantity: toQuantity(l.quantity) || 1,
        unitPriceCents: lineNetCents(l, priceMode, form.taxRatePercent),
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
        ...(l.isPackage ? { isPackage: true } : {}),
      }));
      const paymentTermsDays = Number(form.paymentTermsDays);
      // Leistungsdatum only when the toggle is on; otherwise not stored/shown.
      const svcDate = form.showServiceDate ? form.serviceDate || null : null;
      const svcDateEnd = form.showServiceDate ? form.serviceDateEnd || null : null;
      // Always send the sentence we displayed — what you read is what prints.
      const craftsmanPayload = form.craftsmanService
        ? {
            laborGrossCents: craftsman.grossCents,
            laborVatCents: craftsman.vatCents,
            craftsmanNote: craftsman.note,
          }
        : {};

      if (isEdit) {
        const patch: InvoiceUpdateInput = {
          recipientName: form.recipientName.trim(),
          recipientCompany: form.recipientCompany.trim() || null,
          recipientVatId: form.recipientVatId.trim() || null,
          recipientEmail: form.recipientEmail.trim() || null,
          recipientAddressLine1: form.addressLine1.trim() || null,
          recipientAddressLine2: form.addressLine2.trim() || null,
          recipientPostalCode: form.postalCode.trim() || null,
          recipientCity: form.city.trim() || null,
          subject: form.subject.trim() || null,
          serviceDate: svcDate,
          serviceDateEnd: svcDateEnd,
          lineItems,
          taxRatePercent: form.taxRatePercent,
          paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
          paymentMethod: form.paymentMethod,
          notes: form.notes.trim() || null,
          // Always sent, so unticking the box clears the stored §35a block.
          craftsmanService: form.craftsmanService,
          ...craftsmanPayload,
        };
        return invoicesAdminApi.update(slug, id!, patch);
      }

      const input: InvoiceCreateInput = {
        recipientName: form.recipientName.trim(),
        customerType: form.customerType,
        lineItems,
        taxRatePercent: form.taxRatePercent,
        paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
        paymentMethod: form.paymentMethod,
      };
      if (form.recipientCompany.trim()) input.recipientCompany = form.recipientCompany.trim();
      if (form.recipientVatId.trim()) input.recipientVatId = form.recipientVatId.trim();
      if (form.recipientEmail.trim()) input.recipientEmail = form.recipientEmail.trim();
      if (form.addressLine1.trim()) input.recipientAddressLine1 = form.addressLine1.trim();
      if (form.addressLine2.trim()) input.recipientAddressLine2 = form.addressLine2.trim();
      if (form.postalCode.trim()) input.recipientPostalCode = form.postalCode.trim();
      if (form.city.trim()) input.recipientCity = form.city.trim();
      if (form.subject.trim()) input.subject = form.subject.trim();
      if (svcDate) input.serviceDate = svcDate;
      if (svcDateEnd) input.serviceDateEnd = svcDateEnd;
      if (form.notes.trim()) input.notes = form.notes.trim();
      if (form.craftsmanService) {
        input.craftsmanService = true;
        Object.assign(input, craftsmanPayload);
      }
      return invoicesAdminApi.create(targetSlug, input);
    },
    onSuccess: (res) => {
      // A new invoice may target a brand other than the one in view — switch to
      // it so the freshly-created draft is visible in the brand-scoped list.
      if (!isEdit && createSlug !== slug) {
        const created = projects.find((p) => p.companySlug === createSlug);
        if (created) setActiveProjectId(created.id);
      }
      void queryClient.invalidateQueries({ queryKey: ['invoices', targetSlug] });
      void queryClient.invalidateQueries({ queryKey: ['invoice', targetSlug, res.invoice.id] });
      toast.success(isEdit ? t('invoices.form.save') : t('invoices.form.create'));
      navigate(`/rechnungen/${res.invoice.id}`);
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!form.recipientName.trim()) {
      setFormError(t('invoices.form.recipientNameRequired'));
      return;
    }
    if (form.craftsmanService && craftsman.error) {
      setFormError(craftsman.error);
      return;
    }
    save.mutate();
  }

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('invoices.backToList')} />
        <EmptyState message={t('invoices.selectBrandFirst')} />
      </div>
    );
  }

  if (isEdit && query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('invoices.backToList')} />
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (isEdit && (query.error || !query.data)) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('invoices.backToList')} />
        <ErrorNote message={query.error ? errMessage(query.error) : t('invoices.notFound')} />
      </div>
    );
  }

  // GoBD: an issued invoice is content-frozen — never offer its form.
  if (isEdit && loaded && loaded.status !== 'draft') {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('invoices.backToList')} />
        <ErrorNote message={t('invoices.immutableHint')} />
        <Button asChild variant="outline" className="self-start">
          <Link to={`/rechnungen/${id}`}>{t('invoices.details')}</Link>
        </Button>
      </div>
    );
  }

  const invoiceLabel = loaded ? (loaded.number ?? `#${loaded.id}`) : t('invoices.newInvoice');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <PageHeading
        title={isEdit ? `${t('invoices.edit')} — ${invoiceLabel}` : t('invoices.newInvoice')}
        subtitle={t('invoices.subtitle')}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <Link to="/rechnungen" className="hover:underline">
              {t('invoices.title')}
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{invoiceLabel}</span>
          </>
        }
      />

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Section title={t('invoices.form.sectionRecipient')}>
          <div className="grid gap-4">
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
                value={form.recipientName}
                onChange={(e) => set('recipientName', e.target.value)}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('invoices.form.recipientCompany')}
                hint={t('invoices.form.recipientCompanyHint')}
              >
                <Input
                  className="h-11 md:h-9"
                  value={form.recipientCompany}
                  onChange={(e) => set('recipientCompany', e.target.value)}
                />
              </FormField>
              <FormField label={t('invoices.form.recipientVatId')}>
                <Input
                  className="h-11 uppercase md:h-9"
                  value={form.recipientVatId}
                  onChange={(e) => set('recipientVatId', e.target.value)}
                  placeholder="DE123456789"
                />
              </FormField>
            </div>
            <FormField label={t('invoices.form.recipientEmail')}>
              <Input
                type="email"
                className="h-11 md:h-9"
                value={form.recipientEmail}
                onChange={(e) => set('recipientEmail', e.target.value)}
                onBlur={() => void maybePrefillTermFromCustomer()}
              />
            </FormField>
            <FormField
              label={t('invoices.form.addressLine1')}
              hint={t('invoices.form.requiredForIssue')}
            >
              <AddressAutocomplete
                className="h-11 md:h-9"
                value={form.addressLine1}
                onChange={(v) => set('addressLine1', v)}
                onPick={(a) => {
                  if (a.postcode) set('postalCode', a.postcode);
                  if (a.city) set('city', a.city);
                }}
              />
            </FormField>
            <FormField label={t('invoices.form.addressLine2')}>
              <Input
                className="h-11 md:h-9"
                value={form.addressLine2}
                onChange={(e) => set('addressLine2', e.target.value)}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('invoices.form.postalCode')}
                hint={t('invoices.form.requiredForIssue')}
              >
                <Input
                  className="h-11 md:h-9"
                  inputMode="numeric"
                  value={form.postalCode}
                  onChange={(e) => set('postalCode', e.target.value)}
                />
              </FormField>
              <FormField label={t('invoices.form.city')} hint={t('invoices.form.requiredForIssue')}>
                <Input
                  className="h-11 md:h-9"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                />
              </FormField>
            </div>
          </div>
        </Section>

        <Section title={t('invoices.form.sectionInvoice')}>
          <div className="grid gap-4">
            <FormField label={t('invoices.form.subject')} hint={t('invoices.form.subjectHint')}>
              <Input
                className="h-11 md:h-9"
                maxLength={200}
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.showServiceDate}
                onChange={(e) => set('showServiceDate', e.target.checked)}
              />
              {t('invoices.form.showServiceDate')}
            </label>
            {form.showServiceDate ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('invoices.form.serviceDate')}>
                  <Input
                    type="date"
                    className="h-11 md:h-9"
                    value={form.serviceDate}
                    onChange={(e) => set('serviceDate', e.target.value)}
                  />
                </FormField>
                <FormField
                  label={t('invoices.form.serviceDateEnd')}
                  hint={t('invoices.form.serviceDateEndHint')}
                >
                  <Input
                    type="date"
                    className="h-11 md:h-9"
                    value={form.serviceDateEnd}
                    onChange={(e) => set('serviceDateEnd', e.target.value)}
                  />
                </FormField>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('invoices.form.customerType')}>
                <Select
                  value={form.customerType}
                  disabled={isEdit}
                  onChange={(e) => set('customerType', e.target.value as 'b2c' | 'b2b')}
                >
                  <option value="b2c">B2C</option>
                  <option value="b2b">B2B</option>
                </Select>
              </FormField>
              <FormField label={t('invoices.form.taxRate')}>
                <Select
                  value={String(form.taxRatePercent)}
                  onChange={(e) => set('taxRatePercent', Number(e.target.value) as InvoiceTaxRate)}
                >
                  <option value="0">{t('invoices.form.taxRate0')}</option>
                  <option value="7">{t('invoices.form.taxRate7')}</option>
                  <option value="19">{t('invoices.form.taxRate19')}</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('invoices.form.paymentMethod')}>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => set('paymentMethod', e.target.value as InvoicePaymentMethod)}
                >
                  <option value="transfer">{t('invoices.form.paymentTransfer')}</option>
                  <option value="card">{t('invoices.form.paymentCard')}</option>
                  <option value="cash">{t('invoices.form.paymentCash')}</option>
                </Select>
              </FormField>
              <FormField
                label={t('invoices.form.paymentTerms')}
                hint={
                  form.paymentMethod !== 'transfer' ? t('invoices.form.paidNoTerms') : undefined
                }
              >
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="h-11 md:h-9"
                  disabled={form.paymentMethod !== 'transfer'}
                  value={form.paymentTermsDays}
                  onChange={(e) => {
                    setTermTouched(true);
                    set('paymentTermsDays', e.target.value);
                  }}
                />
              </FormField>
            </div>
          </div>
        </Section>

        <Section title={t('invoices.form.lineItems')}>
          <LineItemsEditor
            lines={lines}
            onLinesChange={setLines}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            taxRatePercent={form.taxRatePercent}
          />
          <div className="mt-4 grid gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t('invoices.form.subtotal')}</span>
              <span className="tabular-nums">{formatEur(totals.subtotal, bcp47)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('invoices.form.tax')} ({form.taxRatePercent} %)
              </span>
              <span className="tabular-nums">{formatEur(totals.tax, bcp47)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold">
              <span className="text-xs uppercase tracking-wide">{t('invoices.form.total')}</span>
              <span className="tabular-nums">{formatEur(totals.total, bcp47)}</span>
            </div>
          </div>
        </Section>

        {/* §35a EStG — off by default; ticking it prints the deductible-labour
            paragraph above the closing line. */}
        <Section title={t('invoices.form.craftsman')} hint={t('invoices.form.craftsmanHint')}>
          <div className="grid gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.craftsmanService}
                onChange={(e) => set('craftsmanService', e.target.checked)}
              />
              {t('invoices.form.craftsmanEnable')}
            </label>

            {form.craftsmanService ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label={t('invoices.form.laborGross')}
                    hint={t('invoices.form.laborGrossHint')}
                    required
                  >
                    <Input
                      className="h-11 md:h-9"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={form.laborGrossEur}
                      onChange={(e) => set('laborGrossEur', e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label={t('invoices.form.laborVat')}
                    hint={
                      vatTouched
                        ? t('invoices.form.laborVatManual')
                        : t('invoices.form.laborVatAuto', {
                            rate: String(
                              form.taxRatePercent > 0
                                ? form.taxRatePercent
                                : CRAFTSMAN_DEFAULT_VAT_RATE,
                            ),
                          })
                    }
                  >
                    <Input
                      className="h-11 md:h-9"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={vatTouched ? form.laborVatEur : centsToInput(craftsman.autoVatCents)}
                      onChange={(e) => {
                        setVatTouched(true);
                        set('laborVatEur', e.target.value);
                      }}
                    />
                  </FormField>
                </div>

                {/* The printed wording. Edited text is stored verbatim, so the
                    operator can phrase it per case (e.g. incl. Fahrtkosten). */}
                <FormField
                  label={t('invoices.form.craftsmanText')}
                  hint={t('invoices.form.craftsmanTextHint')}
                >
                  <Textarea
                    rows={3}
                    value={craftsman.note}
                    onChange={(e) => {
                      setNoteTouched(true);
                      set('craftsmanNote', e.target.value);
                    }}
                  />
                </FormField>
                {noteTouched ? (
                  <button
                    type="button"
                    className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      setNoteTouched(false);
                      set('craftsmanNote', '');
                    }}
                  >
                    {t('invoices.form.craftsmanTextReset')}
                  </button>
                ) : null}
                {craftsman.error ? (
                  <p className="text-xs text-destructive">{craftsman.error}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </Section>

        <Section title={t('invoices.form.notes')} hint={t('invoices.form.notesHint')}>
          <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Section>

        {formError ? <ErrorNote message={formError} /> : null}

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
          <Button type="button" variant="ghost" className="h-11 sm:h-9" asChild>
            <Link to={isEdit ? `/rechnungen/${id}` : '/rechnungen'}>{t('common.cancel')}</Link>
          </Button>
          <Button
            type="submit"
            className="h-11 flex-1 sm:h-9 sm:flex-none"
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {isEdit ? t('invoices.form.save') : t('invoices.form.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="font-serif text-base font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/rechnungen"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
