import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Check,
  CreditCard,
  Layers,
  Pause,
  Pencil,
  Play,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  errMessage,
  subscriptionsAdminApi,
  type SubscriptionAction,
  type SubscriptionRow,
} from '@/lib/api';
import { readListNav } from '@/lib/list-nav';
import { usePageTitle } from '@/lib/use-page-title';
import { formatCurrency, formatDateTime, isNonContactableEmail } from '@/lib/utils';
import {
  lifecycleActionsFor,
  lifecycleConfirmCopy,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from '@/pages/subscriptions-shared';

import type { ReactNode } from 'react';

export function SubscriptionDetailPage() {
  const params = useParams();
  const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null;
  // Keyed by id: prev/next must not carry an open confirm or error over to the next record.
  return <SubscriptionDetail key={id ?? 'invalid'} id={id} />;
}

function SubscriptionDetail({ id }: { id: number | null }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const slug = activeProject.companySlug;

  const { from } = readListNav(location.state);
  const backTo = from?.startsWith('/') ? from : '/abos';

  const detail = useQuery({
    queryKey: ['subscription', slug, id],
    enabled: id != null && !isAllBrands,
    queryFn: ({ signal }) => subscriptionsAdminApi.get(slug, id!, signal),
  });
  const sub = detail.data?.subscription;
  usePageTitle(sub?.planName ?? t('subscriptions.detail.title'));

  const [confirm, setConfirm] = useState<SubscriptionAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const lifecycle = useMutation({
    mutationFn: (action: SubscriptionAction) => subscriptionsAdminApi.action(slug, id!, action),
    onSuccess: (data, action) => {
      setConfirm(null);
      setActionError(null);
      queryClient.setQueryData(['subscription', slug, id], data);
      toast.success(t(`subscriptions.toast.${action}` as never));
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', slug] });
    },
    onError: (err) => {
      setConfirm(null);
      // Surface backend 409/502 (Stripe mirror) messages verbatim.
      setActionError(errMessage(err));
    },
  });

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={backTo}>{t('subscriptions.title')}</BackLink>
    </RecordNav>
  );

  if (isAllBrands) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('subscriptions.detail.title')} />
        <EmptyState
          variant="dashed"
          icon={<Layers aria-hidden="true" />}
          message={t('subscriptions.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  if (id == null || (!sub && !detail.isLoading)) {
    const error =
      detail.error && !(detail.error instanceof ApiError && detail.error.status === 404)
        ? detail.error
        : null;
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('subscriptions.detail.title')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" message={t('subscriptions.form.notFound')} />
        )}
      </PageContainer>
    );
  }

  if (!sub) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState />
      </PageContainer>
    );
  }

  const actions = canWrite ? lifecycleActionsFor(sub.status) : [];
  const busy = lifecycle.isPending;
  const pendingAction = busy ? lifecycle.variables : null;
  const date = (iso: string) => formatDateTime(iso, bcp47, { dateStyle: 'medium' });
  const email = isNonContactableEmail(sub.customerEmail) ? null : sub.customerEmail;
  const confirmCopy = confirm ? lifecycleConfirmCopy(t, confirm) : null;

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={sub.id} hrefFor={(next) => `/abos/${next}`} />)}
      <PageHeading
        title={sub.planName}
        meta={
          <>
            <StatusBadge
              label={subscriptionStatusLabel(t, sub.status)}
              tone={subscriptionStatusTone(sub.status)}
            />
            {sub.stripeSubscriptionId ? (
              <Badge variant="info">
                <CreditCard aria-hidden="true" />
                {t('subscriptions.stripeLinked')}
              </Badge>
            ) : null}
          </>
        }
        subtitle={[sub.customerName, email].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            {actions.includes('resume') ? (
              <Button
                size="sm"
                disabled={busy}
                loading={pendingAction === 'resume'}
                onClick={() => setConfirm('resume')}
              >
                <Play aria-hidden="true" />
                {t('subscriptions.resume')}
              </Button>
            ) : null}
            {canWrite && sub.status !== 'cancelled' ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/abos/${sub.id}/bearbeiten`}>
                  <Pencil aria-hidden="true" />
                  {t('subscriptions.edit')}
                </Link>
              </Button>
            ) : null}
            {actions.includes('pause') ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                loading={pendingAction === 'pause'}
                onClick={() => setConfirm('pause')}
              >
                <Pause aria-hidden="true" />
                {t('subscriptions.pause')}
              </Button>
            ) : null}
            {actions.includes('cancel') ? (
              <Button
                variant="outline-destructive"
                size="sm"
                disabled={busy}
                loading={pendingAction === 'cancel'}
                onClick={() => setConfirm('cancel')}
              >
                <XCircle aria-hidden="true" />
                {t('subscriptions.cancel')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {actionError ? (
            <Alert tone="destructive" onDismiss={() => setActionError(null)}>
              {actionError}
            </Alert>
          ) : null}

          <SectionCard title={t('subscriptions.detail.sectionPlan')}>
            <PlanFacts sub={sub} bcp47={bcp47} />
          </SectionCard>

          <SectionCard title={t('subscriptions.detail.sectionServices')}>
            {sub.servicesIncluded.length > 0 ? (
              <ul className="flex flex-col gap-2 text-2sm">
                {sub.servicesIncluded.map((service, i) => (
                  <li key={`${i}:${service}`} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0 break-words">{service}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-2sm text-muted-foreground">
                {t('subscriptions.detail.noServices')}
              </p>
            )}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('subscriptions.detail.sectionCustomer')}>
            <KeyValueList layout="stacked">
              <KeyValue
                label={t('subscriptions.form.customerName')}
                value={sub.customerName}
                empty="—"
              />
              <KeyValue
                label={t('subscriptions.form.customerEmail')}
                value={
                  email ? (
                    <a
                      href={`mailto:${email}`}
                      className="break-all rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {email}
                    </a>
                  ) : null
                }
                empty="—"
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('subscriptions.detail.sectionRecord')}>
            <KeyValueList layout="stacked">
              <KeyValue
                label={t('subscriptions.form.stripeId')}
                empty={t('subscriptions.detail.notLinked')}
                value={
                  sub.stripeSubscriptionId ? (
                    <span className="break-all font-mono text-xs">{sub.stripeSubscriptionId}</span>
                  ) : null
                }
              />
              <KeyValue
                label={t('subscriptions.detail.pausedAt')}
                value={
                  sub.pausedAt ? <span className="tabular-nums">{date(sub.pausedAt)}</span> : null
                }
              />
              <KeyValue
                label={t('subscriptions.detail.cancelledAt')}
                value={
                  sub.cancelledAt ? (
                    <span className="tabular-nums">{date(sub.cancelledAt)}</span>
                  ) : null
                }
              />
              <KeyValue
                label={t('subscriptions.detail.created')}
                value={<span className="tabular-nums">{formatDateTime(sub.createdAt, bcp47)}</span>}
              />
              <KeyValue
                label={t('subscriptions.detail.updated')}
                value={<span className="tabular-nums">{formatDateTime(sub.updatedAt, bcp47)}</span>}
              />
            </KeyValueList>
          </SectionCard>
        </div>
      </div>

      {confirm && confirmCopy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !lifecycle.isPending) setConfirm(null);
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.title}
          cancelLabel={t('common.cancel')}
          isDangerous={confirmCopy.isDangerous}
          isPending={lifecycle.isPending}
          onConfirm={() => lifecycle.mutate(confirm)}
        />
      ) : null}
    </PageContainer>
  );
}

function PlanFacts({ sub, bcp47 }: { sub: SubscriptionRow; bcp47: string }) {
  const t = useT();
  return (
    <KeyValueList layout="grid">
      <KeyValue label={t('subscriptions.plan')} value={sub.planName} />
      <KeyValue
        label={t('subscriptions.detail.monthlyPrice')}
        value={
          <span className="tabular-nums">
            {formatCurrency(sub.monthlyPriceCents / 100, 'EUR', bcp47)}
          </span>
        }
      />
      <KeyValue
        label={t('subscriptions.detail.interval')}
        value={
          sub.intervalMonths === 1
            ? t('subscriptions.detail.intervalMonthly')
            : t('subscriptions.detail.intervalEvery', { n: sub.intervalMonths })
        }
      />
      <KeyValue
        label={t('subscriptions.nextService')}
        empty={t('subscriptions.detail.noNextService')}
        value={
          sub.nextServiceDate ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {formatDateTime(sub.nextServiceDate, bcp47, { dateStyle: 'medium' })}
            </span>
          ) : null
        }
      />
    </KeyValueList>
  );
}
