import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { ServicePicker } from '@/components/service-picker';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  errMessage,
  partnersAdminApi,
  serviceCatalogApi,
  type Partner,
  type PartnerDetailResponse,
  type PartnerUpdate,
} from '@/lib/api';
import { partnerDetailKey, partnerHref, usePartnerRecord } from '@/lib/partners';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';

import type { Project } from '@/contexts/project-context';

const TEXT_FIELDS = [
  'companyName',
  'legalName',
  'contactEmail',
  'contactPhone',
  'websiteUrl',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'city',
  'region',
  'iban',
  'bic',
  'taxId',
  'vatId',
  'registrationNumber',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

type FormState = Record<TextField, string> & {
  serviceRadiusKm: string;
  commissionRate: string;
  services: string[];
};

function toForm(p: Partner): FormState {
  const text = Object.fromEntries(TEXT_FIELDS.map((k) => [k, p[k] ?? ''])) as Record<
    TextField,
    string
  >;
  return {
    ...text,
    serviceRadiusKm: String(p.serviceRadiusKm),
    commissionRate: p.commissionRate == null ? '' : String(Number(p.commissionRate)),
    services: [...p.services],
  };
}

function parseDecimal(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState, initial: FormState, t: ReturnType<typeof useT>): Errors {
  const e: Errors = {};
  if (!f.companyName.trim()) e.companyName = t('partners.form.companyRequired');
  // Imported partners can lack a contact email; once set it cannot be cleared (API rejects null).
  const email = f.contactEmail.trim();
  if (!email && initial.contactEmail.trim()) e.contactEmail = t('partners.form.emailRequired');
  else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    e.contactEmail = t('partners.form.emailInvalid');
  }
  if (f.websiteUrl.trim() && !/^https?:\/\/\S+$/i.test(f.websiteUrl.trim())) {
    e.websiteUrl = t('partners.edit.urlInvalid');
  }
  if (f.postalCode.trim() && !/^\d{5}$/.test(f.postalCode.trim())) {
    e.postalCode = t('partners.edit.plzInvalid');
  }
  const radius = Number(f.serviceRadiusKm);
  if (!Number.isInteger(radius) || radius < 5 || radius > 300) {
    e.serviceRadiusKm = t('partners.edit.radiusInvalid');
  }
  if (f.commissionRate.trim()) {
    const rate = parseDecimal(f.commissionRate);
    if (rate == null || rate < 0 || rate > 50) e.commissionRate = t('partners.edit.rateInvalid');
  }
  return e;
}

/** Only changed fields: an untouched list of inactive services must not be re-validated. */
function diff(initial: FormState, f: FormState): PartnerUpdate {
  const patch: PartnerUpdate = {};
  for (const k of TEXT_FIELDS) {
    if (f[k].trim() === initial[k].trim()) continue;
    const v = f[k].trim();
    if (k === 'companyName' || k === 'contactEmail') patch[k] = v;
    else patch[k] = v === '' ? null : v;
  }
  if (f.serviceRadiusKm !== initial.serviceRadiusKm)
    patch.serviceRadiusKm = Number(f.serviceRadiusKm);
  if (f.commissionRate.trim() !== initial.commissionRate.trim()) {
    patch.commissionRate = parseDecimal(f.commissionRate);
  }
  const a = [...initial.services].sort().join('|');
  const b = [...f.services].sort().join('|');
  if (a !== b) patch.services = f.services;
  return patch;
}

export function PartnerEditPage() {
  const t = useT();
  const { id: idParam } = useParams();
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const record = usePartnerRecord(id);
  usePageTitle(t('partners.edit.title'));

  if (record.isLoading) {
    return (
      <PageContainer width="narrow">
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }
  if (!record.data || !record.brand) {
    return (
      <PageContainer width="narrow">
        <PageHeading title={t('partners.edit.title')} />
        {record.error && !(record.error instanceof ApiError && record.error.status === 404) ? (
          <ErrorState error={record.error} onRetry={record.refetch} retrying={record.isFetching} />
        ) : (
          <EmptyState variant="dashed" icon={<Store />} message={t('partners.notFound')} />
        )}
      </PageContainer>
    );
  }
  return (
    <PartnerEditForm
      key={`${record.brand.companySlug}:${record.data.partner.id}`}
      data={record.data}
      brand={record.brand}
    />
  );
}

function PartnerEditForm({ data, brand }: { data: PartnerDetailResponse; brand: Project }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const slug = brand.companySlug;
  const partner = data.partner;
  const detailHref = partnerHref(slug, partner.id);

  const [initial] = useState(() => toForm(partner));
  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const patch = diff(initial, form);
  const dirty = Object.keys(patch).length > 0;
  const { blocker, allowLeave } = useLeaveGuard(dirty);
  const errors = submitted ? validate(form, initial, t) : {};

  const catalogQuery = useQuery({
    queryKey: ['service-catalog', slug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(slug, signal),
    staleTime: 5 * 60_000,
  });

  const set =
    (key: TextField | 'serviceRadiusKm' | 'commissionRate') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () => partnersAdminApi.update(slug, partner.id, patch),
    onSuccess: (res) => {
      queryClient.setQueryData<PartnerDetailResponse>(partnerDetailKey(slug, partner.id), (prev) =>
        prev ? { ...prev, partner: res.partner, checklist: res.checklist } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ['partners', slug] });
      toast.success(t('partners.edit.saved'));
      allowLeave();
      navigate(detailHref, { replace: true, state: location.state });
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  const breadcrumb = [
    { label: brand.name },
    { label: t('partners.title'), to: '/partner' },
    { label: partner.companyName ?? t('partners.detail.noCompany'), to: detailHref },
    { label: t('partners.edit.title') },
  ];

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={t('partners.edit.title')}
        subtitle={partner.companyName ?? undefined}
        breadcrumb={breadcrumb}
      />
      {!canWrite ? (
        <Alert tone="info" className="mb-5">
          {t('partners.edit.readOnly')}
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSubmitted(true);
          if (Object.keys(validate(form, initial, t)).length > 0 || !dirty) return;
          save.mutate();
        }}
      >
        <fieldset disabled={!canWrite} className="contents">
          <SectionCard
            as="fieldset"
            title={t('partners.form.sectionCompany')}
            bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField label={t('partners.form.companyName')} required error={errors.companyName}>
              <Input value={form.companyName} onChange={set('companyName')} maxLength={200} />
            </FormField>
            <FormField label={t('partners.form.legalName')}>
              <Input value={form.legalName} onChange={set('legalName')} maxLength={200} />
            </FormField>
            <FormField
              label={t('partners.form.email')}
              required={!!initial.contactEmail}
              error={errors.contactEmail}
            >
              <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} />
            </FormField>
            <FormField label={t('partners.form.phone')}>
              <Input
                type="tel"
                value={form.contactPhone}
                onChange={set('contactPhone')}
                maxLength={32}
              />
            </FormField>
            <FormField
              label={t('partners.form.website')}
              className="sm:col-span-2"
              error={errors.websiteUrl}
            >
              <Input
                type="url"
                value={form.websiteUrl}
                onChange={set('websiteUrl')}
                placeholder={t('partners.form.websitePlaceholder')}
              />
            </FormField>
          </SectionCard>

          <SectionCard
            as="fieldset"
            title={t('partners.form.sectionAddress')}
            bodyClassName="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4"
          >
            <FormField label={t('partners.form.address')} className="col-span-2">
              <AddressAutocomplete
                value={form.addressLine1}
                onChange={(v) => setForm((f) => ({ ...f, addressLine1: v }))}
                onPick={(a) =>
                  setForm((f) => ({
                    ...f,
                    postalCode: a.postcode || f.postalCode,
                    city: a.city || f.city,
                  }))
                }
              />
            </FormField>
            <FormField label={t('partners.edit.addressLine2')} className="col-span-2">
              <Input value={form.addressLine2} onChange={set('addressLine2')} />
            </FormField>
            <FormField
              label={t('partners.form.postalCode')}
              error={errors.postalCode}
              hint={t('partners.edit.plzHint')}
            >
              <Input
                inputMode="numeric"
                value={form.postalCode}
                onChange={set('postalCode')}
                maxLength={5}
              />
            </FormField>
            <FormField label={t('partners.form.city')}>
              <Input value={form.city} onChange={set('city')} />
            </FormField>
            <FormField label={t('partners.edit.region')} className="col-span-2">
              <Input value={form.region} onChange={set('region')} />
            </FormField>
          </SectionCard>

          <SectionCard
            as="fieldset"
            title={t('partners.edit.sectionServices')}
            description={t('partners.edit.servicesHint')}
            bodyClassName="space-y-5"
          >
            <FormField
              label={t('partners.edit.radius')}
              error={errors.serviceRadiusKm}
              hint={t('partners.edit.radiusHint')}
              className="max-w-48"
            >
              <Input
                type="number"
                inputMode="numeric"
                min={5}
                max={300}
                step={1}
                value={form.serviceRadiusKm}
                onChange={set('serviceRadiusKm')}
              />
            </FormField>
            {catalogQuery.isLoading ? (
              <LoadingState inline />
            ) : catalogQuery.isError ? (
              <Alert tone="destructive">{t('serviceCatalog.loadFailed')}</Alert>
            ) : (
              <ServicePicker
                catalog={catalogQuery.data?.services ?? []}
                value={form.services}
                onChange={(services) => setForm((f) => ({ ...f, services }))}
                disabled={!canWrite}
              />
            )}
          </SectionCard>

          <SectionCard
            as="fieldset"
            title={t('partners.edit.sectionCommission')}
            bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              label={t('partners.edit.commissionRate')}
              hint={t('partners.edit.commissionHint')}
              error={errors.commissionRate}
            >
              <Input
                inputMode="decimal"
                value={form.commissionRate}
                onChange={set('commissionRate')}
                placeholder="12"
              />
            </FormField>
          </SectionCard>

          <SectionCard
            as="fieldset"
            title={t('partners.form.sectionPayout')}
            bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField label={t('partners.form.iban')}>
              <Input
                value={form.iban}
                onChange={set('iban')}
                className="font-mono"
                maxLength={34}
              />
            </FormField>
            <FormField label={t('partners.fields.bic')}>
              <Input value={form.bic} onChange={set('bic')} className="font-mono" maxLength={11} />
            </FormField>
            <FormField label={t('partners.fields.taxId')}>
              <Input value={form.taxId} onChange={set('taxId')} maxLength={32} />
            </FormField>
            <FormField label={t('partners.fields.vatId')}>
              <Input value={form.vatId} onChange={set('vatId')} maxLength={32} />
            </FormField>
            <FormField label={t('partners.fields.registrationNumber')} className="sm:col-span-2">
              <Input
                value={form.registrationNumber}
                onChange={set('registrationNumber')}
                maxLength={64}
              />
            </FormField>
          </SectionCard>
        </fieldset>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={detailHref} state={location.state}>
              {t('common.cancel')}
            </Link>
          </Button>
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            disabled={!canWrite || !dirty}
            loading={save.isPending}
          >
            <Save aria-hidden="true" />
            {t('common.save')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
