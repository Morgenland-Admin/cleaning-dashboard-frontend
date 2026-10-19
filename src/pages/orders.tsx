import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ordersAdminApi, type OrderRow, ApiError } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import {
  KIND_LABEL,
  STATUS_FILTERS,
  formatDay,
  formatSlot,
  parseStatusFilter,
  type OrderNavState,
  type StatusFilter,
  type Translate,
} from '@/pages/orders-shared';

import type { CompanySlug, Project } from '@/contexts/project-context';

const PAGE_SIZE = 50;

/**
 * The order number's `::after` stretches over the row: one click target and Tab stop without an
 * onClick on the <tr>; the focus ring is drawn on that overlay, inset.
 */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

type ListOrder = OrderRow & { companySlug?: CompanySlug; companyName?: string };

export function OrdersPage() {
  const [searchParams] = useSearchParams();
  // `?order=<id>` links already sent in mail must keep working: redirect to the order page.
  const legacy = searchParams.get('order');
  if (legacy && /^\d+$/.test(legacy)) return <Navigate to={`/auftraege/${legacy}`} replace />;
  return <OrdersList />;
}

function OrdersList() {
  const t = useT();
  const { activeProject, isAllBrands, setBrandView, projects } = useProject();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle(t('orders.title'));

  const tab = parseStatusFilter(searchParams.get('status'));
  function setTab(next: StatusFilter) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'all') params.delete('status');
        else params.set('status', next);
        return params;
      },
      { replace: true },
    );
  }

  // From lg the table scrolls inside its own card (sticky header in reach); below
  // that the page scrolls. The sentinel's root follows.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const infinite = useInfiniteQuery({
    queryKey: ['orders-infinite', activeProject.companySlug, tab] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      ordersAdminApi.list(
        activeProject.companySlug,
        {
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
          status: tab === 'all' ? undefined : tab,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const cross = useQuery({
    queryKey: ['orders-cross', tab] as const,
    enabled: isAllBrands,
    queryFn: ({ signal }) =>
      ordersAdminApi.listAllCompanies(
        { limit: PAGE_SIZE, status: tab === 'all' ? undefined : tab },
        signal,
      ),
  });

  const orders = useMemo(() => {
    return infinite.data?.pages.flatMap((p) => p.orders) ?? [];
  }, [infinite.data]);
  const crossOrders = useMemo(() => cross.data?.orders ?? [], [cross.data]);
  const rows: ListOrder[] = isAllBrands ? crossOrders : orders;

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, activeProject.companySlug, isAllBrands]);

  function brandFor(slug: CompanySlug | undefined): Project | undefined {
    return slug ? projects.find((p) => p.companySlug === slug) : undefined;
  }

  // The page loads one brand at a time, so in the cross-brand list prev/next are the same brand's rows.
  const idsByBrand = useMemo(() => {
    const map = new Map<CompanySlug, number[]>();
    for (const o of crossOrders) {
      const list = map.get(o.companySlug) ?? [];
      list.push(o.id);
      map.set(o.companySlug, list);
    }
    return map;
  }, [crossOrders]);
  const brandIds = useMemo(() => orders.map((o) => o.id), [orders]);
  function navStateFor(order: ListOrder): OrderNavState {
    return {
      from: location.search,
      ids: isAllBrands && order.companySlug ? idsByBrand.get(order.companySlug) : brandIds,
    };
  }
  // A cross-brand row belongs to another brand: switch to it before the page
  // loads, so the order is fetched for the brand it lives in.
  function onOpen(order: ListOrder) {
    if (isAllBrands && order.companySlug) setBrandView(order.companySlug);
  }

  const rowSync = useMutation({
    mutationFn: ({ companySlug, id }: { companySlug: CompanySlug; id: number }) =>
      ordersAdminApi.syncStripe(companySlug, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-infinite'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['order-detail'], exact: false });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.stripe.syncFailed')),
  });
  const syncingId = rowSync.isPending ? rowSync.variables?.id : undefined;
  function syncRow(order: ListOrder) {
    rowSync.mutate({ companySlug: order.companySlug ?? activeProject.companySlug, id: order.id });
  }

  const isFetching = isAllBrands ? cross.isFetching : infinite.isFetching;
  const isLoading = isAllBrands ? cross.isLoading : infinite.isLoading;
  const listError = isAllBrands ? cross.error : infinite.error;
  const nextPageFailed = !isAllBrands && infinite.isFetchNextPageError;
  function refetchActive() {
    if (isAllBrands) void cross.refetch();
    else void infinite.refetch();
  }

  const sentinel = isAllBrands ? null : (
    <InfiniteScrollSentinel
      onIntersect={() => {
        void infinite.fetchNextPage();
      }}
      hasMore={!!infinite.hasNextPage}
      isLoading={infinite.isFetchingNextPage}
      // Only a root when that box actually scrolls — otherwise the sentinel
      // sits permanently inside it and pages in the whole list.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  );

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('orders.title')}
        subtitle={
          isAllBrands
            ? t('orders.subtitleAll')
            : t('orders.subtitleBrand', { brand: activeProject.name })
        }
        actions={
          <>
            {isAllBrands ? (
              <Button size="sm" disabled title={t('orders.pickBrandFirst')}>
                <Plus aria-hidden="true" />
                {t('orders.newOrder')}
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to="/auftraege/neu" state={{ from: location.search }}>
                  <Plus aria-hidden="true" />
                  {t('orders.newOrder')}
                </Link>
              </Button>
            )}
            <RefreshButton onClick={refetchActive} fetching={isFetching} />
          </>
        }
      />

      <SegmentedControl
        label={t('orders.filterLabel')}
        value={tab}
        onValueChange={setTab}
        overflow="scroll"
        className="w-fit"
        options={STATUS_FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
      />

      <div className="mt-4">
        {isLoading ? (
          <TableSkeleton />
        ) : listError && rows.length === 0 ? (
          <ErrorState
            title={t('orders.listLoadFailed')}
            error={listError}
            onRetry={refetchActive}
            retrying={isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<Inbox />}
            title={t('orders.empty')}
            message={t('orders.emptyHint')}
          />
        ) : (
          <>
            {listError && !nextPageFailed ? (
              <ErrorState
                className="mb-3"
                title={t('orders.listLoadFailed')}
                error={listError}
                onRetry={refetchActive}
                retrying={isFetching}
              />
            ) : null}

            <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
              {rows.map((o) => (
                <OrderMobileRow
                  key={`${o.companySlug ?? ''}:${o.id}`}
                  order={o}
                  brand={isAllBrands ? brandFor(o.companySlug) : undefined}
                  bcp47={bcp47}
                  navState={navStateFor(o)}
                  onOpen={() => onOpen(o)}
                  isSyncing={syncingId === o.id}
                  onSync={() => syncRow(o)}
                />
              ))}
            </ul>

            {/* Scroll container (sideways from md, vertical from lg). The sticky header anchors to it, so
                the Table's own wrapper must not scroll (`containerClassName="w-full"`). */}
            <div
              ref={listScrollRef}
              className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-15rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    {isAllBrands ? <TableHead>{t('orders.col.brand')}</TableHead> : null}
                    <TableHead>{t('orders.col.number')}</TableHead>
                    <TableHead>{t('orders.col.customer')}</TableHead>
                    <TableHead>{t('orders.col.service')}</TableHead>
                    <TableHead>{t('orders.col.date')}</TableHead>
                    <TableHead>{t('orders.col.status')}</TableHead>
                    <TableHead className="text-right">{t('orders.col.amount')}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t('orders.col.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <OrderTableRow
                      key={`${o.companySlug ?? ''}:${o.id}`}
                      order={o}
                      brand={isAllBrands ? brandFor(o.companySlug) : undefined}
                      showBrand={isAllBrands}
                      bcp47={bcp47}
                      navState={navStateFor(o)}
                      onOpen={() => onOpen(o)}
                      isSyncing={syncingId === o.id}
                      onSync={() => syncRow(o)}
                    />
                  ))}
                </TableBody>
              </Table>
              {isDesktop ? sentinel : null}
            </div>
            {isDesktop ? null : sentinel}

            {isAllBrands && crossOrders.length >= PAGE_SIZE ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t('common.allBrandsHasMore')}
              </p>
            ) : null}
            {nextPageFailed && listError ? (
              <ErrorState
                className="mt-3"
                error={listError}
                onRetry={() => void infinite.fetchNextPage()}
                retrying={infinite.isFetchingNextPage}
              />
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}

function appointmentOf(
  t: Translate,
  order: ListOrder,
  bcp47: string,
): { text: string; confirmed: boolean } | null {
  const confirmed = order.metadata?.confirmedSlot;
  if (confirmed) return { text: formatSlot(t, confirmed, bcp47), confirmed: true };
  if (order.preferredDate) {
    return {
      text: t('orders.preferredShort', { date: formatDay(order.preferredDate, bcp47) }),
      confirmed: false,
    };
  }
  return null;
}

function OrderTableRow({
  order,
  brand,
  showBrand,
  bcp47,
  navState,
  onOpen,
  isSyncing,
  onSync,
}: {
  order: ListOrder;
  brand: Project | undefined;
  showBrand: boolean;
  bcp47: string;
  navState: OrderNavState;
  onOpen: () => void;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const t = useT();
  const appointment = appointmentOf(t, order, bcp47);
  const contact = [order.customerEmail, order.customerPhone].filter(Boolean).join(' · ');
  return (
    <TableRow className="relative">
      {showBrand ? (
        <TableCell className="py-1.5">
          {brand ? <BrandChip brand={brand} /> : (order.companyName ?? '—')}
        </TableCell>
      ) : null}
      <TableCell className="whitespace-nowrap py-1.5">
        <Link
          to={`/auftraege/${order.id}`}
          state={navState}
          onClick={onOpen}
          aria-label={t('orders.openOrder', { number: order.orderNumber })}
          className={cn('font-medium tabular-nums text-foreground hover:underline', ROW_LINK)}
        >
          {order.orderNumber}
        </Link>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatDateTime(order.createdAt, bcp47, { dateStyle: 'medium' })}
        </p>
      </TableCell>
      <TableCell className="max-w-[16rem] py-1.5">
        <p className="truncate font-medium text-foreground">{order.customerName}</p>
        {contact ? <p className="truncate text-xs text-muted-foreground">{contact}</p> : null}
      </TableCell>
      <TableCell className="max-w-[16rem] py-1.5">
        <p className="truncate text-foreground">{t(KIND_LABEL[order.kind])}</p>
        {order.pickupLabel ? (
          <p className="truncate text-xs text-muted-foreground">{order.pickupLabel}</p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5 tabular-nums">
        {appointment ? (
          <span className={appointment.confirmed ? 'text-foreground' : 'text-muted-foreground'}>
            {appointment.text}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5">
        <OrderStatusBadge status={order.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5 text-right font-medium tabular-nums">
        {formatCurrency(order.totalCents / 100, 'EUR', bcp47)}
      </TableCell>
      <TableCell className="w-12 py-1.5 text-right">
        {order.status === 'payment_pending' ? (
          <RowSyncButton isSyncing={isSyncing} onSync={onSync} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function OrderMobileRow({
  order,
  brand,
  bcp47,
  navState,
  onOpen,
  isSyncing,
  onSync,
}: {
  order: ListOrder;
  brand: Project | undefined;
  bcp47: string;
  navState: OrderNavState;
  onOpen: () => void;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const t = useT();
  return (
    <li className="relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/auftraege/${order.id}`}
            state={navState}
            onClick={onOpen}
            aria-label={t('orders.openOrder', { number: order.orderNumber })}
            className={cn('shrink-0 text-2sm font-medium tabular-nums text-foreground', ROW_LINK)}
          >
            {order.orderNumber}
          </Link>
          <OrderStatusBadge status={order.status} />
          {brand ? <BrandChip brand={brand} /> : null}
        </div>
        <p className="mt-0.5 truncate text-2sm text-foreground">{order.customerName}</p>
      </div>
      <p className="shrink-0 text-2sm font-semibold tabular-nums">
        {formatCurrency(order.totalCents / 100, 'EUR', bcp47)}
      </p>
      {order.status === 'payment_pending' ? (
        <RowSyncButton isSyncing={isSyncing} onSync={onSync} />
      ) : null}
    </li>
  );
}

/** `relative` lifts it above the row link's stretched overlay (painted later, same stacking level). */
function RowSyncButton({ isSyncing, onSync }: { isSyncing: boolean; onSync: () => void }) {
  const t = useT();
  const label = t('orders.stripe.sync');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          loading={isSyncing}
          aria-label={label}
          className="relative shrink-0"
          onClick={onSync}
        >
          <RefreshCcw aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TableSkeleton() {
  const t = useT();
  return (
    <div role="status" className="overflow-hidden rounded-lg border border-border bg-card">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="hidden h-9 border-b border-border bg-muted md:block" />
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="hidden h-3.5 w-32 md:block" />
            <Skeleton className="hidden h-3.5 w-24 lg:block" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
