import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Save } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { LineItemsEditor, LineItemsTotals } from '@/components/line-items-editor';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
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
  grossFromNetCents,
  lineNetCents,
  netFromGrossCents,
  toCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';

export type InvoicePrefill = {
  /** Links the draft to this customer of the active brand, even without an email. */
  customerId?: number;
  recipientName?: string;
  recipientCompany?: string;
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
  /** Paketrechnung: positions print without Einzelpreis/Betrag; the whole job is priced once in packagePriceEur. */
  packageMode: boolean;
  /** As typed; net or gross per the active priceMode. */
  packagePriceEur: string;
  craftsmanService: boolean;
  laborGrossEur: string;
  laborVatEur: string;
  /** Hand-edited §35a wording; empty means use the composed sentence. */
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
    packageMode: false,
    packagePriceEur: '',
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
    showServiceDate: Boolean(invoice.serviceDate),
    customerType: invoice.customerType,
    taxRatePercent: invoice.taxRatePercent as InvoiceTaxRate,
    paymentTermsDays: String(invoice.paymentTermsDays),
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes ?? '',
    packageMode: invoice.packageMode,
    // The stored subtotal is net, the form's default price mode.
    packagePriceEur: invoice.packageMode ? centsToInput(invoice.subtotalCents) : '',
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
  const { activeProject, isAllBrands, projects, setActiveProjectId } = useProject();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const prefill = (location.state as { prefill?: InvoicePrefill } | null)?.prefill;

  const id = params.id ? Number(params.id) : null;
  const isEdit = id != null;
  const slug = activeProject.companySlug;

  // Create-only: decides the tenant and number prefix (HT-, CL-, TR-); an invoice can't move to another ledger.
  const [createSlug, setCreateSlug] = useState<CompanySlug>(slug);
  const targetSlug = isEdit ? slug : createSlug;

  const [form, setForm] = useState<FormState>(() => emptyForm(prefill));
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [priceMode, setPriceMode] = useState<PriceMode>('net');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    recipientName?: string;
    recipientEmail?: string;
    packagePrice?: string;
  }>({});
  const recipientNameRef = useRef<HTMLInputElement>(null);
  const recipientEmailRef = useRef<HTMLInputElement>(null);
  const packagePriceRef = useRef<HTMLInputElement>(null);
  const laborGrossRef = useRef<HTMLInputElement>(null);
  const laborVatRef = useRef<HTMLInputElement>(null);
  const [termTouched, setTermTouched] = useState(false);
  const [vatTouched, setVatTouched] = useState(false);
  const [noteTouched, setNoteTouched] = useState(false);

  usePageTitle(isEdit ? t('invoices.edit') : t('invoices.newInvoice'));

  const query = useQuery({
    queryKey: ['invoice', slug, id] as const,
    enabled: isEdit && !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => invoicesAdminApi.get(slug, id!, signal),
  });

  const loaded = query.data?.invoice;
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ form: emptyForm(prefill), lines: [emptyLine()] }),
  );
  const dirty = JSON.stringify({ form, lines }) !== baseline;
  const { blocker, allowLeave } = useLeaveGuard(dirty);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  if (loaded && hydratedFor !== loaded.id) {
    setHydratedFor(loaded.id);
    setForm(toForm(loaded));
    setLines(toLines(loaded));
    setBaseline(JSON.stringify({ form: toForm(loaded), lines: toLines(loaded) }));
    setVatTouched(loaded.laborVatCents != null);
    // A stored wording that differs from the composed one was hand-edited: keep it, don't regenerate.
    setNoteTouched(
      Boolean(loaded.craftsmanNote) &&
        loaded.craftsmanNote !==
          craftsmanNoteText(loaded.laborGrossCents ?? 0, loaded.laborVatCents),
    );
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'recipientName' && fieldErrors.recipientName) {
      setFieldErrors((p) => ({ ...p, recipientName: undefined }));
    }
    if (key === 'recipientEmail' && fieldErrors.recipientEmail) {
      setFieldErrors((p) => ({ ...p, recipientEmail: undefined }));
    }
    if ((key === 'packagePriceEur' || key === 'packageMode') && fieldErrors.packagePrice) {
      setFieldErrors((p) => ({ ...p, packagePrice: undefined }));
    }
  };

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

  /** The entered amount as net cents, backing VAT out when typed gross. */
  const netCentsOf = (eur: string) => {
    const cents = toCents(eur);
    return priceMode === 'gross' ? netFromGrossCents(cents, form.taxRatePercent) : cents;
  };

  const totals = useMemo(() => {
    const subtotal = form.packageMode
      ? netCentsOf(form.packagePriceEur)
      : computeSubtotalCents(lines, priceMode, form.taxRatePercent);
    const tax = Math.round((subtotal * form.taxRatePercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- netCentsOf is derived from the deps below
  }, [lines, form.taxRatePercent, form.packageMode, form.packagePriceEur, priceMode]);

  function switchPackagePriceMode(next: PriceMode) {
    if (next === priceMode) return;
    const cents = toCents(form.packagePriceEur);
    if (form.packagePriceEur.trim() && cents !== 0) {
      set(
        'packagePriceEur',
        centsToInput(
          next === 'gross'
            ? grossFromNetCents(cents, form.taxRatePercent)
            : netFromGrossCents(cents, form.taxRatePercent),
        ),
      );
    }
    setPriceMode(next);
  }

  const craftsman = useMemo(() => {
    const grossCents = toCents(form.laborGrossEur);
    const autoVatCents = craftsmanVatFromGross(
      grossCents,
      form.taxRatePercent > 0 ? form.taxRatePercent : CRAFTSMAN_DEFAULT_VAT_RATE,
    );
    const vatCents = vatTouched ? toCents(form.laborVatEur) : autoVatCents;
    const autoNote = craftsmanNoteText(grossCents, vatCents);
    const errorKey: DictKey | null =
      grossCents <= 0
        ? 'invoices.form.craftsmanGrossMissing'
        : totals.total > 0 && grossCents > totals.total
          ? 'invoices.form.craftsmanGrossTooHigh'
          : vatCents > grossCents
            ? 'invoices.form.craftsmanVatTooHigh'
            : null;
    return {
      grossCents,
      vatCents,
      autoVatCents,
      autoNote,
      note: noteTouched && form.craftsmanNote.trim() ? form.craftsmanNote : autoNote,
      error: errorKey ? t(errorKey) : null,
      errorField:
        errorKey === 'invoices.form.craftsmanVatTooHigh'
          ? ('vat' as const)
          : errorKey
            ? ('gross' as const)
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
        // Package positions never carry a price (the server enforces this too).
        unitPriceCents: form.packageMode ? 0 : lineNetCents(l, priceMode, form.taxRatePercent),
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
        ...(l.isPackage ? { isPackage: true } : {}),
      }));
      const paymentTermsDays = Number(form.paymentTermsDays);
      const svcDate = form.showServiceDate ? form.serviceDate || null : null;
      const svcDateEnd = form.showServiceDate ? form.serviceDateEnd || null : null;
      // Always send the displayed sentence: what you read is what prints.
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
          // Always sent so unticking turns it back into a priced invoice.
          packageMode: form.packageMode,
          ...(form.packageMode ? { packageNetCents: totals.subtotal } : {}),
          taxRatePercent: form.taxRatePercent,
          paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
          paymentMethod: form.paymentMethod,
          notes: form.notes.trim() || null,
          // Always sent so unticking clears the stored §35a block.
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
      // A customer id only means something inside its own brand's ledger.
      if (prefill?.customerId && targetSlug === slug) input.customerId = prefill.customerId;
      if (form.recipientCompany.trim()) input.recipientCompany = form.recipientCompany.trim();
      if (form.recipientVatId.trim()) input.recipientVatId = form.recipientVatId.trim();
      if (form.recipientEmail.trim()) input.recipientEmail = form.recipientEmail.trim();
      if (form.addressLine1.trim()) input.recipientAddressLine1 = form.addressLine1.trim();
      if (form.addressLine2.trim()) input.recipientAddressLine2 = form.addressLine2.trim();
      if (form.postalCode.trim()) input.recipientPostalCode = form.postalCode.trim();
      if (form.city.trim()) input.recipientCity = form.city.trim();
      if (form.packageMode) {
        input.packageMode = true;
        input.packageNetCents = totals.subtotal;
      }
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
      // Switch to the new invoice's brand so the draft shows in the brand-scoped list.
      if (!isEdit && createSlug !== slug) {
        const created = projects.find((p) => p.companySlug === createSlug);
        if (created) setActiveProjectId(created.id);
      }
      void queryClient.invalidateQueries({ queryKey: ['invoices', targetSlug] });
      void queryClient.invalidateQueries({ queryKey: ['invoice', targetSlug, res.invoice.id] });
      toast.success(isEdit ? t('invoices.form.saved') : t('invoices.form.created'));
      allowLeave();
      navigate(`/rechnungen/${res.invoice.id}`);
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!form.recipientName.trim()) {
      const message = t('invoices.form.recipientNameRequired');
      setFormError(message);
      setFieldErrors({ recipientName: message });
      recipientNameRef.current?.focus();
      return;
    }
    const email = form.recipientEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const message = t('invoices.form.recipientEmailInvalid');
      setFormError(message);
      setFieldErrors({ recipientEmail: message });
      recipientEmailRef.current?.focus();
      return;
    }
    // Package positions show no prices: a missing package price would be an invisible 0,00 € invoice.
    if (form.packageMode && totals.subtotal <= 0) {
      const message = t('invoices.form.packagePriceRequired');
      setFormError(message);
      setFieldErrors({ packagePrice: message });
      packagePriceRef.current?.focus();
      return;
    }
    if (form.craftsmanService && craftsman.error) {
      setFormError(craftsman.error);
      (craftsman.errorField === 'vat' ? laborVatRef : laborGrossRef).current?.focus();
      return;
    }
    save.mutate();
  }

  const backLink = (
    <BackLink to="/rechnungen" className="mb-3 self-start">
      {t('invoices.backToList')}
    </BackLink>
  );
  const pageTitle = isEdit ? t('invoices.edit') : t('invoices.newInvoice');

  if (isAllBrands || !canWrite) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <EmptyState
          variant="dashed"
          icon={<FileText aria-hidden="true" />}
          message={isAllBrands ? t('invoices.selectBrandFirst') : t('invoices.noPermission')}
        />
      </PageContainer>
    );
  }

  if (isEdit && query.isLoading) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  if (isEdit && (query.error || !query.data)) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <ErrorState
          error={query.error ?? new Error(t('invoices.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  // GoBD: an issued invoice is content-frozen; never offer its form (a neutral notice, not an error).
  if (isEdit && loaded && loaded.status !== 'draft') {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={`${t('invoices.edit')} — ${loaded.number ?? `#${loaded.id}`}`} />
        <Alert
          tone="neutral"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={`/rechnungen/${id}`}>{t('invoices.details')}</Link>
            </Button>
          }
        >
          {t('invoices.immutableHint')}
        </Alert>
      </PageContainer>
    );
  }

  const invoiceLabel = loaded ? (loaded.number ?? `#${loaded.id}`) : t('invoices.newInvoice');

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={isEdit ? `${t('invoices.edit')} — ${invoiceLabel}` : t('invoices.newInvoice')}
        subtitle={t('invoices.subtitle')}
        breadcrumb={[
          { label: activeProject.name },
          { label: t('invoices.title'), to: '/rechnungen' },
          ...(isEdit && loaded ? [{ label: invoiceLabel, to: `/rechnungen/${loaded.id}` }] : []),
          { label: isEdit ? t('invoices.edit') : t('invoices.newInvoice') },
        ]}
      />

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <SectionCard as="fieldset" title={t('invoices.form.sectionRecipient')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {!isEdit ? (
              <FormField
                label={t('invoices.form.brand')}
                hint={t('invoices.form.brandHint')}
                required
                className="sm:col-span-2"
              >
                <Select
                  value={createSlug}
                  onValueChange={setCreateSlug}
                  options={projects.map((p) => ({
                    value: p.companySlug,
                    label: p.name,
                    description: p.domain,
                  }))}
                />
              </FormField>
            ) : null}
            <FormField
              label={t('invoices.form.recipientName')}
              required
              error={fieldErrors.recipientName}
            >
              <Input
                ref={recipientNameRef}
                value={form.recipientName}
                onChange={(e) => set('recipientName', e.target.value)}
              />
            </FormField>
            <FormField label={t('invoices.form.recipientEmail')} error={fieldErrors.recipientEmail}>
              <Input
                ref={recipientEmailRef}
                type="email"
                value={form.recipientEmail}
                onChange={(e) => set('recipientEmail', e.target.value)}
                onBlur={() => void maybePrefillTermFromCustomer()}
              />
            </FormField>
            <FormField
              label={t('invoices.form.recipientCompany')}
              hint={t('invoices.form.recipientCompanyHint')}
            >
              <Input
                value={form.recipientCompany}
                onChange={(e) => set('recipientCompany', e.target.value)}
              />
            </FormField>
            <FormField label={t('invoices.form.recipientVatId')}>
              <Input
                className="uppercase"
                value={form.recipientVatId}
                onChange={(e) => set('recipientVatId', e.target.value)}
                placeholder="DE123456789"
              />
            </FormField>
            <FormField
              label={t('invoices.form.addressLine1')}
              hint={t('invoices.form.requiredForIssue')}
            >
              <AddressAutocomplete
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
                value={form.addressLine2}
                onChange={(e) => set('addressLine2', e.target.value)}
              />
            </FormField>
            <FormField
              label={t('invoices.form.postalCode')}
              hint={t('invoices.form.requiredForIssue')}
            >
              <Input
                inputMode="numeric"
                value={form.postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
              />
            </FormField>
            <FormField label={t('invoices.form.city')} hint={t('invoices.form.requiredForIssue')}>
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard as="fieldset" title={t('invoices.form.sectionInvoice')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('invoices.form.subject')}
              hint={t('invoices.form.subjectHint')}
              className="sm:col-span-2"
            >
              <Input
                maxLength={200}
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
              />
            </FormField>
            <label className="flex items-center gap-2 text-2sm text-foreground sm:col-span-2">
              <Checkbox
                checked={form.showServiceDate}
                onChange={(e) => set('showServiceDate', e.target.checked)}
              />
              {t('invoices.form.showServiceDate')}
            </label>
            {form.showServiceDate ? (
              <>
                <FormField label={t('invoices.form.serviceDate')}>
                  <DatePicker
                    value={form.serviceDate}
                    onValueChange={(v) => set('serviceDate', v)}
                  />
                </FormField>
                <FormField
                  label={t('invoices.form.serviceDateEnd')}
                  hint={t('invoices.form.serviceDateEndHint')}
                >
                  <DatePicker
                    value={form.serviceDateEnd}
                    onValueChange={(v) => set('serviceDateEnd', v)}
                  />
                </FormField>
              </>
            ) : null}
            <FormField label={t('invoices.form.customerType')}>
              <Select
                value={form.customerType}
                disabled={isEdit}
                onValueChange={(v) => set('customerType', v)}
                options={[
                  { value: 'b2c', label: 'B2C' },
                  { value: 'b2b', label: 'B2B' },
                ]}
              />
            </FormField>
            <FormField label={t('invoices.form.taxRate')}>
              <Select
                value={String(form.taxRatePercent)}
                onValueChange={(v) => set('taxRatePercent', Number(v) as InvoiceTaxRate)}
                options={[
                  { value: '0', label: t('invoices.form.taxRate0') },
                  { value: '7', label: t('invoices.form.taxRate7') },
                  { value: '19', label: t('invoices.form.taxRate19') },
                ]}
              />
            </FormField>
            <FormField label={t('invoices.form.paymentMethod')}>
              <Select<InvoicePaymentMethod>
                value={form.paymentMethod}
                onValueChange={(v) => set('paymentMethod', v)}
                options={[
                  { value: 'transfer', label: t('invoices.form.paymentTransfer') },
                  { value: 'card', label: t('invoices.form.paymentCard') },
                  { value: 'cash', label: t('invoices.form.paymentCash') },
                ]}
              />
            </FormField>
            <FormField
              label={t('invoices.form.paymentTerms')}
              hint={form.paymentMethod !== 'transfer' ? t('invoices.form.paidNoTerms') : undefined}
            >
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={form.paymentMethod !== 'transfer'}
                value={form.paymentTermsDays}
                onChange={(e) => {
                  setTermTouched(true);
                  set('paymentTermsDays', e.target.value);
                }}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard as="fieldset" title={t('invoices.form.lineItems')}>
          <label className="mb-4 flex items-start gap-2 text-2sm text-foreground">
            <Checkbox
              className="mt-0.5"
              checked={form.packageMode}
              onChange={(e) => set('packageMode', e.target.checked)}
            />
            <span>
              {t('invoices.form.packageMode')}
              <span className="block text-xs text-muted-foreground">
                {t('invoices.form.packageModeHint')}
              </span>
            </span>
          </label>

          <LineItemsEditor
            lines={lines}
            onLinesChange={setLines}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            taxRatePercent={form.taxRatePercent}
            hidePrices={form.packageMode}
            showTitle={false}
          />

          {form.packageMode ? (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary-soft p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('invoices.form.packagePrice')}
                </span>
                <SegmentedControl
                  size="sm"
                  label={t('invoices.form.priceMode')}
                  value={priceMode}
                  onValueChange={switchPackagePriceMode}
                  options={[
                    { value: 'net', label: t('invoices.form.priceNet') },
                    { value: 'gross', label: t('invoices.form.priceGross') },
                  ]}
                />
              </div>
              <FormField
                label={
                  priceMode === 'gross'
                    ? t('invoices.form.packagePriceGross')
                    : t('invoices.form.packagePriceNet')
                }
                hint={t('invoices.form.packagePriceHint')}
                required
                error={fieldErrors.packagePrice}
              >
                <Input
                  ref={packagePriceRef}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.packagePriceEur}
                  onChange={(e) => set('packagePriceEur', e.target.value)}
                />
              </FormField>
            </div>
          ) : null}

          <LineItemsTotals
            className="mt-4"
            subtotalCents={totals.subtotal}
            taxCents={totals.tax}
            totalCents={totals.total}
            taxRatePercent={form.taxRatePercent}
          />
        </SectionCard>

        {/* §35a EStG: off by default; ticking prints the deductible-labour paragraph above the closing line. */}
        <SectionCard
          as="fieldset"
          title={t('invoices.form.craftsman')}
          description={t('invoices.form.craftsmanHint')}
        >
          <div className="grid gap-4">
            <label className="flex items-center gap-2 text-2sm text-foreground">
              <Checkbox
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
                    error={craftsman.errorField === 'gross' ? craftsman.error : null}
                  >
                    <Input
                      ref={laborGrossRef}
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
                    error={craftsman.errorField === 'vat' ? craftsman.error : null}
                  >
                    <Input
                      ref={laborVatRef}
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

                {/* Printed wording; edited text is stored verbatim. */}
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
                    className="justify-self-start rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setNoteTouched(false);
                      set('craftsmanNote', '');
                    }}
                  >
                    {t('invoices.form.craftsmanTextReset')}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('invoices.form.notes')}
          description={t('invoices.form.notesHint')}
        >
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            aria-label={t('invoices.form.notes')}
          />
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={isEdit ? `/rechnungen/${id}` : '/rechnungen'}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}>
            <Save aria-hidden="true" />
            {isEdit ? t('invoices.form.save') : t('invoices.form.create')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
