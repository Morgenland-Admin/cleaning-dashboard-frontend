import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  ExternalLink,
  History,
  Inbox,
  Loader2,
  MapPin,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Plus,
  Receipt,
  RefreshCcw,
  Save,
  Send,
  Truck,
  User,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DetailPane, useSelectedId } from '@/components/detail-pane';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { NewOrderDialog } from '@/components/new-order-dialog';
import { OrderCancelDialog } from '@/components/order-cancel-dialog';
import { PageHeading } from '@/components/page-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import {
  ordersAdminApi,
  type CalendlyPickupMeta,
  type InvoiceStatus,
  type OrderDetailResponse,
  type OrderInvoiceSummary,
  type OrderRow,
  type OrderStatus,
  type OrderTransitionStatus,
  ApiError,
} from '@/lib/api';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

const STATUS_LABEL: Record<OrderStatus, DictKey> = {
  pending: 'orders.status.pending',
  payment_pending: 'orders.status.paymentPending',
  paid: 'orders.status.paid',
  accepted: 'orders.status.accepted',
  picked_up: 'orders.status.pickedUp',
  in_cleaning: 'orders.status.inCleaning',
  ready: 'orders.status.ready',
  delivered: 'orders.status.delivered',
  completed: 'orders.status.completed',
  cancelled: 'orders.status.cancelled',
  partially_refunded: 'orders.status.partiallyRefunded',
  refunded: 'orders.status.refunded',
};

const STATUS_VARIANT: Record<
  OrderStatus,
  'default' | 'info' | 'warning' | 'success' | 'secondary' | 'destructive'
> = {
  pending: 'secondary',
  payment_pending: 'warning',
  paid: 'info',
  accepted: 'info',
  picked_up: 'default',
  in_cleaning: 'default',
  ready: 'default',
  delivered: 'success',
  completed: 'success',
  cancelled: 'destructive',
  // A partial refund is not a dead order — it keeps running with less money on it.
  partially_refunded: 'warning',
  refunded: 'destructive',
};

// Transitions the backend emails the customer about — surfaced in the confirm copy.
const CUSTOMER_NOTIFYING: ReadonlySet<OrderTransitionStatus> = new Set([
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
  'delivered',
  'completed',
]);

/** Confirmation dialog copy for a pending status transition. */
function transitionConfirmCopy(
  t: Translate,
  status: OrderTransitionStatus,
  order: OrderRow,
): { title: string; description: string; isDangerous: boolean } {
  const title = t('orders.transition.confirmTitle', { status: t(STATUS_LABEL[status]) });
  if (status === 'refunded' || status === 'partially_refunded') {
    const full = status === 'refunded';
    return {
      title,
      description:
        order.paymentProvider === 'paypal'
          ? t('orders.transition.refundPaypal')
          : full
            ? t('orders.transition.refundFull')
            : t('orders.transition.refundPartial'),
      isDangerous: true,
    };
  }
  return {
    title,
    description: CUSTOMER_NOTIFYING.has(status)
      ? t('orders.transition.notifies')
      : t('orders.transition.generic'),
    isDangerous: false,
  };
}

const STATUS_ACCENT: Record<OrderStatus, string> = {
  pending: 'bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-500 dark:to-slate-700',
  payment_pending: 'bg-gradient-to-b from-amber-300 to-amber-500',
  paid: 'bg-gradient-to-b from-sky-300 to-sky-500',
  accepted: 'bg-gradient-to-b from-sky-400 to-sky-600',
  picked_up: 'bg-gradient-to-b from-violet-300 to-violet-500',
  in_cleaning: 'bg-gradient-to-b from-violet-400 to-violet-600',
  ready: 'bg-gradient-to-b from-indigo-300 to-indigo-500',
  delivered: 'bg-gradient-to-b from-emerald-300 to-emerald-500',
  completed: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  cancelled: 'bg-gradient-to-b from-rose-300 to-rose-500',
  partially_refunded: 'bg-gradient-to-b from-rose-200 to-rose-400',
  refunded: 'bg-gradient-to-b from-rose-400 to-rose-600',
};

const PAYMENT_METHOD_LABEL: Record<'cash' | 'ec_card' | 'credit_card', string> = {
  cash: 'Barzahlung',
  ec_card: 'EC-Kartenzahlung',
  credit_card: 'Kreditkartenzahlung',
};

const KIND_LABEL: Record<OrderRow['kind'], string> = {
  teppichreinigung: 'Teppichreinigung',
  teppichreparatur: 'Teppichreparatur',
  polsterreinigung: 'Polsterreinigung',
  teppichbodenreinigung: 'Teppichbodenreinigung',
};

const TAB_FILTERS: Array<{ value: OrderStatus | 'all'; labelKey: DictKey }> = [
  { value: 'all', labelKey: 'orders.tab.all' },
  { value: 'paid', labelKey: 'orders.tab.paid' },
  { value: 'accepted', labelKey: 'orders.tab.accepted' },
  { value: 'in_cleaning', labelKey: 'orders.tab.inCleaning' },
  { value: 'ready', labelKey: 'orders.tab.ready' },
  { value: 'completed', labelKey: 'orders.tab.completed' },
];

/** The `t` from `useT()`, so module-level helpers can take it as a parameter. */
type Translate = ReturnType<typeof useT>;

/**
 * Status-log entries carry whatever the server wrote. A value this build has no
 * label for is shown raw rather than blank — the history stays readable even if
 * the backend gains a status before the frontend does.
 */
function statusText(t: Translate, status: string | null | undefined): string {
  if (!status) return '—';
  const key = STATUS_LABEL[status as OrderStatus];
  return key ? t(key) : status;
}

function formatEur(cents: number, bcp47: string): string {
  return (cents / 100).toLocaleString(bcp47, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

// "2026-05-27T09:00" → "27.05.2026 · 09:00 Uhr". Returns the raw string if it
// doesn't match the expected slot shape (defensive against legacy data).
function formatSlotDe(slot: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(slot);
  if (!m) return slot;
  const [, y, mo, d, h, min] = m;
  return `${d}.${mo}.${y} · ${h}:${min} Uhr`;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function OrdersPage() {
  const t = useT();
  const { activeProject, isAllBrands, setBrandView, projects } = useProject();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  usePageTitle(t('orders.title'));

  const [tab, setTab] = useState<OrderStatus | 'all'>('all');
  // Selection lives in the URL: reload-safe, linkable, and the phone's back
  // gesture closes the detail sheet instead of leaving the page.
  const [selectedId, setSelectedId] = useSelectedId('order');
  const [newOpen, setNewOpen] = useState(false);

  // The list scrolls inside its own box so it can grow to hundreds of rows
  // without pushing the sticky detail panel out of reach — desktop only.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const PAGE_SIZE = 50;

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
  const crossOrders = cross.data?.orders ?? [];

  // Switching tab or brand shows a different list — start it at the top.
  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, activeProject.companySlug, isAllBrands]);

  function brandFor(slug: CompanySlug) {
    return projects.find((p) => p.companySlug === slug);
  }

  const rowSync = useMutation({
    mutationFn: ({ companySlug, id }: { companySlug: CompanySlug; id: number }) =>
      ordersAdminApi.syncStripe(companySlug, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-infinite'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['order-detail'], exact: false });
    },
  });
  const syncingId = rowSync.isPending ? rowSync.variables?.id : undefined;

  const isFetching = isAllBrands ? cross.isFetching : infinite.isFetching;
  const isLoading = isAllBrands ? cross.isLoading : infinite.isLoading;
  function refetchActive() {
    if (isAllBrands) void cross.refetch();
    else void infinite.refetch();
  }

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <PageHeading
        title={t('orders.title')}
        subtitle={
          isAllBrands
            ? t('orders.subtitleAll')
            : t('orders.subtitleBrand', { brand: activeProject.name })
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setNewOpen(true)}
              disabled={isAllBrands}
              title={isAllBrands ? t('orders.pickBrandFirst') : undefined}
            >
              <Plus className="size-4" />
              {t('orders.newOrder')}
            </Button>
            <Button variant="outline" size="sm" onClick={refetchActive} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      {!isAllBrands ? (
        <NewOrderDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          companySlug={activeProject.companySlug}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['orders-infinite'], exact: false });
            setSelectedId(id);
          }}
        />
      ) : null}

      <Tabs className="mt-6" value={tab} onValueChange={(v) => setTab(v as OrderStatus | 'all')}>
        <TabsList overflow="scroll">
          {TAB_FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {t(f.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div
        className={cn(
          'mt-6 grid gap-6',
          selectedId != null && 'lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]',
        )}
      >
        {/*
          The inner scroll box is a desktop affordance: it keeps the sticky detail
          column in reach next to a long list. On a phone there is no second
          column, and a nested scroller there just fights the page (double
          scrollbars, broken momentum) — so the page scrolls instead.
        */}
        <div
          ref={listScrollRef}
          className="lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : isAllBrands ? (
            crossOrders.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="space-y-2">
                {crossOrders.map((o) => (
                  <OrderListRow
                    key={`${o.companySlug}:${o.id}`}
                    order={o}
                    brand={brandFor(o.companySlug)}
                    bcp47={bcp47}
                    selected={false}
                    compact={selectedId != null}
                    isSyncing={syncingId === o.id}
                    onSelect={() => {
                      setBrandView(o.companySlug);
                      setSelectedId(o.id);
                    }}
                    onSync={() => rowSync.mutate({ companySlug: o.companySlug, id: o.id })}
                  />
                ))}
              </ul>
            )
          ) : orders.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <OrderListRow
                  key={o.id}
                  order={o}
                  bcp47={bcp47}
                  selected={selectedId === o.id}
                  compact={selectedId != null}
                  isSyncing={syncingId === o.id}
                  onSelect={() => setSelectedId(o.id)}
                  onSync={() =>
                    rowSync.mutate({ companySlug: activeProject.companySlug, id: o.id })
                  }
                />
              ))}
            </ul>
          )}

          {!isAllBrands && (
            <>
              <InfiniteScrollSentinel
                onIntersect={() => {
                  void infinite.fetchNextPage();
                }}
                hasMore={!!infinite.hasNextPage}
                isLoading={infinite.isFetchingNextPage}
                // Only a root when that box actually scrolls — otherwise the
                // sentinel sits permanently inside it and pages in the whole list.
                rootRef={isDesktop ? listScrollRef : undefined}
              />
              {infinite.isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>

        <DetailPane
          open={selectedId != null}
          onClose={() => setSelectedId(null)}
          title={t('orders.detailTitle')}
        >
          {selectedId != null && (
            <OrderDetail
              companySlug={activeProject.companySlug}
              orderId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          )}
        </DetailPane>
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <div
        aria-hidden="true"
        className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/40 shadow-inner"
      >
        <Inbox className="size-6 text-muted-foreground" />
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-warning text-3xs font-bold text-warning-foreground">
          0
        </span>
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">{t('orders.empty')}</h2>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm text-muted-foreground">
        Sobald Kunden online buchen, erscheinen die bezahlten Aufträge hier — gefiltert nach Marke
        und Status.
      </p>
    </div>
  );
}

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, DictKey> = {
  draft: 'orders.invoice.status.draft',
  sent: 'orders.invoice.status.sent',
  paid: 'orders.invoice.status.paid',
  overdue: 'orders.invoice.status.overdue',
  void: 'orders.invoice.status.void',
};

const INVOICE_STATUS_VARIANT: Record<
  InvoiceStatus,
  'secondary' | 'info' | 'success' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  sent: 'info',
  paid: 'success',
  overdue: 'destructive',
  void: 'outline',
};

/**
 * The order's invoice: create it, or jump to the one that exists.
 *
 * Creating never issues. The draft carries this order's positions, so anything
 * agreed after the booking — a repair on top of the cleaning — can be added on
 * the invoice and the customer still receives a single document. Finalising is
 * a separate, deliberate step there.
 */
function InvoiceSection({
  invoice,
  bcp47,
  onCreate,
  isCreating,
}: {
  invoice: OrderInvoiceSummary | null;
  bcp47: string;
  onCreate: () => void;
  isCreating: boolean;
}) {
  const t = useT();
  return (
    <div>
      <SectionLabel icon={Receipt}>{t('orders.section.invoice')}</SectionLabel>

      {invoice ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2sm">
                {invoice.number ?? t('orders.invoice.noNumber')}
              </span>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                {t(INVOICE_STATUS_LABEL[invoice.status])}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatEur(invoice.totalCents, bcp47)}
              {invoice.status === 'draft'
                ? ` · ${t('orders.invoice.editable')}`
                : invoice.issuedAt
                  ? ` · ${t('orders.invoice.issuedAt', { date: formatDateTime(invoice.issuedAt, bcp47) })}`
                  : null}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/rechnungen/${invoice.id}`}>
              {invoice.status === 'draft' ? t('orders.invoice.edit') : t('orders.invoice.open')}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-border px-3 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('orders.invoice.createHint')}
          </p>
          <Button className="mt-2.5" size="sm" onClick={onCreate} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Receipt className="size-4" aria-hidden="true" />
            )}
            {t('orders.invoice.create')}
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <Icon className="size-3" aria-hidden="true" />
      {children}
    </div>
  );
}

function OrderListRow({
  order,
  brand,
  bcp47,
  selected,
  compact,
  isSyncing,
  onSelect,
  onSync,
}: {
  order: OrderRow & { companySlug?: CompanySlug; companyName?: string };
  brand?: { shortName: string; gradient: string };
  bcp47: string;
  selected: boolean;
  compact: boolean;
  isSyncing: boolean;
  onSelect: () => void;
  onSync: () => void;
}) {
  const t = useT();
  const canSync = order.status === 'payment_pending';
  return (
    <li>
      {/* Non-interactive container: a full-row overlay <button> is the primary
          action and the sync control is a sibling <button> — no nested buttons. */}
      <div
        className={cn(
          'group relative flex w-full items-stretch gap-3 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 hover:border-primary/40 hover:shadow-md',
          selected ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-label={t('orders.openOrder', { number: order.orderNumber })}
          className="absolute inset-0 z-0 cursor-pointer rounded-xl focus:outline-none"
        />
        <span
          aria-hidden="true"
          className={cn('relative w-[3px] shrink-0 self-stretch', STATUS_ACCENT[order.status])}
        />

        <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted/80 to-muted text-2xs font-semibold tracking-wider text-muted-foreground"
          >
            {initialsFrom(order.customerName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {brand && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-white shadow-sm',
                    `bg-gradient-to-r ${brand.gradient}`,
                  )}
                  title={order.companyName}
                >
                  {brand.shortName}
                </span>
              )}
              <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
              <Badge variant={STATUS_VARIANT[order.status]}>{t(STATUS_LABEL[order.status])}</Badge>
            </div>
            <div className="mt-1.5 truncate text-base font-semibold leading-tight">
              {order.customerName}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {KIND_LABEL[order.kind]} · {order.pickupLabel ?? '—'}
              {!compact && <> · {formatDateTime(order.createdAt, bcp47)}</>}
            </div>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <div className="text-base font-semibold">
              {(order.totalCents / 100).toLocaleString(bcp47, {
                style: 'currency',
                currency: 'EUR',
                minimumFractionDigits: 2,
              })}
            </div>
            {order.preferredDate && !compact && (
              <div className="mt-0.5 text-2xs text-muted-foreground">
                Wunsch: {order.preferredDate}
              </div>
            )}
          </div>
          <RowSyncButton
            show={canSync}
            isSyncing={isSyncing}
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }}
          />
        </div>
      </div>
    </li>
  );
}

function OrderDetail({
  companySlug,
  orderId,
  onClose,
}: {
  companySlug: ReturnType<typeof useProject>['activeProject']['companySlug'];
  orderId: number;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { bcp47 } = useLocale();
  const detailKey = ['order-detail', companySlug, orderId] as const;
  const listKeyPrefix = ['orders-infinite', companySlug] as const;

  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => ordersAdminApi.get(companySlug, orderId, signal),
  });

  const [notes, setNotes] = useState<string>('');
  const [notesDirty, setNotesDirty] = useState(false);
  // Reset the editable field when a fresh record loads (id+updatedAt change) —
  // done during render, not in an effect, so typing isn't clobbered by refetches.
  const loadedKey = detail.data ? `${detail.data.order.id}:${detail.data.order.updatedAt}` : null;
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (loadedKey && loadedKey !== syncedKey && !notesDirty) {
    setSyncedKey(loadedKey);
    setNotes(detail.data!.order.internalNotes ?? '');
  }

  const transition = useMutation({
    mutationFn: (toStatus: OrderTransitionStatus) =>
      ordersAdminApi.transition(companySlug, orderId, { toStatus }),
    onSuccess: async (_res, toStatus) => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      toast.success(t('orders.transition.done', { status: t(STATUS_LABEL[toStatus]) }));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.transition.failed')),
  });

  const navigate = useNavigate();

  // Creates the DRAFT and goes straight to it — the point of the button is to
  // land on an editable invoice, not to leave one sitting somewhere unseen.
  const createInvoice = useMutation({
    mutationFn: () => ordersAdminApi.createInvoice(companySlug, orderId),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
      toast.success(res.created ? t('orders.invoice.created') : t('orders.invoice.exists'));
      navigate(`/rechnungen/${res.invoice.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.invoice.failed')),
  });

  const saveNotes = useMutation({
    mutationFn: (next: string) =>
      ordersAdminApi.updateNotes(companySlug, orderId, next.trim() === '' ? null : next),
    onSuccess: async () => {
      setNotesDirty(false);
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success('Notizen gespeichert.');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.notesSaveFailed')),
  });

  const syncStripe = useMutation({
    mutationFn: () => ordersAdminApi.syncStripe(companySlug, orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
    },
  });

  const confirmAppointment = useMutation({
    mutationFn: (slot: string) => ordersAdminApi.confirmAppointment(companySlug, orderId, slot),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      // The order is confirmed either way; the calendar leg can still fail, and
      // the operator has to know before the crew relies on the calendar.
      if (res.calendly.error) {
        toast({
          title: t('orders.appointment.calendarFailedTitle'),
          description: res.calendly.error,
        });
      } else if (res.calendly.booked) {
        toast.success(t('orders.appointment.calendarOk'));
      } else {
        toast.success(t('orders.appointment.calendarSkipped'));
      }
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.confirmFailed')),
  });

  const sendBookingLink = useMutation({
    mutationFn: () => ordersAdminApi.sendPickupBookingLink(companySlug, orderId),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(
        res.emailed ? t('orders.appointment.linkSent') : t('orders.appointment.linkCreatedNoMail'),
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.linkFailed')),
  });

  const proposeSlots = useMutation({
    mutationFn: (slots: string[]) => ordersAdminApi.proposeSlots(companySlug, orderId, slots),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      toast.success(t('orders.appointment.proposalsSaved'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.proposalsFailed')),
  });

  const sendMessage = useMutation({
    mutationFn: (body: string) => ordersAdminApi.sendMessage(companySlug, orderId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(t('orders.message.sent'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.message.sendFailed')),
  });

  if (detail.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    const message =
      detail.error instanceof ApiError ? detail.error.message : t('orders.loadFailed');
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
        <p className="mt-2">{message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => detail.refetch()}>
          {t('orders.retry')}
        </Button>
      </div>
    );
  }

  return (
    <DetailBody
      data={detail.data}
      companySlug={companySlug}
      bcp47={bcp47}
      onClose={onClose}
      notes={notes}
      onNotesChange={(v) => {
        setNotes(v);
        setNotesDirty(true);
      }}
      onSaveNotes={() => saveNotes.mutate(notes)}
      notesDirty={notesDirty}
      isSavingNotes={saveNotes.isPending}
      onTransition={(s) => transition.mutate(s)}
      isTransitioning={transition.isPending}
      onSyncStripe={() => syncStripe.mutate()}
      isSyncing={syncStripe.isPending}
      onConfirmAppointment={(slot) => confirmAppointment.mutate(slot)}
      isConfirmingAppointment={confirmAppointment.isPending}
      onProposeSlots={(slots) => proposeSlots.mutate(slots)}
      isProposingSlots={proposeSlots.isPending}
      onSendBookingLink={() => sendBookingLink.mutate()}
      isSendingBookingLink={sendBookingLink.isPending}
      onSendMessage={(body) => sendMessage.mutateAsync(body)}
      isSendingMessage={sendMessage.isPending}
      onCreateInvoice={() => createInvoice.mutate()}
      isCreatingInvoice={createInvoice.isPending}
      syncResult={syncStripe.data ?? null}
      syncError={
        syncStripe.error instanceof ApiError
          ? syncStripe.error.message
          : syncStripe.isError
            ? t('orders.stripe.syncFailed')
            : null
      }
    />
  );
}

function DetailBody({
  data,
  companySlug,
  bcp47,
  onClose,
  notes,
  onNotesChange,
  onSaveNotes,
  notesDirty,
  isSavingNotes,
  onTransition,
  isTransitioning,
  onSyncStripe,
  isSyncing,
  onConfirmAppointment,
  isConfirmingAppointment,
  onProposeSlots,
  isProposingSlots,
  onSendBookingLink,
  isSendingBookingLink,
  onSendMessage,
  isSendingMessage,
  onCreateInvoice,
  isCreatingInvoice,
  syncResult,
  syncError,
}: {
  data: OrderDetailResponse;
  companySlug: ReturnType<typeof useProject>['activeProject']['companySlug'];
  bcp47: string;
  onClose: () => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onSaveNotes: () => void;
  notesDirty: boolean;
  isSavingNotes: boolean;
  onTransition: (s: OrderTransitionStatus) => void;
  isTransitioning: boolean;
  onSyncStripe: () => void;
  isSyncing: boolean;
  onConfirmAppointment: (slot: string) => void;
  isConfirmingAppointment: boolean;
  onProposeSlots: (slots: string[]) => void;
  isProposingSlots: boolean;
  onSendBookingLink: () => void;
  isSendingBookingLink: boolean;
  onSendMessage: (body: string) => Promise<unknown>;
  isSendingMessage: boolean;
  onCreateInvoice: () => void;
  isCreatingInvoice: boolean;
  syncResult: {
    order: OrderRow | null;
    stripe: { sessionStatus: string; paymentStatus: string };
    action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
  } | null;
  syncError: string | null;
}) {
  const t = useT();
  const { order, items, statusLog, allowedNextStatuses, invoice } = data;
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  // Every status change is confirmed first; `pendingStatus` is the one awaiting it.
  const [pendingStatus, setPendingStatus] = useState<OrderTransitionStatus | null>(null);
  // Cancellation goes through the policy-aware dialog (/cancel), not the
  // bare /transition path — /transition doesn't refund on `cancelled`.
  const cancelOffered = allowedNextStatuses.includes('cancelled');
  const transitionStatuses = allowedNextStatuses.filter((s) => s !== 'cancelled');
  const pendingCopy = pendingStatus ? transitionConfirmCopy(t, pendingStatus, order) : null;

  return (
    <div className="space-y-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur-sm">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{order.orderNumber}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[order.status]}>{t(STATUS_LABEL[order.status])}</Badge>
            <span className="text-sm text-muted-foreground">{KIND_LABEL[order.kind]}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('orders.closeDetail')}
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-5 pb-5">
        <div>
          <SectionLabel icon={User}>{t('orders.section.customer')}</SectionLabel>
          <div className="mt-2 space-y-1 text-sm">
            <div className="font-medium">{order.customerName}</div>
            <a
              href={`mailto:${order.customerEmail}`}
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <Mail className="size-3.5" aria-hidden="true" /> {order.customerEmail}
            </a>
            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <Phone className="size-3.5" aria-hidden="true" /> {order.customerPhone}
              </a>
            )}
          </div>
        </div>

        <div>
          <SectionLabel icon={Truck}>
            {order.pickupMode === 'onsite'
              ? t('orders.section.serviceAddress')
              : t('orders.section.pickup')}
          </SectionLabel>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-start gap-2">
              <Truck
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>{order.pickupLabel ?? '—'}</span>
            </div>
            {order.addressLine1 && (
              <div className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <address className="not-italic">
                  {order.addressLine1}
                  {order.addressLine2 ? (
                    <>
                      <br />
                      {order.addressLine2}
                    </>
                  ) : null}
                  <br />
                  {order.addressPostalCode} {order.addressCity}
                </address>
              </div>
            )}
            {order.preferredDate && !order.metadata?.preferredSlots?.length && (
              <div className="text-xs text-muted-foreground">
                Wunschtermin: {order.preferredDate}
              </div>
            )}
          </div>
        </div>

        <AppointmentSection
          key={`appt:${order.id}:${order.updatedAt}`}
          order={order}
          onConfirmAppointment={onConfirmAppointment}
          isConfirmingAppointment={isConfirmingAppointment}
          onProposeSlots={onProposeSlots}
          isProposingSlots={isProposingSlots}
          onSendBookingLink={onSendBookingLink}
          isSendingBookingLink={isSendingBookingLink}
        />

        <div>
          <SectionLabel icon={ClipboardList}>{t('orders.section.positions')}</SectionLabel>
          <ul className="mt-2 space-y-1.5 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3">
                <span className="flex-1">
                  <span className="block">{it.label}</span>
                  <span className="text-xs text-muted-foreground">{it.quantityLabel}</span>
                </span>
                <span className="tabular-nums">{formatEur(it.subtotalCents, bcp47)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
            {order.pickupFeeCents > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('orders.section.pickup')}</span>
                <span className="tabular-nums">{formatEur(order.pickupFeeCents, bcp47)}</span>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('orders.total')}
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {formatEur(order.totalCents, bcp47)}
              </span>
            </div>
          </div>
        </div>

        <InvoiceSection
          invoice={invoice}
          bcp47={bcp47}
          onCreate={onCreateInvoice}
          isCreating={isCreatingInvoice}
        />

        {order.customerNotes && (
          <div>
            <SectionLabel icon={MessageCircle}>Kundenmitteilung</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm">{order.customerNotes}</p>
          </div>
        )}

        <div>
          <SectionLabel icon={NotebookPen}>{t('orders.section.internalNotes')}</SectionLabel>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t('orders.notesPlaceholder')}
            className="mt-2"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!notesDirty || isSavingNotes}
              onClick={onSaveNotes}
            >
              {isSavingNotes ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </div>

        <OrderMessageComposer
          companySlug={companySlug}
          order={order}
          bcp47={bcp47}
          onSend={onSendMessage}
          isSending={isSendingMessage}
        />

        {order.paymentMode === 'after_service' ? (
          <AfterServicePaymentBlock companySlug={companySlug} order={order} bcp47={bcp47} />
        ) : (
          <StripePaymentBlock
            order={order}
            onSyncStripe={onSyncStripe}
            isSyncing={isSyncing}
            syncResult={syncResult}
            syncError={syncError}
          />
        )}

        <div>
          <SectionLabel icon={Check}>{t('orders.section.statusChange')}</SectionLabel>
          {transitionStatuses.length === 0 && !cancelOffered ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('orders.transition.none')}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {transitionStatuses.map((s) => {
                const isDangerous = s === 'refunded';
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={isDangerous ? 'outline' : 'default'}
                    disabled={isTransitioning}
                    onClick={() => setPendingStatus(s as OrderTransitionStatus)}
                  >
                    {isTransitioning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {t(STATUS_LABEL[s])}
                  </Button>
                );
              })}
              {cancelOffered && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isTransitioning}
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <Ban className="size-3.5" />
                  {t('orders.transition.cancelAction')}
                </Button>
              )}
            </div>
          )}
        </div>

        <OrderCancelDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          companySlug={companySlug}
          orderId={order.id}
          orderNumber={order.orderNumber}
          totalCents={order.totalCents}
          paymentProvider={order.paymentProvider}
        />

        <ConfirmDialog
          open={pendingStatus !== null}
          onOpenChange={(open) => {
            if (!open) setPendingStatus(null);
          }}
          title={pendingCopy?.title ?? ''}
          description={pendingCopy?.description ?? ''}
          confirmLabel={t('orders.appointment.confirm')}
          isDangerous={pendingCopy?.isDangerous ?? false}
          isPending={isTransitioning}
          onConfirm={() => {
            if (pendingStatus) onTransition(pendingStatus);
            setPendingStatus(null);
          }}
        />

        {statusLog.length > 0 && (
          <div>
            <SectionLabel icon={History}>Verlauf</SectionLabel>
            <ol className="mt-2 space-y-1.5 text-xs">
              {statusLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-3 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="flex-1">
                    <span className="text-foreground">
                      {entry.fromStatus
                        ? `${statusText(t, entry.fromStatus)} → ${statusText(t, entry.toStatus)}`
                        : statusText(t, entry.toStatus)}
                    </span>
                    {entry.reason && (
                      <span className="text-muted-foreground"> · {entry.reason}</span>
                    )}
                    <span className="ml-1 text-muted-foreground">
                      · {formatDateTime(entry.createdAt, bcp47)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// Termine: confirmed-slot banner, the proposed-slot list (each confirmable),
// and — when nothing is confirmed yet — an operator input to propose up to 3
// times directly from the panel (independent of what the booking carried).
// Confirming also books the slot into the shared CLEANILO Calendly calendar; that
// leg is reported separately because it can fail without invalidating the order.
function AppointmentSection({
  order,
  onConfirmAppointment,
  isConfirmingAppointment,
  onProposeSlots,
  isProposingSlots,
  onSendBookingLink,
  isSendingBookingLink,
}: {
  order: OrderRow;
  onConfirmAppointment: (slot: string) => void;
  isConfirmingAppointment: boolean;
  onProposeSlots: (slots: string[]) => void;
  isProposingSlots: boolean;
  onSendBookingLink: () => void;
  isSendingBookingLink: boolean;
}) {
  const t = useT();
  const confirmedSlot = order.metadata?.confirmedSlot ?? null;
  const calendly = order.metadata?.calendly ?? null;
  const slots = useMemo(() => order.metadata?.preferredSlots ?? [], [order.metadata]);

  const [drafts, setDrafts] = useState<string[]>(() => {
    const base = slots.slice(0, 3);
    return [base[0] ?? '', base[1] ?? '', base[2] ?? ''];
  });
  // Open the editor straight away when there's nothing to confirm yet.
  const [proposing, setProposing] = useState(slots.length === 0);

  const cleaned = drafts.map((s) => s.trim()).filter(Boolean);
  const changed = JSON.stringify(cleaned) !== JSON.stringify(slots);
  const canSave = cleaned.length > 0 && changed;

  return (
    <div>
      <SectionLabel icon={CalendarClock}>{t('orders.section.appointments')}</SectionLabel>

      {confirmedSlot ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          <div>
            <div className="text-3xs font-semibold uppercase tracking-[0.08em] text-success">
              {t('orders.appointment.confirmedTitle')}
            </div>
            <div className="font-medium tabular-nums">{formatSlotDe(confirmedSlot)}</div>
          </div>
        </div>
      ) : slots.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Vorgeschlagene Termine — bitte einen bestätigen. Der Kunde erhält dann eine
          Bestätigungs-E-Mail.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t('orders.appointment.noSlotsYet')}</p>
      )}

      <CalendlyStatus calendly={calendly} confirmedSlot={confirmedSlot} />

      {slots.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {slots.map((slot) => {
            const isConfirmed = confirmedSlot === slot;
            return (
              <li
                key={slot}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
                  isConfirmed ? 'border-success/30 bg-success-soft' : 'border-border',
                )}
              >
                <span className="flex items-center gap-2 tabular-nums">
                  <CalendarClock
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {formatSlotDe(slot)}
                </span>
                {isConfirmed ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="size-3.5" aria-hidden="true" />{' '}
                    {t('orders.appointment.confirmed')}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isConfirmingAppointment}
                    onClick={() => onConfirmAppointment(slot)}
                  >
                    {isConfirmingAppointment ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      t('orders.appointment.confirm')
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!confirmedSlot &&
        (proposing ? (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('orders.appointment.proposals')}
            </div>
            {drafts.map((value, i) => (
              <input
                // Fixed 3 rows — index key is stable and correct here.

                key={i}
                type="datetime-local"
                // The three slots share one heading, so each needs its own name:
                // a screen reader otherwise reaches three identical blank fields.
                aria-label={t('orders.appointment.slot', { n: i + 1, total: drafts.length })}
                value={value}
                onChange={(e) => setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ))}
            <div className="flex items-center justify-end gap-2">
              {slots.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setProposing(false)}>
                  Abbrechen
                </Button>
              )}
              <Button
                size="sm"
                disabled={!canSave || isProposingSlots}
                onClick={() => onProposeSlots(cleaned)}
              >
                {isProposingSlots ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {t('orders.appointment.saveProposals')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={() => setProposing(true)}>
              <CalendarClock className="size-3.5" />
              Termine vorschlagen
            </Button>
          </div>
        ))}

      {!confirmedSlot && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={isSendingBookingLink}
            onClick={onSendBookingLink}
          >
            {isSendingBookingLink ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {t('orders.appointment.letCustomerBook')}
          </Button>
          <p className="mt-1 text-2xs text-muted-foreground">
            {t('orders.appointment.bookingLinkHint')}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * State of the CLEANILO Calendly booking behind the confirmed appointment. Worth
 * its own line because the calendar leg can lag or fail while the order itself is
 * confirmed — the crew works off that calendar, so a silent failure is a no-show.
 */
function CalendlyStatus({
  calendly,
  confirmedSlot,
}: {
  calendly: CalendlyPickupMeta | null;
  confirmedSlot: string | null;
}) {
  const t = useT();
  if (!calendly) {
    // Nothing booked yet is only notable once a slot is actually confirmed.
    if (!confirmedSlot) return null;
    return (
      <p className="mt-1.5 text-2xs text-muted-foreground">
        {t('orders.appointment.calendarNotConfigured')}
      </p>
    );
  }

  if (calendly.status === 'booked') {
    // A stale booking for a slot that was later changed elsewhere — flag it.
    const mismatch = !!confirmedSlot && !!calendly.slot && calendly.slot !== confirmedSlot;
    return (
      <div className="mt-1.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Check className="size-3 text-success" aria-hidden="true" />
          Im CLEANILO-Kalender
          {calendly.source === 'webhook' ? t('orders.appointment.bookedByCustomer') : ''}
        </span>
        {mismatch && (
          <span className="ml-1 text-destructive">
            — gebucht für {formatSlotDe(calendly.slot!)}, bitte neu bestätigen.
          </span>
        )}
        {calendly.rescheduleUrl && (
          <a
            href={calendly.rescheduleUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-1 underline hover:text-foreground"
          >
            {t('orders.appointment.reschedule')}{' '}
            <ExternalLink className="size-2.5" aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }

  if (calendly.status === 'link_sent') {
    return (
      <div className="mt-1.5 text-2xs text-muted-foreground">
        Buchungslink verschickt — warten auf die Terminwahl des Kunden.
        {calendly.bookingUrl && (
          <a
            href={calendly.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 inline-flex items-center gap-1 underline hover:text-foreground"
          >
            {t('orders.appointment.openLink')}{' '}
            <ExternalLink className="size-2.5" aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }

  if (calendly.status === 'cancelled') {
    return (
      <p className="mt-1.5 text-2xs text-muted-foreground">
        {t('orders.appointment.calendarEntryCancelled')}
        {calendly.source === 'webhook' ? t('orders.appointment.byCustomer') : ''}.
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <div className="font-medium">{t('orders.appointment.calendarMissingTitle')}</div>
        <p className="mt-0.5 text-muted-foreground">
          {t('orders.appointment.calendarMissingBody')}
        </p>
      </div>
    </div>
  );
}

// "✦ Claude" compose + send box for the order — mirrors the Kontaktanfragen /
// Anfragen composer. Sends under the order's own brand; shows recent messages.
function OrderMessageComposer({
  companySlug,
  order,
  bcp47,
  onSend,
  isSending,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  bcp47: string;
  onSend: (body: string) => Promise<unknown>;
  isSending: boolean;
}) {
  const t = useT();
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sentTimerRef = useRef<number | null>(null);

  const assist = useClaudeAssist({
    kind: 'order_message',
    companySlug,
    refId: order.id,
    getCurrent: () => body,
    apply: (text) => {
      setBody(text);
      setLocalError(null);
      setJustSent(false);
    },
    updatedLabel: t('orders.message.aiUpdated'),
  });

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
    };
  }, []);

  // Both the button and ⌘↵ ask first — the mail leaves immediately once sent.
  function requestSend() {
    if (!body.trim()) {
      setLocalError(t('orders.message.needBody'));
      return;
    }
    setLocalError(null);
    setConfirmOpen(true);
  }

  async function handleSend() {
    setLocalError(null);
    try {
      await onSend(body);
      setConfirmOpen(false);
      setBody('');
      setJustSent(true);
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = window.setTimeout(() => setJustSent(false), 2400);
    } catch {
      /* error surfaced via toast in the parent mutation */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      requestSend();
    }
  }

  const sent = order.metadata?.messages ?? [];

  return (
    <div>
      <SectionLabel icon={Mail}>{t('orders.section.message')}</SectionLabel>

      {sent.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {sent.slice(-3).map((m, i) => (
            <li key={i} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                <span>{m.sentByName ?? 'Team'}</span>
                <time className="tabular-nums">{formatDateTime(m.sentAt, bcp47)}</time>
              </div>
              <p className="whitespace-pre-wrap text-2sm text-foreground/90">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="group mt-2 overflow-hidden rounded-2xl border border-border bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        <Textarea
          rows={5}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (localError) setLocalError(null);
            if (justSent) setJustSent(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('orders.message.placeholder')}
          disabled={isSending}
          aria-label={t('orders.section.message')}
          className="min-h-[120px] resize-none border-0 bg-transparent px-3.5 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0 sm:text-2sm"
        />
        {localError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-1.5 px-3.5 pb-2 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <span>{localError}</span>
          </div>
        )}
        {justSent && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 px-3.5 pb-2 text-xs text-success"
          >
            <Check className="size-3.5" />
            <span>{t('orders.message.sentNotice')}</span>
          </div>
        )}
        <ClaudeChatBox
          editablePrompt={{ kind: 'order_message', companySlug }}
          busy={assist.busy}
          history={assist.history}
          placeholder={t('orders.message.aiPlaceholder')}
          idleHint={body.trim() ? t('orders.message.aiRefine') : t('orders.message.aiFresh')}
          busyHint="schreibt …"
          sendLabel="An Claude senden"
          quickActions={[
            {
              label: t('orders.message.aiDraft'),
              run: () => assist.run(undefined, t('orders.message.aiDraft'), { fresh: true }),
            },
            {
              label: t('orders.message.aiShorter'),
              run: () =>
                assist.run(t('orders.message.aiShorterPrompt'), t('orders.message.aiShorter')),
            },
            {
              label: t('orders.message.aiWarmer'),
              run: () =>
                assist.run(t('orders.message.aiWarmerPrompt'), t('orders.message.aiWarmer')),
            },
          ]}
          onSend={(instruction) => assist.run(instruction, instruction)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3.5 py-2">
          <span className="flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
            <Mail className="size-3" />
            <span>
              {t('orders.message.recipientPrefix')}{' '}
              <span className="font-medium text-foreground/80">{order.customerEmail}</span>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-3xs text-muted-foreground sm:inline-flex">
              ⌘↩
            </kbd>
            <Button size="sm" onClick={requestSend} disabled={isSending || body.trim() === ''}>
              {isSending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('orders.message.sending')}
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  {t('orders.message.send')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('orders.message.confirmTitle')}
        description={t('orders.message.confirmBody', { email: order.customerEmail })}
        confirmLabel={t('orders.message.send')}
        onConfirm={() => void handleSend()}
        isPending={isSending}
      />
    </div>
  );
}

// Real <button>, sibling to the row's overlay action (z above it, clickable).
function RowSyncButton({
  show,
  isSyncing,
  onClick,
}: {
  show: boolean;
  isSyncing: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  if (!show) return null;
  return (
    <button
      type="button"
      aria-label={t('orders.stripe.sync')}
      title={t('orders.stripe.sync')}
      onClick={onClick}
      className="pointer-events-auto relative z-10 ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {isSyncing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCcw className="size-3.5" />
      )}
    </button>
  );
}

function AfterServicePaymentBlock({
  companySlug,
  order,
  bcp47,
}: {
  companySlug: ReturnType<typeof useProject>['activeProject']['companySlug'];
  order: OrderRow;
  bcp47: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const detailKey = ['order-detail', companySlug, order.id] as const;
  const listKeyPrefix = ['orders-infinite', companySlug] as const;
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: detailKey });
    await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
  };

  const recordPayment = useMutation({
    mutationFn: (method: 'cash' | 'ec_card') =>
      ordersAdminApi.recordPayment(companySlug, order.id, method),
    onSuccess: invalidate,
  });

  const paymentLink = useMutation({
    mutationFn: () => ordersAdminApi.createPaymentLink(companySlug, order.id),
    onSuccess: async (res) => {
      setLinkUrl(res.checkoutUrl);
      await invalidate();
    },
  });

  const isPaid = !!order.paidAt;
  const busy = recordPayment.isPending || paymentLink.isPending;
  const errorMsg =
    recordPayment.error instanceof ApiError
      ? recordPayment.error.message
      : paymentLink.error instanceof ApiError
        ? paymentLink.error.message
        : recordPayment.isError || paymentLink.isError
          ? 'Aktion fehlgeschlagen.'
          : null;

  return (
    <div>
      <SectionLabel icon={CreditCard}>{t('orders.section.payAfterService')}</SectionLabel>

      {isPaid ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3 py-2.5 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          <div>
            <div className="font-medium">
              Bezahlt
              {order.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[order.paymentMethod]}` : ''}
            </div>
            {order.paidAt && (
              <div className="text-xs text-muted-foreground">
                {formatDateTime(order.paidAt, bcp47)} · {formatEur(order.totalCents, bcp47)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('orders.afterService.recordHint', {
              amount: formatEur(order.totalCents, bcp47),
            })}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => recordPayment.mutate('cash')}
            >
              {recordPayment.isPending && recordPayment.variables === 'cash' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Banknote className="size-3.5" />
              )}
              Barzahlung
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => recordPayment.mutate('ec_card')}
            >
              {recordPayment.isPending && recordPayment.variables === 'ec_card' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wallet className="size-3.5" />
              )}
              EC-Kartenzahlung
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => paymentLink.mutate()}
            >
              {paymentLink.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CreditCard className="size-3.5" />
              )}
              Kreditkartenzahlung
            </Button>
          </div>

          {linkUrl && (
            <div className="mt-3 rounded-xl border border-info/30 bg-info-soft p-3 text-xs">
              <p className="text-info">
                {t('orders.afterService.linkCreated', { email: order.customerEmail })}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={linkUrl}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-base sm:text-2xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(linkUrl);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard unavailable — the field is selectable as a fallback */
                    }
                  }}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </Button>
              </div>
            </div>
          )}

          {errorMsg && <p className="mt-2 text-xs text-destructive">{errorMsg}</p>}
        </>
      )}
    </div>
  );
}

function StripePaymentBlock({
  order,
  onSyncStripe,
  isSyncing,
  syncResult,
  syncError,
}: {
  order: OrderRow;
  onSyncStripe: () => void;
  isSyncing: boolean;
  syncResult: {
    order: OrderRow | null;
    stripe: { sessionStatus: string; paymentStatus: string };
    action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
  } | null;
  syncError: string | null;
}) {
  const t = useT();
  // PayPal orders settle in the PayPal account — no Stripe IDs and no Stripe sync.
  if (order.paymentProvider === 'paypal') {
    return <PayPalPaymentBlock order={order} />;
  }

  const piUrl = order.stripePaymentIntentId
    ? `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`
    : null;
  const sessionUrl = order.stripeSessionId
    ? `https://dashboard.stripe.com/payments/sessions/${order.stripeSessionId}`
    : null;

  const canSync = order.status === 'payment_pending' && !!order.stripeSessionId;
  const hasAnyStripeId = !!(order.stripeSessionId || order.stripePaymentIntentId);

  return (
    <div>
      <SectionLabel icon={CreditCard}>{t('orders.section.payment')}</SectionLabel>

      {!hasAnyStripeId ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('orders.stripe.noData')}</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
          {/* Header strip — payment status + quick deep links */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium">Stripe</span>
            </div>
            {piUrl && (
              <a
                href={piUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t('orders.stripe.openDashboard')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </div>

          {/* Body — compact ID list */}
          <dl className="divide-y divide-border text-xs">
            {order.stripePaymentIntentId && (
              <StripeIdRow
                label="Payment Intent"
                value={order.stripePaymentIntentId}
                href={piUrl}
              />
            )}
            {order.stripeSessionId && (
              <StripeIdRow
                label="Checkout Session"
                value={order.stripeSessionId}
                href={sessionUrl}
              />
            )}
          </dl>
        </div>
      )}

      {canSync && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs">
          <p className="text-warning">
            Dieser Auftrag wartet auf die Zahlungsbestätigung. Falls Stripe die Zahlung bereits
            erhalten hat (Webhook verpasst), können Sie hier manuell abgleichen.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={onSyncStripe}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="size-3.5" />
            )}
            Mit Stripe abgleichen
          </Button>
        </div>
      )}

      {syncResult && (
        <div className="mt-3">
          <SyncResultBanner result={syncResult} />
        </div>
      )}
      {syncError && (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {syncError}
        </div>
      )}
    </div>
  );
}

function PayPalPaymentBlock({ order }: { order: OrderRow }) {
  const t = useT();
  const hasIds = !!(order.paypalOrderId || order.paypalCaptureId);
  return (
    <div>
      <SectionLabel icon={CreditCard}>{t('orders.section.payment')}</SectionLabel>
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-medium">PayPal</span>
        </div>
        {hasIds ? (
          <dl className="divide-y divide-border text-xs">
            {order.paypalOrderId && (
              <StripeIdRow label="PayPal Order" value={order.paypalOrderId} href={null} />
            )}
            {order.paypalCaptureId && (
              <StripeIdRow label="Capture" value={order.paypalCaptureId} href={null} />
            )}
          </dl>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('orders.paypal.noData')}</p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Erstattungen und Partner-Auszahlungen erfolgen bei PayPal-Zahlungen manuell direkt in
        PayPal.
      </p>
    </div>
  );
}

function StripeIdRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string | null;
}) {
  const display = abbreviateId(value);
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            title={value}
          >
            {display}
          </a>
        ) : (
          <span title={value}>{display}</span>
        )}
      </dd>
    </div>
  );
}

function abbreviateId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

function SyncResultBanner({
  result,
}: {
  result: {
    order: OrderRow | null;
    stripe: { sessionStatus: string; paymentStatus: string };
    action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
  };
}) {
  const t = useT();
  const map = {
    marked_paid: {
      cls: 'border-success/30 bg-success-soft text-success',
      text: t('orders.stripe.markedPaid'),
    },
    marked_cancelled: {
      cls: 'border-destructive/30 bg-destructive/10 text-destructive',
      text: t('orders.stripe.markedCancelled'),
    },
    still_pending: {
      cls: 'border-warning/30 bg-warning-soft text-warning',
      text: t('orders.stripe.stillPending', {
        sessionStatus: result.stripe.sessionStatus,
        paymentStatus: result.stripe.paymentStatus,
      }),
    },
    noop: {
      cls: 'border-border bg-muted/40 text-foreground',
      text: t('orders.stripe.noop'),
    },
  } as const;
  const m = map[result.action];
  return <div className={`rounded-lg border p-2 text-xs ${m.cls}`}>{m.text}</div>;
}
