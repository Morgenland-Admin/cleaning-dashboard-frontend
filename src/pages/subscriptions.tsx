import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CreditCard,
  Inbox,
  Layers,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  errMessage,
  subscriptionsAdminApi,
  type SubscriptionAction,
  type SubscriptionRow,
  type SubscriptionStatus,
} from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { STATUS_TONE, lifecycleActionsFor } from '@/pages/subscriptions-shared';

import type { ListNavState } from '@/lib/list-nav';

type StatusFilter = SubscriptionStatus | 'all';

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'paused', 'past_due', 'cancelled'];

/** Stretched row link (one real link per row); row actions sit above it (z-[1]), below the sticky header (z-10). */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export function SubscriptionsPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle(t('subscriptions.title'));

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
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

  const navState: ListNavState = useMemo(
    () => ({ from: `${location.pathname}${location.search}`, ids: rows.map((s) => s.id) }),
    [location.pathname, location.search, rows],
  );

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [statusFilter, slug]);

  const lifecycle = useMutation({
    mutationFn: (vars: { id: number; action: SubscriptionAction }) =>
      subscriptionsAdminApi.action(slug, vars.id, vars.action),
    onSuccess: (_data, vars) => {
      setConfirm(null);
      setActionError(null);
      toast.success(t(`subscriptions.toast.${vars.action}` as never));
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', slug] });
    },
    onError: (err) => {
      setConfirm(null);
      // Surface backend 409/502 (Stripe mirror) messages verbatim.
      setActionError(errMessage(err));
    },
  });

  const pending = lifecycle.isPending ? lifecycle.variables : undefined;

  function runAction(sub: SubscriptionRow, action: SubscriptionAction) {
    if (action === 'resume') {
      lifecycle.mutate({ id: sub.id, action });
    } else {
      setConfirm({ sub, action });
    }
  }

  if (isAllBrands) {
    return (
      <PageContainer width="full">
        <PageHeading title={t('subscriptions.title')} subtitle={t('subscriptions.subtitle')} />
        <EmptyState
          variant="dashed"
          icon={<Layers aria-hidden="true" />}
          message={t('subscriptions.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const newButton = (
    <Button size="sm" asChild>
      <Link to="/abos/neu">
        <Plus aria-hidden="true" />
        {t('subscriptions.newSubscription')}
      </Link>
    </Button>
  );

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        title={t('subscriptions.title')}
        subtitle={t('subscriptions.subtitle')}
        breadcrumb={[{ label: activeProject.name }, { label: t('subscriptions.title') }]}
        actions={
          <>
            <RefreshButton
              fetching={listQuery.isFetching}
              onClick={() => void listQuery.refetch()}
            />
            {newButton}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          label={t('subscriptions.filterStatus')}
          value={statusFilter}
          onValueChange={setStatusFilter}
          overflow="scroll"
          className="sm:w-auto"
          options={STATUS_FILTERS.map((value) => ({
            value,
            label:
              value === 'all'
                ? t('subscriptions.filterAll')
                : t(`subscriptions.status.${value}` as never),
            icon:
              value === 'past_due' ? (
                <AlertCircle className="text-destructive" aria-hidden="true" />
              ) : undefined,
          }))}
        />
        {rows.length > 0 ? (
          <p className="shrink-0 text-2sm tabular-nums text-muted-foreground">
            {listQuery.hasNextPage
              ? t('subscriptions.countMore', { n: rows.length })
              : t('subscriptions.count', { n: rows.length })}
          </p>
        ) : null}
      </div>

      {actionError ? (
        <Alert tone="destructive" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      {listQuery.isLoading ? (
        <div role="status" aria-label={t('common.loading')}>
          <ListSkeleton rows={4} avatar={false} />
        </div>
      ) : listQuery.error ? (
        <ErrorState
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Inbox aria-hidden="true" />}
          title={t('subscriptions.empty')}
          message={t('subscriptions.emptyHint')}
          action={newButton}
        />
      ) : (
        // overflow-clip rounds the corners without becoming a scroll container, so the sticky header pins to the list box.
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div
            ref={listScrollRef}
            className="lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <ul className="divide-y divide-border md:hidden">
              {rows.map((sub) => (
                <SubscriptionListItem
                  key={sub.id}
                  sub={sub}
                  bcp47={bcp47}
                  navState={navState}
                  pendingAction={pending?.id === sub.id ? pending.action : null}
                  onEdit={() => navigate(`/abos/${sub.id}/bearbeiten`)}
                  onAction={(action) => runAction(sub, action)}
                />
              ))}
            </ul>

            <Table containerClassName="hidden w-full md:block">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('subscriptions.plan')}</TableHead>
                  <TableHead>{t('subscriptions.customer')}</TableHead>
                  <TableHead className="text-right">{t('subscriptions.price')}</TableHead>
                  <TableHead>{t('subscriptions.nextService')}</TableHead>
                  <TableHead>{t('subscriptions.filterStatus')}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{t('subscriptions.edit')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sub) => (
                  <SubscriptionTableRow
                    key={sub.id}
                    sub={sub}
                    bcp47={bcp47}
                    navState={navState}
                    pendingAction={pending?.id === sub.id ? pending.action : null}
                    onEdit={() => navigate(`/abos/${sub.id}/bearbeiten`)}
                    onAction={(action) => runAction(sub, action)}
                  />
                ))}
              </TableBody>
            </Table>

            <InfiniteScrollSentinel
              hasMore={listQuery.hasNextPage}
              isLoading={listQuery.isFetchingNextPage}
              onIntersect={() => {
                if (!listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
              }}
              // Root only where the box scrolls (lg+); otherwise the sentinel is always visible and loads every page.
              rootRef={isDesktop ? listScrollRef : undefined}
            />
          </div>
        </div>
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
    </PageContainer>
  );
}

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
    <Badge variant="info">
      <CreditCard aria-hidden="true" />
      {t('subscriptions.stripeLinked')}
    </Badge>
  );
}

function nextServiceLabel(sub: SubscriptionRow, bcp47: string): string | null {
  return sub.nextServiceDate
    ? formatDateTime(sub.nextServiceDate, bcp47, { dateStyle: 'medium' })
    : null;
}

function IconAction({
  label,
  tooltip,
  onClick,
  disabled,
  loading,
  className,
  children,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          loading={loading}
          aria-label={label}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface RowActionProps {
  sub: SubscriptionRow;
  pendingAction: SubscriptionAction | null;
  onEdit: () => void;
  onAction: (action: SubscriptionAction) => void;
}

function RowIconActions({ sub, pendingAction, onEdit, onAction }: RowActionProps) {
  const t = useT();
  if (sub.status === 'cancelled') return null;
  const actions = lifecycleActionsFor(sub.status);
  const busy = pendingAction !== null;
  return (
    <div className="relative z-[1] flex items-center justify-end gap-0.5">
      <IconAction
        label={`${t('subscriptions.edit')}: ${sub.planName}`}
        tooltip={t('subscriptions.edit')}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </IconAction>
      {actions.includes('pause') ? (
        <IconAction
          label={`${t('subscriptions.pause')}: ${sub.planName}`}
          tooltip={t('subscriptions.pause')}
          disabled={busy}
          loading={pendingAction === 'pause'}
          onClick={() => onAction('pause')}
        >
          <Pause aria-hidden="true" />
        </IconAction>
      ) : null}
      {actions.includes('resume') ? (
        <IconAction
          label={`${t('subscriptions.resume')}: ${sub.planName}`}
          tooltip={t('subscriptions.resume')}
          disabled={busy}
          loading={pendingAction === 'resume'}
          onClick={() => onAction('resume')}
        >
          <Play aria-hidden="true" />
        </IconAction>
      ) : null}
      {actions.includes('cancel') ? (
        <IconAction
          label={`${t('subscriptions.cancel')}: ${sub.planName}`}
          tooltip={t('subscriptions.cancel')}
          disabled={busy}
          loading={pendingAction === 'cancel'}
          onClick={() => onAction('cancel')}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <XCircle aria-hidden="true" />
        </IconAction>
      ) : null}
    </div>
  );
}

function RowMenuActions({ sub, pendingAction, onEdit, onAction }: RowActionProps) {
  const t = useT();
  if (sub.status === 'cancelled') return null;
  const actions = lifecycleActionsFor(sub.status);
  const busy = pendingAction !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          loading={busy}
          className="relative z-[1]"
          aria-label={t('subscriptions.rowActions', { plan: sub.planName })}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden="true" />
          {t('subscriptions.edit')}
        </DropdownMenuItem>
        {actions.includes('pause') ? (
          <DropdownMenuItem disabled={busy} onSelect={() => onAction('pause')}>
            <Pause aria-hidden="true" />
            {t('subscriptions.pause')}
          </DropdownMenuItem>
        ) : null}
        {actions.includes('resume') ? (
          <DropdownMenuItem disabled={busy} onSelect={() => onAction('resume')}>
            <Play aria-hidden="true" />
            {t('subscriptions.resume')}
          </DropdownMenuItem>
        ) : null}
        {actions.includes('cancel') ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => onAction('cancel')}
              className="text-destructive focus:text-destructive"
            >
              <XCircle aria-hidden="true" />
              {t('subscriptions.cancel')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowProps extends RowActionProps {
  bcp47: string;
  navState: ListNavState;
}

function SubscriptionListItem({ bcp47, navState, ...props }: RowProps) {
  const t = useT();
  const { sub } = props;
  const next = nextServiceLabel(sub, bcp47);
  return (
    <li className="relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/abos/${sub.id}`}
            state={navState}
            className={cn('min-w-0 truncate text-2sm font-medium text-foreground', ROW_LINK)}
          >
            {sub.planName}
          </Link>
          <StatusBadge
            label={t(`subscriptions.status.${sub.status}` as never)}
            tone={STATUS_TONE[sub.status]}
          />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {sub.customerName ? `${sub.customerName} · ${sub.customerEmail}` : sub.customerEmail}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <PriceLabel sub={sub} bcp47={bcp47} />
          {next ? (
            <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {next}
            </span>
          ) : null}
          {sub.stripeSubscriptionId ? <StripeLinkedBadge /> : null}
        </div>
      </div>
      <RowMenuActions {...props} />
    </li>
  );
}

function SubscriptionTableRow({ bcp47, navState, ...props }: RowProps) {
  const t = useT();
  const { sub } = props;
  const customer = sub.customerName ? `${sub.customerName} · ${sub.customerEmail}` : null;
  return (
    <TableRow className="relative">
      <TableCell className="max-w-[22rem]">
        <div className="flex items-center gap-2">
          <Link
            to={`/abos/${sub.id}`}
            state={navState}
            title={sub.planName}
            className={cn(
              'min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline',
              ROW_LINK,
            )}
          >
            {sub.planName}
          </Link>
          {sub.stripeSubscriptionId ? <StripeLinkedBadge /> : null}
        </div>
      </TableCell>
      <TableCell className="max-w-[20rem]">
        <p className="truncate" title={customer ?? sub.customerEmail}>
          {sub.customerName ? (
            <>
              {sub.customerName}{' '}
              <span className="text-muted-foreground">· {sub.customerEmail}</span>
            </>
          ) : (
            sub.customerEmail
          )}
        </p>
      </TableCell>
      <TableCell className="text-right">
        <PriceLabel sub={sub} bcp47={bcp47} />
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {nextServiceLabel(sub, bcp47) ?? '—'}
      </TableCell>
      <TableCell>
        <StatusBadge
          label={t(`subscriptions.status.${sub.status}` as never)}
          tone={STATUS_TONE[sub.status]}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <RowIconActions {...props} />
      </TableCell>
    </TableRow>
  );
}
