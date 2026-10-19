import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  errMessage,
  subscriptionsAdminApi,
  type SubscriptionCreateInput,
  type SubscriptionRow,
  type SubscriptionUpdateInput,
} from '@/lib/api';
import { parseEuroToCents } from '@/lib/money-input';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';

/** Empty → undefined (keep / default), unreadable or negative → null. */
function parseEurToCents(value: string): number | null | undefined {
  if (!value.trim()) return undefined;
  const cents = parseEuroToCents(value);
  return cents === null || cents < 0 ? null : cents;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  customerEmail: string;
  customerName: string;
  planName: string;
  monthlyPrice: string;
  intervalMonths: string;
  nextServiceDate: string;
  stripeId: string;
  services: string;
}

function toForm(sub: SubscriptionRow | null): FormState {
  return {
    customerEmail: sub?.customerEmail ?? '',
    customerName: sub?.customerName ?? '',
    planName: sub?.planName ?? '',
    monthlyPrice: sub ? (sub.monthlyPriceCents / 100).toFixed(2) : '',
    intervalMonths: String(sub?.intervalMonths ?? 1),
    nextServiceDate: sub?.nextServiceDate ? sub.nextServiceDate.slice(0, 10) : '',
    stripeId: sub?.stripeSubscriptionId ?? '',
    services: sub?.servicesIncluded.join(', ') ?? '',
  };
}

export function SubscriptionFormPage() {
  const t = useT();
  const { id } = useParams();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const slug = activeProject.companySlug;
  const isEdit = id !== undefined;
  const subId = id && /^\d+$/.test(id) ? Number(id) : null;
  const pageTitle = isEdit ? t('subscriptions.form.editTitle') : t('subscriptions.newSubscription');
  usePageTitle(pageTitle);

  const query = useQuery({
    queryKey: ['subscription', slug, subId],
    enabled: isEdit && subId != null && !isAllBrands,
    queryFn: ({ signal }) => subscriptionsAdminApi.get(slug, subId!, signal),
  });

  const backLink = (
    <BackLink to="/abos" className="mb-3 self-start">
      {t('subscriptions.title')}
    </BackLink>
  );

  if (isAllBrands || !canWrite) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <EmptyState
          variant="dashed"
          icon={<Layers aria-hidden="true" />}
          message={
            isAllBrands ? t('subscriptions.selectBrandFirst') : t('subscriptions.noPermission')
          }
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

  if (isEdit && (subId == null || query.error || !query.data)) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <ErrorState
          error={query.error ?? new Error(t('subscriptions.form.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const sub = query.data?.subscription ?? null;
  return (
    <SubscriptionForm
      key={sub ? `${sub.id}:${sub.updatedAt}` : 'new'}
      slug={slug}
      brandName={activeProject.name}
      editing={sub}
      pageTitle={pageTitle}
    />
  );
}

function SubscriptionForm({
  slug,
  brandName,
  editing,
  pageTitle,
}: {
  slug: CompanySlug;
  brandName: string;
  editing: SubscriptionRow | null;
  pageTitle: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = editing != null;

  const [initial] = useState(() => toForm(editing));
  const [form, setForm] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const planMissing = form.planName.trim() === '';
  const emailMissing = !isEdit && form.customerEmail.trim() === '';
  const emailInvalid = !isEdit && !emailMissing && !EMAIL_RE.test(form.customerEmail.trim());
  const priceInvalid = parseEurToCents(form.monthlyPrice) === null;
  const intervalValue = Number(form.intervalMonths);
  const intervalInvalid =
    !Number.isInteger(intervalValue) || intervalValue < 1 || intervalValue > 24;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { blocker, allowLeave } = useLeaveGuard(dirty);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const cents = parseEurToCents(form.monthlyPrice) ?? undefined;
      const interval = Math.max(1, parseInt(form.intervalMonths, 10) || 1);
      const servicesArr = form.services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const stripeId = form.stripeId.trim();

      if (editing) {
        const patch: SubscriptionUpdateInput = {
          planName: form.planName.trim(),
          intervalMonths: interval,
          stripeSubscriptionId: stripeId === '' ? null : stripeId,
          servicesIncluded: servicesArr,
          nextServiceDate: form.nextServiceDate === '' ? null : form.nextServiceDate,
        };
        if (cents !== undefined) patch.monthlyPriceCents = cents;
        return subscriptionsAdminApi.update(slug, editing.id, patch);
      }

      const payload: SubscriptionCreateInput = {
        customerEmail: form.customerEmail.trim(),
        planName: form.planName.trim(),
        intervalMonths: interval,
      };
      if (form.customerName.trim()) payload.customerName = form.customerName.trim();
      if (cents !== undefined) payload.monthlyPriceCents = cents;
      if (stripeId) payload.stripeSubscriptionId = stripeId;
      if (servicesArr.length > 0) payload.servicesIncluded = servicesArr;
      if (form.nextServiceDate) payload.nextServiceDate = form.nextServiceDate;
      return subscriptionsAdminApi.create(slug, payload);
    },
    onSuccess: (res) => {
      toast.success(isEdit ? t('subscriptions.toast.saved') : t('subscriptions.toast.created'));
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', slug] });
      if (editing) {
        void queryClient.invalidateQueries({ queryKey: ['subscription', slug, editing.id] });
      }
      allowLeave();
      navigate(`/abos/${res.subscription.id}`);
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={pageTitle}
        subtitle={isEdit ? t('subscriptions.editSubtitle') : t('subscriptions.subtitle')}
        breadcrumb={[
          { label: brandName },
          { label: t('subscriptions.title'), to: '/abos' },
          { label: editing ? editing.planName : t('subscriptions.newSubscription') },
        ]}
      />

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSubmitted(true);
          if (planMissing || emailMissing || emailInvalid || priceInvalid || intervalInvalid)
            return;
          save.mutate();
        }}
      >
        <SectionCard
          as="fieldset"
          title={t('subscriptions.form.sectionCustomer')}
          description={isEdit ? t('subscriptions.form.customerLocked') : undefined}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField
            label={t('subscriptions.form.customerEmail')}
            required={!isEdit}
            error={
              submitted && emailMissing
                ? t('subscriptions.form.emailRequired')
                : submitted && emailInvalid
                  ? t('subscriptions.form.emailInvalid')
                  : undefined
            }
          >
            <Input
              type="email"
              value={form.customerEmail}
              onChange={set('customerEmail')}
              disabled={isEdit}
              autoComplete="email"
            />
          </FormField>
          <FormField label={t('subscriptions.form.customerName')}>
            <Input
              value={form.customerName}
              onChange={set('customerName')}
              disabled={isEdit}
              autoComplete="name"
            />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('subscriptions.form.sectionPlan')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField
            label={t('subscriptions.form.planName')}
            required
            error={submitted && planMissing ? t('subscriptions.form.planRequired') : undefined}
            className="sm:col-span-2"
          >
            <Input value={form.planName} onChange={set('planName')} />
          </FormField>
          <FormField
            label={t('subscriptions.form.monthlyPrice')}
            error={submitted && priceInvalid ? t('subscriptions.form.priceInvalid') : undefined}
          >
            <Input
              inputMode="decimal"
              value={form.monthlyPrice}
              onChange={set('monthlyPrice')}
              placeholder="49,90"
              className="tabular-nums"
            />
          </FormField>
          <FormField
            label={t('subscriptions.form.intervalMonths')}
            error={
              submitted && intervalInvalid ? t('subscriptions.form.intervalInvalid') : undefined
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={24}
              step={1}
              value={form.intervalMonths}
              onChange={set('intervalMonths')}
              className="tabular-nums"
            />
          </FormField>
          <FormField label={t('subscriptions.form.nextServiceDate')}>
            <DatePicker
              value={form.nextServiceDate}
              onValueChange={(v) => setForm((f) => ({ ...f, nextServiceDate: v }))}
            />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('subscriptions.form.sectionBilling')}
          bodyClassName="grid grid-cols-1 gap-4"
        >
          <FormField label={t('subscriptions.form.stripeId')}>
            <Input
              value={form.stripeId}
              onChange={set('stripeId')}
              placeholder="sub_…"
              className="font-mono"
            />
          </FormField>
          <FormField label={t('subscriptions.form.services')}>
            <Input value={form.services} onChange={set('services')} />
          </FormField>
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={editing ? `/abos/${editing.id}` : '/abos'}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}>
            {isEdit ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {isEdit ? t('subscriptions.form.save') : t('subscriptions.form.create')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
