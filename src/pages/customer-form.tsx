import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, User, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
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
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
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
import { customerTitle } from '@/lib/customer-display';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { isNonContactableEmail } from '@/lib/utils';

const TIERS: LoyaltyTier[] = ['neukunde', 'stammkunde', 'premium'];
const SALUTATIONS: CustomerSalutation[] = ['herr', 'frau', 'divers', 'firma'];
const LANGUAGES: CustomerLanguage[] = ['de', 'en'];
const CHANNELS: CustomerChannel[] = ['email', 'phone', 'whatsapp', 'post'];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  loyaltyTier: 'neukunde',
  defaultPaymentTermsDays: '',
  tags: '',
  internalNotes: '',
  marketingOptIn: false,
};

/** Legacy single-name values split at the first space; the rest is the last name. */
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
    // Imported placeholders are never shown; an empty field keeps the stored placeholder.
    email: isNonContactableEmail(customer.email) ? '' : customer.email,
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
    loyaltyTier: TIERS.includes(customer.loyaltyTier) ? customer.loyaltyTier : 'neukunde',
    defaultPaymentTermsDays:
      customer.defaultPaymentTermsDays != null ? String(customer.defaultPaymentTermsDays) : '',
    tags: (customer.tags ?? []).join(', '),
    internalNotes: customer.internalNotes ?? '',
    marketingOptIn: customer.marketingOptIn,
  };
}

/** Maps the form to the API payload; empty strings clear the field server-side. */
function toPayload(form: FormState): CustomerUpdateInput {
  const term = form.defaultPaymentTermsDays.trim();
  const termNumber = term === '' ? null : Number(term);
  const country = form.country.trim().toUpperCase();
  const email = form.email.trim().toLowerCase();
  return {
    email: email || undefined,
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

export function CustomerFormPage() {
  const t = useT();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const slug = activeProject.companySlug;
  const id = params.id ? Number(params.id) : null;
  const isEdit = id != null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; companyName?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const companyNameRef = useRef<HTMLInputElement>(null);

  usePageTitle(isEdit ? t('customers.form.editTitle') : t('customers.form.newTitle'));

  const query = useQuery({
    queryKey: ['customer', slug, id] as const,
    enabled: isEdit && !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => customersAdminApi.get(slug, id!, signal),
  });

  const loaded = query.data?.customer;
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);
  if (loaded && hydratedFor !== loaded.id) {
    const hydrated = toForm(loaded);
    setHydratedFor(loaded.id);
    setForm(hydrated);
    setBaseline(hydrated);
  }
  const hasPlaceholderEmail = !!loaded && isNonContactableEmail(loaded.email);
  const { blocker, allowLeave } = useLeaveGuard(
    canWrite && JSON.stringify(form) !== JSON.stringify(baseline),
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'email' && fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
    if ((key === 'companyName' || key === 'customerType') && fieldErrors.companyName) {
      setFieldErrors((p) => ({ ...p, companyName: undefined }));
    }
  };

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
      toast.success(isEdit ? t('customers.form.saved') : t('customers.form.created'));
      allowLeave();
      navigate(`/customers/${res.customer.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && /email/i.test(err.message)) {
        const message = t('customers.form.emailTaken');
        setFormError(message);
        setFieldErrors({ email: message });
        emailRef.current?.focus();
        return;
      }
      setFormError(errMessage(err));
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const email = form.email.trim();
    if (!email && !hasPlaceholderEmail) {
      const message = t('customers.form.emailRequired');
      setFormError(message);
      setFieldErrors({ email: message });
      emailRef.current?.focus();
      return;
    }
    if (email && !EMAIL_SHAPE.test(email)) {
      const message = t('customers.form.emailInvalid');
      setFormError(message);
      setFieldErrors({ email: message });
      emailRef.current?.focus();
      return;
    }
    if (form.customerType === 'business' && !form.companyName.trim()) {
      const message = t('customers.form.companyNameRequired');
      setFormError(message);
      setFieldErrors({ companyName: message });
      companyNameRef.current?.focus();
      return;
    }
    save.mutate();
  }

  const backLink = (
    <BackLink to="/customers" className="mb-3 self-start">
      {t('customers.backToList')}
    </BackLink>
  );
  const pageTitle = isEdit ? t('customers.form.editTitle') : t('customers.form.newTitle');

  if (isAllBrands) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <EmptyState
          variant="dashed"
          icon={<Users aria-hidden="true" />}
          message={t('customers.selectBrandFirst')}
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

  if (!canWrite) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <Alert tone="neutral">{t('customers.readOnly')}</Alert>
      </PageContainer>
    );
  }

  if (isEdit && (query.error || !query.data)) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <ErrorState
          error={query.error ?? new Error(t('customers.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const isBusiness = form.customerType === 'business';

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={pageTitle}
        subtitle={isEdit ? t('customers.form.editSubtitle') : t('customers.form.newSubtitle')}
        breadcrumb={[
          { label: activeProject.name },
          { label: t('customers.title'), to: '/customers' },
          ...(loaded ? [{ label: customerTitle(loaded, t), to: `/customers/${loaded.id}` }] : []),
          { label: pageTitle },
        ]}
      />

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <SectionCard
          as="fieldset"
          title={t('customers.form.customerType')}
          description={t('customers.section.typeHint')}
        >
          <SegmentedControl
            label={t('customers.form.customerType')}
            value={form.customerType}
            onValueChange={(value) => set('customerType', value)}
            options={(['private', 'business'] as CustomerType[]).map((value) => ({
              value,
              label: t(`customers.type.${value}` as never),
              icon:
                value === 'business' ? (
                  <Building2 aria-hidden="true" />
                ) : (
                  <User aria-hidden="true" />
                ),
            }))}
          />
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.section.contact')}
          description={t('customers.section.contactHint')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.form.firstName')}>
              <Input
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                autoComplete="given-name"
              />
            </FormField>
            <FormField label={t('customers.form.lastName')}>
              <Input
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                autoComplete="family-name"
              />
            </FormField>
            <FormField
              label={t('customers.form.email')}
              required={!hasPlaceholderEmail}
              error={fieldErrors.email}
              hint={hasPlaceholderEmail ? t('customers.form.placeholderEmailHint') : undefined}
            >
              <Input
                ref={emailRef}
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="email"
              />
            </FormField>
            <FormField label={t('customers.form.phone')}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                autoComplete="tel"
              />
            </FormField>
            <FormField label={t('customers.form.salutation')}>
              <Select
                value={form.salutation}
                onValueChange={(v) => set('salutation', v)}
                options={[
                  { value: '', label: t('customers.notSet') },
                  ...SALUTATIONS.map((value) => ({
                    value,
                    label: t(`customers.salutationOpt.${value}` as never),
                  })),
                ]}
              />
            </FormField>
            <FormField label={t('customers.form.dateOfBirth')}>
              <DatePicker value={form.dateOfBirth} onValueChange={(v) => set('dateOfBirth', v)} />
            </FormField>
            <FormField label={t('customers.form.language')}>
              <Select
                value={form.language}
                onValueChange={(v) => set('language', v)}
                options={[
                  { value: '', label: t('customers.notSet') },
                  ...LANGUAGES.map((value) => ({
                    value,
                    label: t(`customers.lang.${value}` as never),
                  })),
                ]}
              />
            </FormField>
            <FormField label={t('customers.form.preferredChannel')}>
              <Select
                value={form.preferredChannel}
                onValueChange={(v) => set('preferredChannel', v)}
                options={[
                  { value: '', label: t('customers.notSet') },
                  ...CHANNELS.map((value) => ({
                    value,
                    label: t(`customers.channel.${value}` as never),
                  })),
                ]}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.section.company')}
          description={t('customers.section.companyHint')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('customers.form.companyName')}
              required={isBusiness}
              error={fieldErrors.companyName}
            >
              <Input
                ref={companyNameRef}
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                autoComplete="organization"
              />
            </FormField>
            <FormField label={t('customers.form.website')}>
              <Input
                type="url"
                inputMode="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
            </FormField>
            <FormField label={t('customers.form.jobPosition')}>
              <Input
                value={form.jobPosition}
                onChange={(e) => set('jobPosition', e.target.value)}
                autoComplete="organization-title"
              />
            </FormField>
            <FormField label={t('customers.form.department')}>
              <Input value={form.department} onChange={(e) => set('department', e.target.value)} />
            </FormField>
            <FormField label={t('customers.form.vatId')} hint={t('customers.form.vatIdHint')}>
              <Input
                value={form.vatId}
                onChange={(e) => set('vatId', e.target.value)}
                placeholder="DE123456789"
                className="uppercase"
              />
            </FormField>
            <FormField
              label={t('customers.form.taxNumber')}
              hint={t('customers.form.taxNumberHint')}
            >
              <Input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.section.address')}
          description={t('customers.section.addressHint')}
        >
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
              />
            </FormField>
            <FormField label={t('customers.form.addressLine2')}>
              <Input
                value={form.addressLine2}
                onChange={(e) => set('addressLine2', e.target.value)}
                autoComplete="address-line2"
              />
            </FormField>
            <div className="grid grid-cols-[1fr_2fr_auto] gap-3">
              <FormField label={t('customers.form.postalCode')}>
                <Input
                  value={form.postalCode}
                  onChange={(e) => set('postalCode', e.target.value)}
                  autoComplete="postal-code"
                />
              </FormField>
              <FormField label={t('customers.form.city')}>
                <Input
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  autoComplete="address-level2"
                />
              </FormField>
              <FormField label={t('customers.form.country')}>
                <Input
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  maxLength={2}
                  className="w-16 uppercase"
                />
              </FormField>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.section.admin')}
          description={t('customers.section.adminHint')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.form.tier')}>
              <Select<LoyaltyTier>
                value={form.loyaltyTier}
                onValueChange={(v) => set('loyaltyTier', v)}
                options={TIERS.map((value) => ({
                  value,
                  label: t(`customers.tier.${value}` as never),
                }))}
              />
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
              />
            </FormField>
          </div>
          <label className="mt-4 flex items-center gap-2 text-2sm text-foreground">
            <Checkbox
              checked={form.marketingOptIn}
              onChange={(e) => set('marketingOptIn', e.target.checked)}
            />
            {t('customers.form.marketingOptIn')}
          </label>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.section.notes')}
          description={t('customers.section.notesHint')}
        >
          <Textarea
            value={form.internalNotes}
            onChange={(e) => set('internalNotes', e.target.value)}
            rows={4}
            aria-label={t('customers.form.internalNotes')}
          />
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={isEdit ? `/customers/${id}` : '/customers'}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}>
            <Save aria-hidden="true" />
            {isEdit ? t('customers.form.save') : t('customers.form.create')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
