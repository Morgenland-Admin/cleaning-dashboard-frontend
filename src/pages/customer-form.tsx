import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Building2, Loader2, Save, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type Customer,
  type CustomerChannel,
  type CustomerCreateInput,
  type CustomerLanguage,
  type CustomerSalutation,
  type CustomerType,
  type CustomerUpdateInput,
  type LoyaltyTier,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

const TIERS: LoyaltyTier[] = ['neukunde', 'stammkunde', 'premium'];
const SALUTATIONS: CustomerSalutation[] = ['herr', 'frau', 'divers', 'firma'];
const LANGUAGES: CustomerLanguage[] = ['de', 'en'];
const CHANNELS: CustomerChannel[] = ['email', 'phone', 'whatsapp', 'post'];

interface FormState {
  customerType: CustomerType;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  language: string;
  preferredChannel: string;
  website: string;
  companyName: string;
  jobPosition: string;
  department: string;
  vatId: string;
  taxNumber: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  customerNumber: string;
  externalNumber: string;
  loyaltyTier: LoyaltyTier;
  defaultPaymentTermsDays: string;
  tags: string;
  internalNotes: string;
  marketingOptIn: boolean;
}

const EMPTY_FORM: FormState = {
  customerType: 'private',
  salutation: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  language: '',
  preferredChannel: '',
  website: '',
  companyName: '',
  jobPosition: '',
  department: '',
  vatId: '',
  taxNumber: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  country: 'DE',
  customerNumber: '',
  externalNumber: '',
  loyaltyTier: 'neukunde',
  defaultPaymentTermsDays: '',
  tags: '',
  internalNotes: '',
  marketingOptIn: false,
};

/**
 * Split a legacy single-name value into first + last so records created before
 * the split fields existed can be corrected in place. Everything after the first
 * space is the last name ("Denise Charaf Eddine" → "Denise" + "Charaf Eddine").
 */
function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const gap = trimmed.indexOf(' ');
  if (gap === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, gap), lastName: trimmed.slice(gap + 1) };
}

function toForm(customer: Customer): FormState {
  // A company record keeps its name in companyName — never split that into a person.
  const fallback =
    !customer.firstName && !customer.lastName && !customer.companyName && customer.name
      ? splitName(customer.name)
      : { firstName: '', lastName: '' };
  return {
    customerType: customer.customerType ?? 'private',
    salutation: customer.salutation ?? '',
    firstName: customer.firstName ?? fallback.firstName,
    lastName: customer.lastName ?? fallback.lastName,
    email: customer.email,
    phone: customer.phone ?? '',
    dateOfBirth: customer.dateOfBirth ?? '',
    language: customer.language ?? '',
    preferredChannel: customer.preferredChannel ?? '',
    website: customer.website ?? '',
    companyName: customer.companyName ?? '',
    jobPosition: customer.jobPosition ?? '',
    department: customer.department ?? '',
    vatId: customer.vatId ?? '',
    taxNumber: customer.taxNumber ?? '',
    addressLine1: customer.addressLine1 ?? '',
    addressLine2: customer.addressLine2 ?? '',
    postalCode: customer.postalCode ?? '',
    city: customer.city ?? '',
    country: customer.country ?? 'DE',
    customerNumber: customer.customerNumber ?? '',
    externalNumber: customer.externalNumber ?? '',
    loyaltyTier: customer.loyaltyTier,
    defaultPaymentTermsDays:
      customer.defaultPaymentTermsDays != null ? String(customer.defaultPaymentTermsDays) : '',
    tags: (customer.tags ?? []).join(', '),
    internalNotes: customer.internalNotes ?? '',
    marketingOptIn: customer.marketingOptIn,
  };
}

/** Map the form to the API payload. Empty strings clear the field server-side. */
function toPayload(form: FormState): CustomerUpdateInput {
  const term = form.defaultPaymentTermsDays.trim();
  const termNumber = term === '' ? null : Number(term);
  const country = form.country.trim().toUpperCase();
  return {
    email: form.email.trim().toLowerCase(),
    customerType: form.customerType,
    salutation: (form.salutation || null) as CustomerSalutation | null,
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    dateOfBirth: form.dateOfBirth,
    language: (form.language || null) as CustomerLanguage | null,
    preferredChannel: (form.preferredChannel || null) as CustomerChannel | null,
    website: form.website,
    companyName: form.companyName,
    jobPosition: form.jobPosition,
    department: form.department,
    vatId: form.vatId,
    taxNumber: form.taxNumber,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    postalCode: form.postalCode,
    city: form.city,
    country: country.length === 2 ? country : null,
    customerNumber: form.customerNumber,
    externalNumber: form.externalNumber,
    loyaltyTier: form.loyaltyTier,
    defaultPaymentTermsDays:
      termNumber != null && Number.isFinite(termNumber) ? Math.round(termNumber) : null,
    tags: form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    internalNotes: form.internalNotes,
    marketingOptIn: form.marketingOptIn,
  };
}

/**
 * Full-page create / edit form for a customer record (replaces the old side
 * sheet): person, company and billing details in one place, the way an ERP
 * contact mask works. Additional addresses are managed on the detail page.
 */
export function CustomerFormPage() {
  const t = useT();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const slug = activeProject.companySlug;
  const id = params.id ? Number(params.id) : null;
  const isEdit = id != null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  usePageTitle(isEdit ? t('customers.form.editTitle') : t('customers.form.newTitle'));

  const query = useQuery({
    queryKey: ['customer', slug, id] as const,
    enabled: isEdit && !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => customersAdminApi.get(slug, id!, signal),
  });

  // Fill the form from the loaded record once, during render (no effect needed).
  const loaded = query.data?.customer;
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  if (loaded && hydratedFor !== loaded.id) {
    setHydratedFor(loaded.id);
    setForm(toForm(loaded));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form);
      if (isEdit) return customersAdminApi.update(slug, id!, payload);
      return customersAdminApi.create(slug, payload as CustomerCreateInput);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      void queryClient.invalidateQueries({
        queryKey: ['customer-overview', slug, res.customer.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['customer', slug, res.customer.id] });
      toast.success(isEdit ? t('customers.form.save') : t('customers.form.create'));
      navigate(`/customers/${res.customer.id}`);
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!form.email.trim()) {
      setFormError(t('customers.form.emailRequired'));
      return;
    }
    if (form.customerType === 'business' && !form.companyName.trim()) {
      setFormError(t('customers.form.companyNameRequired'));
      return;
    }
    save.mutate();
  }

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('customers.backToList')} />
        <EmptyState message={t('customers.selectBrandFirst')} />
      </div>
    );
  }

  if (isEdit && query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('customers.backToList')} />
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (isEdit && (query.error || !query.data)) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <BackLink label={t('customers.backToList')} />
        <ErrorNote message={query.error ? errMessage(query.error) : t('customers.notFound')} />
      </div>
    );
  }

  const isBusiness = form.customerType === 'business';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <PageHeading
        title={isEdit ? t('customers.form.editTitle') : t('customers.form.newTitle')}
        subtitle={isEdit ? t('customers.form.editSubtitle') : t('customers.form.newSubtitle')}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <Link to="/customers" className="hover:underline">
              {t('customers.title')}
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">
              {isEdit ? (loaded?.name ?? loaded?.email) : t('customers.form.newTitle')}
            </span>
          </>
        }
      />

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Section title={t('customers.form.customerType')} hint={t('customers.section.contactHint')}>
          <div
            role="radiogroup"
            aria-label={t('customers.form.customerType')}
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1"
          >
            {(['private', 'business'] as CustomerType[]).map((value) => {
              const active = form.customerType === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('customerType', value)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {value === 'business' ? (
                    <Building2 className="size-4" aria-hidden="true" />
                  ) : (
                    <User className="size-4" aria-hidden="true" />
                  )}
                  {t(`customers.type.${value}` as never)}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title={t('customers.section.contact')} hint={t('customers.section.contactHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.form.salutation')}>
              <Select
                value={form.salutation}
                onChange={(e) => set('salutation', e.target.value)}
                className="h-11 sm:h-9"
              >
                <option value="">{t('customers.notSet')}</option>
                {SALUTATIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`customers.salutationOpt.${value}` as never)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('customers.form.phone')}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                autoComplete="tel"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.firstName')}>
              <Input
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                autoComplete="given-name"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.lastName')}>
              <Input
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                autoComplete="family-name"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.email')} required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="email"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.dateOfBirth')}>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.language')}>
              <Select
                value={form.language}
                onChange={(e) => set('language', e.target.value)}
                className="h-11 sm:h-9"
              >
                <option value="">{t('customers.notSet')}</option>
                {LANGUAGES.map((value) => (
                  <option key={value} value={value}>
                    {t(`customers.lang.${value}` as never)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('customers.form.preferredChannel')}>
              <Select
                value={form.preferredChannel}
                onChange={(e) => set('preferredChannel', e.target.value)}
                className="h-11 sm:h-9"
              >
                <option value="">{t('customers.notSet')}</option>
                {CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`customers.channel.${value}` as never)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </Section>

        <Section title={t('customers.section.company')} hint={t('customers.section.companyHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.form.companyName')} required={isBusiness}>
              <Input
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                autoComplete="organization"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.website')}>
              <Input
                type="url"
                inputMode="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.jobPosition')}>
              <Input
                value={form.jobPosition}
                onChange={(e) => set('jobPosition', e.target.value)}
                autoComplete="organization-title"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.department')}>
              <Input
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.vatId')} hint={t('customers.form.vatIdHint')}>
              <Input
                value={form.vatId}
                onChange={(e) => set('vatId', e.target.value)}
                placeholder="DE123456789"
                className="h-11 uppercase sm:h-9"
              />
            </FormField>
            <FormField
              label={t('customers.form.taxNumber')}
              hint={t('customers.form.taxNumberHint')}
            >
              <Input
                value={form.taxNumber}
                onChange={(e) => set('taxNumber', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
          </div>
        </Section>

        <Section title={t('customers.section.address')} hint={t('customers.section.addressHint')}>
          <div className="grid gap-4">
            <FormField label={t('customers.form.addressLine1')}>
              <AddressAutocomplete
                value={form.addressLine1}
                onChange={(value) => set('addressLine1', value)}
                onPick={(a) => {
                  setForm((prev) => ({
                    ...prev,
                    postalCode: a.postcode ?? prev.postalCode,
                    city: a.city ?? prev.city,
                    country: prev.country.trim() === '' ? 'DE' : prev.country,
                  }));
                }}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.addressLine2')}>
              <Input
                value={form.addressLine2}
                onChange={(e) => set('addressLine2', e.target.value)}
                autoComplete="address-line2"
                className="h-11 sm:h-9"
              />
            </FormField>
            <div className="grid grid-cols-[1fr_2fr_auto] gap-3">
              <FormField label={t('customers.form.postalCode')}>
                <Input
                  value={form.postalCode}
                  onChange={(e) => set('postalCode', e.target.value)}
                  autoComplete="postal-code"
                  className="h-11 sm:h-9"
                />
              </FormField>
              <FormField label={t('customers.form.city')}>
                <Input
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  autoComplete="address-level2"
                  className="h-11 sm:h-9"
                />
              </FormField>
              <FormField label={t('customers.form.country')}>
                <Input
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  maxLength={2}
                  className="h-11 w-16 uppercase sm:h-9"
                />
              </FormField>
            </div>
          </div>
        </Section>

        <Section title={t('customers.section.admin')} hint={t('customers.section.adminHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('customers.form.customerNumber')}
              hint={t('customers.form.customerNumberHint')}
            >
              <Input
                value={form.customerNumber}
                onChange={(e) => set('customerNumber', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField
              label={t('customers.form.externalNumber')}
              hint={t('customers.form.externalNumberHint')}
            >
              <Input
                value={form.externalNumber}
                onChange={(e) => set('externalNumber', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.tier')}>
              <Select
                value={form.loyaltyTier}
                onChange={(e) => set('loyaltyTier', e.target.value as LoyaltyTier)}
                className="h-11 sm:h-9"
              >
                {TIERS.map((value) => (
                  <option key={value} value={value}>
                    {t(`customers.tier.${value}` as never)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label={t('customers.form.defaultPaymentTerms')}
              hint={t('customers.form.defaultPaymentTermsHint')}
            >
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.defaultPaymentTermsDays}
                onChange={(e) => set('defaultPaymentTermsDays', e.target.value)}
                placeholder="7"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField
              label={t('customers.form.tags')}
              hint={t('customers.form.tagsHint')}
              className="sm:col-span-2"
            >
              <Input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="VIP, B2B"
                className="h-11 sm:h-9"
              />
            </FormField>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.marketingOptIn}
              onChange={(e) => set('marketingOptIn', e.target.checked)}
            />
            {t('customers.form.marketingOptIn')}
          </label>
        </Section>

        <Section title={t('customers.section.notes')} hint={t('customers.section.notesHint')}>
          <Textarea
            value={form.internalNotes}
            onChange={(e) => set('internalNotes', e.target.value)}
            rows={4}
            aria-label={t('customers.form.internalNotes')}
          />
        </Section>

        {formError ? <ErrorNote message={formError} /> : null}

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
          <Button type="button" variant="ghost" className="h-11 sm:h-9" asChild>
            <Link to={isEdit ? `/customers/${id}` : '/customers'}>{t('common.cancel')}</Link>
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
            {isEdit ? t('customers.form.save') : t('customers.form.create')}
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
      to="/customers"
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
