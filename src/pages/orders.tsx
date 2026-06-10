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
  RefreshCcw,
  Save,
  Truck,
  User,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { OrderCancelDialog } from '@/components/order-cancel-dialog';
import { PageHeading } from '@/components/page-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import {
  ordersAdminApi,
  type OrderDetailResponse,
  type OrderRow,
  type OrderStatus,
  type OrderTransitionStatus,
  ApiError,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Erstellt',
  payment_pending: 'Zahlung offen',
  paid: 'Bezahlt',
  accepted: 'Angenommen',
  picked_up: 'Abgeholt',
  in_cleaning: 'In der Reinigung',
  ready: 'Bereit zur Lieferung',
  delivered: 'Geliefert',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  refunded: 'Erstattet',
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
  refunded: 'destructive',
};

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

const TAB_FILTERS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'paid', label: 'Neu (bezahlt)' },
  { value: 'accepted', label: 'Angenommen' },
  { value: 'in_cleaning', label: 'In Reinigung' },
  { value: 'ready', label: 'Bereit' },
  { value: 'completed', label: 'Abgeschlossen' },
];

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
  const { activeProject, isAllBrands, setBrandView, projects } = useProject();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  usePageTitle('Aufträge');

  const [tab, setTab] = useState<OrderStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
        title="Aufträge"
        subtitle={
          isAllBrands
            ? 'Bezahlte Online-Buchungen über alle Marken hinweg.'
            : `Bezahlte Online-Buchungen für ${activeProject.name}.`
        }
        actions={
          <Button variant="outline" size="sm" onClick={refetchActive} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Aktualisieren
          </Button>
        }
      />

      <div className="mt-6 overflow-x-auto">
        <Tabs value={tab} onValueChange={(v) => setTab(v as OrderStatus | 'all')}>
          <TabsList>
            {TAB_FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div
        className={cn(
          'mt-6 grid gap-6',
          selectedId != null && 'lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]',
        )}
      >
        <div>
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
              />
              {infinite.isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>

        {selectedId != null && (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <OrderDetail
              companySlug={activeProject.companySlug}
              orderId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <div
        aria-hidden="true"
        className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/40 shadow-inner"
      >
        <Inbox className="size-6 text-muted-foreground" />
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-amber-400 text-[10px] font-bold text-white">
          0
        </span>
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">Noch keine Aufträge</h2>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm text-muted-foreground">
        Sobald Kunden online buchen, erscheinen die bezahlten Aufträge hier — gefiltert nach Marke
        und Status.
      </p>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
  const canSync = order.status === 'payment_pending';
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          'group relative flex w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-1',
          selected ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('w-[3px] shrink-0 self-stretch', STATUS_ACCENT[order.status])}
        />

        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-3">
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted/80 to-muted text-[11px] font-semibold tracking-wider text-muted-foreground"
          >
            {initialsFrom(order.customerName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {brand && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm',
                    `bg-gradient-to-r ${brand.gradient}`,
                  )}
                  title={order.companyName}
                >
                  {brand.shortName}
                </span>
              )}
              <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
              <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            </div>
            <div className="mt-1.5 truncate text-[15px] font-semibold leading-tight">
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
              <div className="mt-0.5 text-[11px] text-muted-foreground">
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
  // Sync notes from server only when we get a fresh load (not on every render
  // — otherwise typing into the field would be wiped by background refetches).
  useMemo(() => {
    if (detail.data && !notesDirty) {
      setNotes(detail.data.order.internalNotes ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.order.id, detail.data?.order.updatedAt]);

  const transition = useMutation({
    mutationFn: (toStatus: OrderTransitionStatus) =>
      ordersAdminApi.transition(companySlug, orderId, { toStatus }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
    },
  });

  const saveNotes = useMutation({
    mutationFn: (next: string) =>
      ordersAdminApi.updateNotes(companySlug, orderId, next.trim() === '' ? null : next),
    onSuccess: async () => {
      setNotesDirty(false);
      await queryClient.invalidateQueries({ queryKey: detailKey });
    },
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
    },
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
      detail.error instanceof ApiError
        ? detail.error.message
        : 'Auftrag konnte nicht geladen werden.';
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
        <p className="mt-2">{message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => detail.refetch()}>
          Erneut versuchen
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
      syncResult={syncStripe.data ?? null}
      syncError={
        syncStripe.error instanceof ApiError
          ? syncStripe.error.message
          : syncStripe.isError
            ? 'Stripe-Abgleich fehlgeschlagen.'
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
  syncResult: {
    order: OrderRow | null;
    stripe: { sessionStatus: string; paymentStatus: string };
    action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
  } | null;
  syncError: string | null;
}) {
  const { order, items, statusLog, allowedNextStatuses } = data;
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  // Cancellation goes through the policy-aware dialog (/cancel), not the
  // bare /transition path — /transition doesn't refund on `cancelled`.
  const cancelOffered = allowedNextStatuses.includes('cancelled');
  const transitionStatuses = allowedNextStatuses.filter((s) => s !== 'cancelled');

  return (
    <div className="space-y-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur-sm">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{order.orderNumber}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
            <span className="text-sm text-muted-foreground">{KIND_LABEL[order.kind]}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Detail schließen"
          onClick={onClose}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-1"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-5 pb-5">
        <div>
          <SectionLabel icon={User}>Kunde</SectionLabel>
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
            {order.pickupMode === 'onsite' ? 'Service-Adresse' : 'Abholung'}
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

        {order.metadata?.preferredSlots?.length ? (
          <div>
            <SectionLabel icon={CalendarClock}>Wunschtermine</SectionLabel>
            {order.metadata.confirmedSlot ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                    Bestätigter Termin
                  </div>
                  <div className="font-medium tabular-nums">
                    {formatSlotDe(order.metadata.confirmedSlot)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Vom Kunden gewünscht — bitte einen Termin bestätigen. Der Kunde erhält dann eine
                Bestätigungs-E-Mail.
              </p>
            )}
            <ul className="mt-2 space-y-1.5">
              {order.metadata.preferredSlots.map((slot) => {
                const isConfirmed = order.metadata?.confirmedSlot === slot;
                return (
                  <li
                    key={slot}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
                      isConfirmed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border',
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
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check className="size-3.5" aria-hidden="true" /> Bestätigt
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
                          'Bestätigen'
                        )}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <SectionLabel icon={ClipboardList}>Positionen</SectionLabel>
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
                <span>Abholung</span>
                <span className="tabular-nums">{formatEur(order.pickupFeeCents, bcp47)}</span>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Gesamt
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {formatEur(order.totalCents, bcp47)}
              </span>
            </div>
          </div>
        </div>

        {order.customerNotes && (
          <div>
            <SectionLabel icon={MessageCircle}>Kundenmitteilung</SectionLabel>
            <p className="mt-2 whitespace-pre-wrap text-sm">{order.customerNotes}</p>
          </div>
        )}

        <div>
          <SectionLabel icon={NotebookPen}>Interne Notizen</SectionLabel>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Nur intern sichtbar"
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
              Speichern
            </Button>
          </div>
        </div>

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
          <SectionLabel icon={Check}>Status ändern</SectionLabel>
          {transitionStatuses.length === 0 && !cancelOffered ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Keine weiteren Statusübergänge möglich.
            </p>
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
                    onClick={() => {
                      if (isDangerous) {
                        if (
                          !window.confirm(
                            `Wirklich auf „${STATUS_LABEL[s]}“ setzen? Dies löst eine volle Stripe-Rückerstattung aus, falls eine Zahlung vorhanden ist.`,
                          )
                        ) {
                          return;
                        }
                      }
                      onTransition(s as OrderTransitionStatus);
                    }}
                  >
                    {isTransitioning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {STATUS_LABEL[s]}
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
                  Stornieren …
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
                        ? `${STATUS_LABEL[entry.fromStatus as OrderStatus] ?? entry.fromStatus} → ${STATUS_LABEL[entry.toStatus as OrderStatus] ?? entry.toStatus}`
                        : (STATUS_LABEL[entry.toStatus as OrderStatus] ?? entry.toStatus)}
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

// Rendered as <span role="button"> rather than a real <button> because the
// containing row is itself a clickable element — nested buttons are invalid.
function RowSyncButton({
  show,
  isSyncing,
  onClick,
}: {
  show: boolean;
  isSyncing: boolean;
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  if (!show) return null;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Mit Stripe abgleichen"
      title="Mit Stripe abgleichen"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
      className="ml-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-1"
    >
      {isSyncing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCcw className="size-3.5" />
      )}
    </span>
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
      <SectionLabel icon={CreditCard}>Zahlung nach Leistung</SectionLabel>

      {isPaid ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
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
            Service erbracht? Erfassen Sie hier, wie der Kunde die{' '}
            {formatEur(order.totalCents, bcp47)} bezahlt hat.
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
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs dark:border-sky-900/40 dark:bg-sky-950/30">
              <p className="text-sky-900 dark:text-sky-100">
                Zahlungslink erstellt und per E-Mail an{' '}
                <span className="font-medium">{order.customerEmail}</span> gesendet. Sie können ihn
                auch direkt teilen:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={linkUrl}
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-base sm:text-[11px]"
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
  // Same URL works for both test + live dashboards; Stripe routes by the
  // operator's last selected mode.
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
      <SectionLabel icon={CreditCard}>Zahlung</SectionLabel>

      {!hasAnyStripeId ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Keine Stripe-Daten vorhanden — Auftrag wurde vor dem Checkout abgebrochen.
        </p>
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
                Im Stripe Dashboard öffnen
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
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="text-amber-900 dark:text-amber-100">
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
  const map = {
    marked_paid: {
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100',
      text: 'Stripe-Zahlung bestätigt — Auftrag ist jetzt bezahlt und Bestätigungs-E-Mail wurde versendet.',
    },
    marked_cancelled: {
      cls: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100',
      text: 'Stripe-Session ist abgelaufen — Auftrag wurde storniert.',
    },
    still_pending: {
      cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100',
      text: `Zahlung läuft noch (Stripe: ${result.stripe.sessionStatus}/${result.stripe.paymentStatus}). Kein Handlungsbedarf.`,
    },
    noop: {
      cls: 'border-border bg-muted/40 text-foreground',
      text: 'Auftrag ist bereits im Endstatus — kein Abgleich nötig.',
    },
  } as const;
  const m = map[result.action];
  return <div className={`rounded-lg border p-2 text-xs ${m.cls}`}>{m.text}</div>;
}
