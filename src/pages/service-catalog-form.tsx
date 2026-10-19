import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  errMessage,
  serviceCatalogApi,
  type CatalogEntry,
  type CatalogEntryInput,
  type ServicePricingMode,
} from '@/lib/api';
import { readListNav } from '@/lib/list-nav';
import { pricingModeLabel } from '@/lib/partners';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { KIND_LABEL } from '@/pages/orders-shared';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NO_KIND = '__none__';

interface FormState {
  slug: string;
  name: string;
  category: string;
  pricingMode: ServicePricingMode;
  orderKind: string;
  description: string;
  commissionRate: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: FormState = {
  slug: '',
  name: '',
  category: '',
  pricingMode: 'inquiry',
  orderKind: '',
  description: '',
  commissionRate: '',
  isActive: true,
  sortOrder: '0',
};

function toForm(e: CatalogEntry): FormState {
  return {
    slug: e.slug,
    name: e.name,
    category: e.category ?? '',
    pricingMode: e.pricingMode,
    orderKind: e.orderKind ?? '',
    description: e.description ?? '',
    commissionRate: e.commissionRate == null ? '' : String(Number(e.commissionRate)),
    isActive: e.isActive,
    sortOrder: String(e.sortOrder),
  };
}

function parseRate(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

function toInput(f: FormState): CatalogEntryInput {
  return {
    name: f.name.trim(),
    category: f.category.trim() || null,
    pricingMode: f.pricingMode,
    orderKind: f.orderKind || null,
    description: f.description.trim() || null,
    commissionRate: parseRate(f.commissionRate),
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder),
  };
}

export function ServiceCatalogFormPage() {
  const t = useT();
  const { id: idParam } = useParams();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  const isNew = idParam === undefined;
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  // The admin API has no get-by-id: the entry comes from the brand's catalog list.
  const query = useQuery({
    queryKey: ['service-catalog', slug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(slug, signal),
    enabled: !isAllBrands && !isNew,
  });
  const entry = query.data?.services.find((s) => s.id === id) ?? null;
  usePageTitle(isNew ? t('serviceCatalog.create') : (entry?.name ?? t('serviceCatalog.title')));

  if (isAllBrands) {
    return (
      <PageContainer width="narrow">
        <PageHeading title={t('serviceCatalog.title')} />
        <EmptyState variant="dashed" icon={<Inbox />} message={t('partners.selectBrandFirst')} />
      </PageContainer>
    );
  }
  if (isNew) return <CatalogForm key="new" entry={null} />;
  if (query.isLoading) {
    return (
      <PageContainer width="narrow">
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }
  if (!entry) {
    return (
      <PageContainer width="narrow">
        <BackLink to="/leistungskatalog">{t('serviceCatalog.title')}</BackLink>
        <PageHeading className="mt-2" title={t('serviceCatalog.title')} />
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" icon={<Inbox />} message={t('serviceCatalog.notFound')} />
        )}
      </PageContainer>
    );
  }
  return <CatalogForm key={entry.id} entry={entry} />;
}

function CatalogForm({ entry }: { entry: CatalogEntry | null }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const { activeProject } = useProject();
  const slug = activeProject.companySlug;
  const [initial] = useState<FormState>(() => (entry ? toForm(entry) : EMPTY));
  const [form, setForm] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { blocker, allowLeave } = useLeaveGuard(dirty);
  const from = readListNav(location.state).from ?? '';
  const listHref = `/leistungskatalog${from}`;

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!entry && !SLUG_RE.test(form.slug.trim())) errors.slug = t('serviceCatalog.form.slugInvalid');
  if (!form.name.trim()) errors.name = t('serviceCatalog.form.nameRequired');
  const rate = parseRate(form.commissionRate);
  if (form.commissionRate.trim() && (rate == null || rate < 0 || rate > 50)) {
    errors.commissionRate = t('partners.edit.rateInvalid');
  }
  const sort = Number(form.sortOrder);
  if (!Number.isInteger(sort) || sort < 0 || sort > 10_000) {
    errors.sortOrder = t('serviceCatalog.form.sortInvalid');
  }
  const shown = submitted ? errors : {};

  const save = useMutation({
    mutationFn: async () => {
      const input = toInput(form);
      if (!entry) return serviceCatalogApi.create(slug, { ...input, slug: form.slug.trim() });
      const before = toInput(initial);
      const patch = Object.fromEntries(
        Object.entries(input).filter(([k, v]) => v !== before[k as keyof CatalogEntryInput]),
      ) as Partial<CatalogEntryInput>;
      return serviceCatalogApi.update(slug, entry.id, patch);
    },
    onSuccess: ({ service }) => {
      void queryClient.invalidateQueries({ queryKey: ['service-catalog', slug] });
      toast.success(entry ? t('serviceCatalog.saved') : t('serviceCatalog.created'));
      allowLeave();
      if (entry) navigate(listHref);
      else navigate(`/leistungskatalog/${service.id}`, { replace: true });
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  const set =
    (key: 'slug' | 'name' | 'category' | 'commissionRate' | 'sortOrder') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <PageContainer width="narrow">
      <RecordNav
        pager={
          entry ? (
            <RecordPager currentId={entry.id} hrefFor={(id) => `/leistungskatalog/${id}`} />
          ) : undefined
        }
      >
        <BackLink to={listHref}>{t('serviceCatalog.title')}</BackLink>
      </RecordNav>
      <PageHeading
        title={entry ? entry.name : t('serviceCatalog.create')}
        subtitle={entry ? undefined : t('serviceCatalog.form.createHint')}
        meta={
          entry ? (
            <>
              <StatusBadge
                label={entry.isActive ? t('serviceCatalog.active') : t('serviceCatalog.inactive')}
                tone={entry.isActive ? 'success' : 'neutral'}
              />
              <span className="font-mono text-xs text-muted-foreground">{entry.slug}</span>
            </>
          ) : undefined
        }
      />
      {!canWrite ? (
        <Alert tone="info" className="mb-5">
          {t('serviceCatalog.form.readOnly')}
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSubmitted(true);
          if (Object.keys(errors).length > 0 || !dirty) return;
          save.mutate();
        }}
      >
        <fieldset disabled={!canWrite} className="contents">
          <SectionCard
            as="fieldset"
            title={t('serviceCatalog.form.sectionService')}
            bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              label={t('serviceCatalog.form.slug')}
              required={!entry}
              error={shown.slug}
              hint={entry ? t('serviceCatalog.form.slugLocked') : t('serviceCatalog.form.slugHint')}
            >
              <Input
                value={form.slug}
                onChange={set('slug')}
                readOnly={!!entry}
                maxLength={80}
                className="font-mono"
                autoComplete="off"
              />
            </FormField>
            <FormField label={t('serviceCatalog.form.name')} required error={shown.name}>
              <Input value={form.name} onChange={set('name')} maxLength={200} />
            </FormField>
            <FormField label={t('serviceCatalog.colCategory')}>
              <Input value={form.category} onChange={set('category')} maxLength={64} />
            </FormField>
            <FormField label={t('serviceCatalog.colSort')} error={shown.sortOrder}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={1}
                value={form.sortOrder}
                onChange={set('sortOrder')}
              />
            </FormField>
            <FormField label={t('serviceCatalog.form.description')} className="sm:col-span-2">
              <Textarea
                rows={3}
                maxLength={4000}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
          </SectionCard>

          <SectionCard
            as="fieldset"
            title={t('serviceCatalog.form.sectionPricing')}
            bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              label={t('serviceCatalog.colPricing')}
              hint={t('serviceCatalog.form.pricingHint')}
            >
              <Select
                value={form.pricingMode}
                onValueChange={(v) => setForm((f) => ({ ...f, pricingMode: v }))}
                disabled={!canWrite}
                options={(['inquiry', 'fixed'] as const).map((m) => ({
                  value: m,
                  label: pricingModeLabel(t, m),
                }))}
              />
            </FormField>
            <FormField
              label={t('serviceCatalog.colOrderKind')}
              hint={t('serviceCatalog.form.orderKindHint')}
            >
              <Select
                value={form.orderKind || NO_KIND}
                onValueChange={(v) => setForm((f) => ({ ...f, orderKind: v === NO_KIND ? '' : v }))}
                disabled={!canWrite}
                options={[
                  { value: NO_KIND, label: t('serviceCatalog.form.noOrderKind') },
                  ...Object.entries(KIND_LABEL).map(([value, key]) => ({ value, label: t(key) })),
                  ...(form.orderKind && !(form.orderKind in KIND_LABEL)
                    ? [{ value: form.orderKind, label: form.orderKind }]
                    : []),
                ]}
              />
            </FormField>
            <FormField
              label={t('serviceCatalog.colCommission')}
              hint={t('serviceCatalog.form.commissionHint')}
              error={shown.commissionRate}
            >
              <Input
                inputMode="decimal"
                value={form.commissionRate}
                onChange={set('commissionRate')}
                placeholder="12"
              />
            </FormField>
            <label className="flex items-start gap-2 self-end pb-2 text-2sm text-foreground">
              <Checkbox
                className="mt-0.5"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>
                {t('serviceCatalog.form.isActive')}
                <span className="block text-xs text-muted-foreground">
                  {t('serviceCatalog.form.isActiveHint')}
                </span>
              </span>
            </label>
          </SectionCard>
        </fieldset>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={listHref}>{t('common.cancel')}</Link>
          </Button>
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            disabled={!canWrite || !dirty}
            loading={save.isPending}
          >
            {entry ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {entry ? t('common.save') : t('serviceCatalog.create')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
