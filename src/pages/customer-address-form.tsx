import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Users } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  customersAdminApi,
  errMessage,
  type CustomerAddress,
  type CustomerAddressInput,
  type CustomerAddressKind,
} from '@/lib/api';
import { customerTitle } from '@/lib/customer-display';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';

const KINDS: CustomerAddressKind[] = ['billing', 'service', 'shipping'];

interface AddressForm {
  kind: CustomerAddressKind;
  label: string;
  name: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  notes: string;
}

function toForm(address: CustomerAddress | null): AddressForm {
  return {
    kind: address && KINDS.includes(address.kind) ? address.kind : 'billing',
    label: address?.label ?? '',
    name: address?.name ?? '',
    company: address?.company ?? '',
    addressLine1: address?.addressLine1 ?? '',
    addressLine2: address?.addressLine2 ?? '',
    postalCode: address?.postalCode ?? '',
    city: address?.city ?? '',
    country: address?.country ?? 'DE',
    phone: address?.phone ?? '',
    notes: address?.notes ?? '',
  };
}

function toPayload(form: AddressForm): CustomerAddressInput {
  const country = form.country.trim().toUpperCase();
  return {
    kind: form.kind,
    label: form.label,
    name: form.name,
    company: form.company,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    postalCode: form.postalCode,
    city: form.city,
    country: country.length === 2 ? country : null,
    phone: form.phone,
    notes: form.notes,
  };
}

export function CustomerAddressFormPage() {
  const t = useT();
  const params = useParams();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const slug = activeProject.companySlug;
  const customerId = Number(params.id);
  const addressId = params.addressId === undefined ? null : Number(params.addressId);
  const isEdit = addressId !== null;
  const pageTitle = isEdit ? t('customers.addresses.edit') : t('customers.addresses.add');
  usePageTitle(pageTitle);

  // Same key as the customer page, so coming from there needs no extra request.
  const query = useQuery({
    queryKey: ['customer-overview', slug, customerId] as const,
    enabled: !isAllBrands && Number.isFinite(customerId),
    queryFn: ({ signal }) => customersAdminApi.overview(slug, customerId, signal),
  });

  const customerHref = `/customers/${customerId}`;
  const backLink = (
    <BackLink
      to={Number.isFinite(customerId) ? customerHref : '/customers'}
      className="mb-3 self-start"
    >
      {query.data ? customerTitle(query.data.customer, t) : t('customers.title')}
    </BackLink>
  );

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

  if (query.isLoading) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  const address = isEdit ? (query.data?.addresses.find((a) => a.id === addressId) ?? null) : null;
  if (query.error || !query.data || (isEdit && !address)) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <ErrorState
          error={
            query.error ??
            new Error(query.data ? t('customers.addresses.notFound') : t('customers.notFound'))
          }
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const customer = query.data.customer;
  if (!canWrite) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <Alert tone="neutral">{t('customers.readOnly')}</Alert>
      </PageContainer>
    );
  }
  return (
    <AddressFormView
      key={address ? `${address.id}:${address.updatedAt}` : 'new'}
      slug={slug}
      customerId={customerId}
      customerHref={customerHref}
      address={address}
      pageTitle={pageTitle}
      breadcrumb={[
        { label: activeProject.name },
        { label: t('customers.title'), to: '/customers' },
        { label: customerTitle(customer, t), to: customerHref },
        { label: pageTitle },
      ]}
    />
  );
}

function AddressFormView({
  slug,
  customerId,
  customerHref,
  address,
  pageTitle,
  breadcrumb,
}: {
  slug: CompanySlug;
  customerId: number;
  customerHref: string;
  address: CustomerAddress | null;
  pageTitle: string;
  breadcrumb: { label: string; to?: string }[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [initial] = useState(() => toForm(address));
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { blocker, allowLeave } = useLeaveGuard(JSON.stringify(form) !== JSON.stringify(initial));

  const set = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form);
      if (address) return customersAdminApi.updateAddress(slug, customerId, address.id, payload);
      return customersAdminApi.createAddress(slug, customerId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, customerId] });
      void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      toast.success(t('customers.addresses.saved'));
      allowLeave();
      navigate(customerHref);
    },
    onError: (err) => setError(errMessage(err)),
  });

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={pageTitle}
        subtitle={t('customers.addresses.subtitle')}
        breadcrumb={breadcrumb}
      />

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <SectionCard
          as="fieldset"
          title={t('customers.addresses.sectionRecipient')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField label={t('customers.addresses.fieldKind')}>
            <Select<CustomerAddressKind>
              value={form.kind}
              onValueChange={(v) => set('kind', v)}
              options={KINDS.map((kind) => ({
                value: kind,
                label: t(`customers.addresses.kind.${kind}` as never),
              }))}
            />
          </FormField>
          <FormField
            label={t('customers.addresses.fieldLabel')}
            hint={t('customers.addresses.fieldLabelHint')}
          >
            <Input value={form.label} onChange={(e) => set('label', e.target.value)} />
          </FormField>
          <FormField label={t('customers.addresses.fieldCompany')}>
            <Input
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
              autoComplete="organization"
            />
          </FormField>
          <FormField label={t('customers.addresses.fieldName')}>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoComplete="name"
            />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.addresses.sectionAddress')}
          bodyClassName="flex flex-col gap-4"
        >
          <FormField label={t('customers.form.addressLine1')}>
            <AddressAutocomplete
              value={form.addressLine1}
              onChange={(value) => set('addressLine1', value)}
              onPick={(a) => {
                setForm((prev) => ({
                  ...prev,
                  postalCode: a.postcode ?? prev.postalCode,
                  city: a.city ?? prev.city,
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
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5rem] gap-4">
            <FormField label={t('customers.form.postalCode')}>
              <Input
                value={form.postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
                inputMode="numeric"
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
                className="uppercase"
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('customers.addresses.sectionContact')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField label={t('customers.form.phone')}>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
            />
          </FormField>
          <FormField label={t('customers.addresses.fieldNotes')} className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </FormField>
        </SectionCard>

        {error ? <Alert tone="destructive">{error}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={customerHref}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}>
            <Save aria-hidden="true" />
            {t('customers.form.save')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
