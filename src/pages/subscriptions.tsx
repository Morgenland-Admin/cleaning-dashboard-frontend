import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CreditCard,
  Inbox,
  Layers,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  subscriptionsAdminApi,
  type SubscriptionAction,
  type SubscriptionCreateInput,
  type SubscriptionRow,
  type SubscriptionStatus,
  type SubscriptionUpdateInput,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';

type StatusFilter = SubscriptionStatus | 'all';

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'paused', 'past_due', 'cancelled'];

const STATUS_TONE: Record<SubscriptionStatus, 'success' | 'info' | 'danger' | 'neutral'> = {
  active: 'success',
  paused: 'info',
  past_due: 'danger',
  cancelled: 'neutral',
};

/** Valid lifecycle transitions; cancelled is terminal. */
function lifecycleActionsFor(status: SubscriptionStatus): SubscriptionAction[] {
  switch (status) {
    case 'active':
      return ['pause', 'cancel'];
    case 'paused':
    case 'past_due':
      return ['resume', 'cancel'];
    case 'cancelled':
      return [];
  }
}

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function SubscriptionsPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  usePageTitle(t('subscriptions.title'));

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sheet, setSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; sub: SubscriptionRow } | null
  >(null);
  const [confirm, setConfirm] = useState<{
    sub: SubscriptionRow;
    action: 'pause' | 'cancel';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useInfiniteQuery({
    queryKey: ['subscriptions', slug, statusFilter] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      subscriptionsAdminApi.list(
        slug,
        {
          limit: 50,
          cursor: pageParam ?? undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.subscriptions),
    [listQuery.data],
  );

  const lifecycle = useMutation({
    mutationFn: (vars: { id: number; action: SubscriptionAction }) =>
      subscriptionsAdminApi.action(slug, vars.id, vars.action),
    onSuccess: () => {
      setConfirm(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', slug] });
    },
    onError: (err) => {
      setConfirm(null);
      // Surface backend 409/502 (Stripe mirror) messages verbatim.
      setActionError(errMessage(err));
    },
  });

  function runAction(sub: SubscriptionRow, action: SubscriptionAction) {
    if (action === 'resume') {
      lifecycle.mutate({ id: sub.id, action });
    } else {
      setConfirm({ sub, action });
    }
  }

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <PageHeading title={t('subscriptions.title')} subtitle={t('subscriptions.subtitle')} />
        <EmptyState
          icon={<Layers className="size-6" aria-hidden="true" />}
          message={t('subscriptions.selectBrandFirst')}
        />
      </div>
    );
  }

  const queryErrorMessage = listQuery.error ? errMessage(listQuery.error) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeading
        title={t('subscriptions.title')}
        subtitle={t('subscriptions.subtitle')}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{t('subscriptions.title')}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-busy={listQuery.isFetching || undefined}
            >
              <RefreshCcw
                className={cn('size-3.5', listQuery.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              {t('common.refresh')}
            </Button>
            <Button size="sm" className="h-11 sm:h-9" onClick={() => setSheet({ mode: 'create' })}>
              <Plus className="size-3.5" aria-hidden="true" />
              {t('subscriptions.newSubscription')}
            </Button>
          </>
        }
      />

      <div
        role="tablist"
        aria-label={t('subscriptions.filterStatus')}
        className="inline-flex flex-wrap items-center gap-1 self-start rounded-lg border border-border bg-card p-1"
      >
        {STATUS_FILTERS.map((value) => {
          const active = statusFilter === value;
          return (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setStatusFilter(value)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:px-2.5 sm:text-[11px] sm:uppercase sm:tracking-wide',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                value === 'past_due' && !active && 'text-destructive/80 hover:text-destructive',
              )}
            >
              {value === 'all'
                ? t('subscriptions.filterAll')
                : t(`subscriptions.status.${value}` as never)}
            </button>
          );
        })}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t('common.close')}
            className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : queryErrorMessage ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{queryErrorMessage}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => void listQuery.refetch()}
          >
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden="true" />}
          title={t('subscriptions.empty')}
          message={t('subscriptions.emptyHint')}
          action={
            <Button size="sm" className="h-11 sm:h-9" onClick={() => setSheet({ mode: 'create' })}>
              <Plus className="size-3.5" aria-hidden="true" />
              {t('subscriptions.newSubscription')}
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                bcp47={bcp47}
                isActing={lifecycle.isPending}
                onEdit={() => setSheet({ mode: 'edit', sub })}
                onAction={(action) => runAction(sub, action)}
              />
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('subscriptions.plan')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('subscriptions.customer')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('subscriptions.price')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('subscriptions.nextService')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('subscriptions.filterStatus')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('subscriptions.edit')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((sub) => (
                  <SubscriptionTableRow
                    key={sub.id}
                    sub={sub}
                    bcp47={bcp47}
                    isActing={lifecycle.isPending}
                    onEdit={() => setSheet({ mode: 'edit', sub })}
                    onAction={(action) => runAction(sub, action)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <InfiniteScrollSentinel
            hasMore={listQuery.hasNextPage}
            isLoading={listQuery.isFetchingNextPage}
            onIntersect={() => {
              if (!listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
            }}
          />
        </>
      )}

      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !lifecycle.isPending) setConfirm(null);
          }}
          title={confirm.action === 'cancel' ? t('subscriptions.cancel') : t('subscriptions.pause')}
          description={
            confirm.action === 'cancel'
              ? t('subscriptions.confirmCancel')
              : t('subscriptions.confirmPause')
          }
          confirmLabel={
            confirm.action === 'cancel' ? t('subscriptions.cancel') : t('subscriptions.pause')
          }
          cancelLabel={t('common.cancel')}
          isDangerous={confirm.action === 'cancel'}
          isPending={lifecycle.isPending}
          onConfirm={() => lifecycle.mutate({ id: confirm.sub.id, action: confirm.action })}
        />
      ) : null}

      {sheet ? (
        <SubscriptionSheet
          key={sheet.mode === 'edit' ? `edit-${sheet.sub.id}` : 'create'}
          slug={slug}
          editing={sheet.mode === 'edit' ? sheet.sub : null}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void queryClient.invalidateQueries({ queryKey: ['subscriptions', slug] });
          }}
        />
      ) : null}
    </div>
  );
}

// --- Row presentation --------------------------------------------------------

function PriceLabel({ sub, bcp47 }: { sub: SubscriptionRow; bcp47: string }) {
  const t = useT();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatCurrency(sub.monthlyPriceCents / 100, 'EUR', bcp47)}{' '}
      <span className="text-xs text-muted-foreground">
        {sub.intervalMonths === 1
          ? t('subscriptions.perMonth')
          : t('subscriptions.perMonths', { n: sub.intervalMonths })}
      </span>
    </span>
  );
}

function StripeLinkedBadge() {
  const t = useT();
  return (
    <Badge variant="info" className="gap-1 whitespace-nowrap px-1.5 py-px text-[10px]">
      <CreditCard className="size-3" aria-hidden="true" />
      {t('subscriptions.stripeLinked')}
    </Badge>
  );
}

function RowActions({
  sub,
  isActing,
  onEdit,
  onAction,
  layout,
}: {
  sub: SubscriptionRow;
  isActing: boolean;
  onEdit: () => void;
  onAction: (action: SubscriptionAction) => void;
  layout: 'icons' | 'buttons';
}) {
  const t = useT();
  const actions = lifecycleActionsFor(sub.status);
  const terminal = sub.status === 'cancelled';
  if (terminal) return null;

  if (layout === 'icons') {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`${t('subscriptions.edit')}: ${sub.planName}`}
          title={t('subscriptions.edit')}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        {actions.includes('pause') ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={isActing}
            onClick={() => onAction('pause')}
            aria-label={`${t('subscriptions.pause')}: ${sub.planName}`}
            title={t('subscriptions.pause')}
          >
            <Pause className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {actions.includes('resume') ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={isActing}
            onClick={() => onAction('resume')}
            aria-label={`${t('subscriptions.resume')}: ${sub.planName}`}
            title={t('subscriptions.resume')}
          >
            <Play className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {actions.includes('cancel') ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={isActing}
            onClick={() => onAction('cancel')}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${t('subscriptions.cancel')}: ${sub.planName}`}
            title={t('subscriptions.cancel')}
          >
            <XCircle className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" className="h-11 flex-1" onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden="true" />
        {t('subscriptions.edit')}
      </Button>
      {actions.includes('pause') ? (
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1"
          disabled={isActing}
          onClick={() => onAction('pause')}
        >
          <Pause className="size-3.5" aria-hidden="true" />
          {t('subscriptions.pause')}
        </Button>
      ) : null}
      {actions.includes('resume') ? (
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1"
          disabled={isActing}
          onClick={() => onAction('resume')}
        >
          <Play className="size-3.5" aria-hidden="true" />
          {t('subscriptions.resume')}
        </Button>
      ) : null}
      {actions.includes('cancel') ? (
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isActing}
          onClick={() => onAction('cancel')}
        >
          <XCircle className="size-3.5" aria-hidden="true" />
          {t('subscriptions.cancel')}
        </Button>
      ) : null}
    </div>
  );
}

function SubscriptionCard({
  sub,
  bcp47,
  isActing,
  onEdit,
  onAction,
}: {
  sub: SubscriptionRow;
  bcp47: string;
  isActing: boolean;
  onEdit: () => void;
  onAction: (action: SubscriptionAction) => void;
}) {
  const t = useT();
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
        sub.status === 'cancelled' && 'opacity-60',
        sub.status === 'past_due' && 'border-destructive/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{sub.planName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {sub.customerName ? `${sub.customerName} · ${sub.customerEmail}` : sub.customerEmail}
          </p>
        </div>
        <StatusBadge
          label={t(`subscriptions.status.${sub.status}` as never)}
          tone={STATUS_TONE[sub.status]}
          className="shrink-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <PriceLabel sub={sub} bcp47={bcp47} />
        {sub.nextServiceDate ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {formatDateTime(sub.nextServiceDate, bcp47, { dateStyle: 'medium' })}
          </span>
        ) : null}
        {sub.stripeSubscriptionId ? <StripeLinkedBadge /> : null}
      </div>
      <RowActions
        sub={sub}
        isActing={isActing}
        onEdit={onEdit}
        onAction={onAction}
        layout="buttons"
      />
    </li>
  );
}

function SubscriptionTableRow({
  sub,
  bcp47,
  isActing,
  onEdit,
  onAction,
}: {
  sub: SubscriptionRow;
  bcp47: string;
  isActing: boolean;
  onEdit: () => void;
  onAction: (action: SubscriptionAction) => void;
}) {
  const t = useT();
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-muted/40',
        sub.status === 'cancelled' && 'opacity-60',
        sub.status === 'past_due' && 'bg-destructive/5',
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{sub.planName}</span>
          {sub.stripeSubscriptionId ? <StripeLinkedBadge /> : null}
        </div>
      </td>
      <td className="max-w-[16rem] px-4 py-3">
        {sub.customerName ? (
          <>
            <p className="truncate">{sub.customerName}</p>
            <p className="truncate text-xs text-muted-foreground">{sub.customerEmail}</p>
          </>
        ) : (
          <p className="truncate">{sub.customerEmail}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <PriceLabel sub={sub} bcp47={bcp47} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {sub.nextServiceDate
          ? formatDateTime(sub.nextServiceDate, bcp47, { dateStyle: 'medium' })
          : '—'}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          label={t(`subscriptions.status.${sub.status}` as never)}
          tone={STATUS_TONE[sub.status]}
        />
      </td>
      <td className="px-4 py-3">
        <RowActions
          sub={sub}
          isActing={isActing}
          onEdit={onEdit}
          onAction={onAction}
          layout="icons"
        />
      </td>
    </tr>
  );
}

// --- Create / edit sheet -------------------------------------------------------

/** Accepts "49.90" and German "49,90" / "1.234,56"; returns integer cents. */
function parseEurToCents(value: string): number | undefined {
  let v = value.trim();
  if (!v) return undefined;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function SubscriptionSheet({
  slug,
  editing,
  onClose,
  onSaved,
}: {
  slug: CompanySlug;
  editing: SubscriptionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = editing != null;

  const [customerEmail, setCustomerEmail] = useState(editing?.customerEmail ?? '');
  const [customerName, setCustomerName] = useState(editing?.customerName ?? '');
  const [planName, setPlanName] = useState(editing?.planName ?? '');
  const [monthlyPrice, setMonthlyPrice] = useState(
    editing ? (editing.monthlyPriceCents / 100).toFixed(2) : '',
  );
  const [intervalMonths, setIntervalMonths] = useState(String(editing?.intervalMonths ?? 1));
  const [nextServiceDate, setNextServiceDate] = useState(
    editing?.nextServiceDate ? editing.nextServiceDate.slice(0, 10) : '',
  );
  const [stripeId, setStripeId] = useState(editing?.stripeSubscriptionId ?? '');
  const [services, setServices] = useState(editing?.servicesIncluded.join(', ') ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const cents = parseEurToCents(monthlyPrice);
      const interval = Math.max(1, parseInt(intervalMonths, 10) || 1);
      const servicesArr = services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (editing) {
        const patch: SubscriptionUpdateInput = {
          planName: planName.trim(),
          intervalMonths: interval,
          stripeSubscriptionId: stripeId.trim() === '' ? null : stripeId.trim(),
          servicesIncluded: servicesArr,
          nextServiceDate: nextServiceDate === '' ? null : nextServiceDate,
        };
        if (cents !== undefined) patch.monthlyPriceCents = cents;
        return subscriptionsAdminApi.update(slug, editing.id, patch);
      }

      const payload: SubscriptionCreateInput = {
        customerEmail: customerEmail.trim(),
        planName: planName.trim(),
        intervalMonths: interval,
      };
      if (customerName.trim()) payload.customerName = customerName.trim();
      if (cents !== undefined) payload.monthlyPriceCents = cents;
      if (stripeId.trim()) payload.stripeSubscriptionId = stripeId.trim();
      if (servicesArr.length > 0) payload.servicesIncluded = servicesArr;
      if (nextServiceDate) payload.nextServiceDate = nextServiceDate;
      return subscriptionsAdminApi.create(slug, payload);
    },
    onSuccess: onSaved,
    onError: (err) => setFormError(errMessage(err)),
  });

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-5 overflow-y-auto bg-card text-foreground sm:max-w-md"
      >
        <div>
          <SheetTitle className="not-sr-only font-serif text-xl tracking-tight">
            {isEdit ? t('subscriptions.edit') : t('subscriptions.newSubscription')}
          </SheetTitle>
          <SheetDescription>{t('subscriptions.subtitle')}</SheetDescription>
        </div>

        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            if (!planName.trim() || (!isEdit && !customerEmail.trim())) return;
            mutation.mutate();
          }}
        >
          <FormField label={t('subscriptions.form.customerEmail')} required={!isEdit}>
            <Input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              disabled={isEdit}
              autoComplete="email"
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('subscriptions.form.customerName')}>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={isEdit}
              autoComplete="name"
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('subscriptions.form.planName')} required>
            <Input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="h-11 sm:h-9"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('subscriptions.form.monthlyPrice')}>
              <Input
                inputMode="decimal"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="49,90"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('subscriptions.form.intervalMonths')}>
              <Input
                type="number"
                min={1}
                step={1}
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
          </div>
          <FormField label={t('subscriptions.form.nextServiceDate')}>
            <Input
              type="date"
              value={nextServiceDate}
              onChange={(e) => setNextServiceDate(e.target.value)}
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('subscriptions.form.stripeId')}>
            <Input
              value={stripeId}
              onChange={(e) => setStripeId(e.target.value)}
              placeholder="sub_…"
              className="h-11 font-mono text-xs sm:h-9"
            />
          </FormField>
          <FormField label={t('subscriptions.form.services')}>
            <Input
              value={services}
              onChange={(e) => setServices(e.target.value)}
              className="h-11 sm:h-9"
            />
          </FormField>

          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="mt-auto flex gap-2 pt-2">
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="h-11 flex-1 sm:h-9">
                {t('common.cancel')}
              </Button>
            </SheetClose>
            <Button type="submit" className="h-11 flex-1 sm:h-9" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : isEdit ? null : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              {isEdit ? t('subscriptions.form.save') : t('subscriptions.form.create')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// --- Skeleton ------------------------------------------------------------------

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-24 shrink-0 animate-pulse rounded bg-muted/60" />
        </li>
      ))}
    </ul>
  );
}
