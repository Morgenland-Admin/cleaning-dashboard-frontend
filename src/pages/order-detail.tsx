import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Banknote,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  MapPin,
  Mail,
  MoreHorizontal,
  PackageCheck,
  Receipt,
  RefreshCcw,
  Save,
  Send,
  Truck,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmailLogList } from '@/components/email-log-list';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { OrderCancelDialog } from '@/components/order-cancel-dialog';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard, SectionLabel } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import {
  KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  formatDay,
  formatSlot,
  isRefundStatus,
  readOrderNavState,
  statusText,
  transitionConfirmCopy,
} from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

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

/** Statuses in which a receipt can be created or corrected (mirrors the backend). */
const RECEIPT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
]);

/**
 * "Unpaid" badge only where the status does not already say it (payment_pending)
 * and the order is not closed out (cancelled / refunded).
 */
const UNPAID_NOTABLE: ReadonlySet<OrderStatus> = new Set([
  'pending',
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
  'delivered',
  'completed',
]);

const TEXT_LINK =
  'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const QUIET_LINK =
  'inline-flex items-center gap-1 rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type SyncResult = {
  order: OrderRow | null;
  stripe: { sessionStatus: string; paymentStatus: string };
  action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
};

export function OrderDetailPage() {
  const { id } = useParams();
  const orderId = id && /^\d+$/.test(id) ? Number(id) : null;
  // Keyed by id: previous / next starts each order with a clean editor state.
  return <OrderDetailView key={orderId ?? 'invalid'} orderId={orderId} />;
}

function OrderDetailView({ orderId }: { orderId: number | null }) {
  const t = useT();
  const { activeProject } = useProject();
  // The list switches the brand before it navigates here, so the active brand
  // is the order's brand.
  const companySlug = activeProject.companySlug;
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = readOrderNavState(location.state);
  const backTo = `/auftraege${nav.from ?? ''}`;

  const detailKey = ['order-detail', companySlug, orderId] as const;
  const listKeyPrefix = ['orders-infinite', companySlug] as const;

  const detail = useQuery({
    queryKey: detailKey,
    enabled: orderId != null,
    queryFn: ({ signal }) => ordersAdminApi.get(companySlug, orderId!, signal),
  });
  usePageTitle(detail.data ? detail.data.order.orderNumber : t('orders.detailTitle'));

  const [notes, setNotes] = useState<string>('');
  const [notesDirty, setNotesDirty] = useState(false);
  // Reset during render, not in an effect, so refetches don't clobber typing.
  const loadedKey = detail.data ? `${detail.data.order.id}:${detail.data.order.updatedAt}` : null;
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (loadedKey && loadedKey !== syncedKey && !notesDirty) {
    setSyncedKey(loadedKey);
    setNotes(detail.data!.order.internalNotes ?? '');
  }

  const transition = useMutation({
    mutationFn: (toStatus: OrderTransitionStatus) =>
      ordersAdminApi.transition(companySlug, orderId!, { toStatus }),
    onSuccess: async (_res, toStatus) => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      toast.success(t('orders.transition.done', { status: t(STATUS_LABEL[toStatus]) }));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.transition.failed')),
  });

  const createInvoice = useMutation({
    mutationFn: () => ordersAdminApi.createInvoice(companySlug, orderId!),
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
      ordersAdminApi.updateNotes(companySlug, orderId!, next.trim() === '' ? null : next),
    onSuccess: async () => {
      setNotesDirty(false);
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(t('orders.notesSaved'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.notesSaveFailed')),
  });

  const syncStripe = useMutation({
    mutationFn: () => ordersAdminApi.syncStripe(companySlug, orderId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
    },
  });

  const confirmAppointment = useMutation({
    mutationFn: (slot: string) => ordersAdminApi.confirmAppointment(companySlug, orderId!, slot),
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
    mutationFn: () => ordersAdminApi.sendPickupBookingLink(companySlug, orderId!),
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
    mutationFn: (slots: string[]) => ordersAdminApi.proposeSlots(companySlug, orderId!, slots),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.invalidateQueries({ queryKey: listKeyPrefix, exact: false });
      toast.success(t('orders.appointment.proposalsSaved'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.appointment.proposalsFailed')),
  });

  const sendMessage = useMutation({
    mutationFn: (body: string) => ordersAdminApi.sendMessage(companySlug, orderId!, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success(t('orders.message.sent'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.message.sendFailed')),
  });

  if (orderId == null) {
    return (
      <PageContainer>
        <BackLink to={backTo}>{t('orders.title')}</BackLink>
        <PageHeading className="mb-4 mt-2" title={t('orders.title')} />
        <ErrorState error={new Error(t('orders.loadFailed'))} />
      </PageContainer>
    );
  }

  if (detail.isLoading) return <DetailSkeleton backTo={backTo} />;

  if (detail.isError || !detail.data) {
    return (
      <PageContainer>
        <BackLink to={backTo}>{t('orders.title')}</BackLink>
        <PageHeading className="mb-4 mt-2" title={t('orders.title')} />
        <ErrorState
          title={t('orders.loadFailed')}
          error={detail.error}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      </PageContainer>
    );
  }

  return (
    <DetailBody
      data={detail.data}
      companySlug={companySlug}
      bcp47={bcp47}
      backTo={backTo}
      ids={nav.ids}
      onNavigate={(id) => navigate(`/auftraege/${id}`, { state: location.state, replace: true })}
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

function DetailSkeleton({ backTo }: { backTo: string }) {
  const t = useT();
  return (
    <PageContainer>
      <BackLink to={backTo}>{t('orders.title')}</BackLink>
      <div role="status" className="mt-2">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="mb-5 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function DetailBody({
  data,
  companySlug,
  bcp47,
  backTo,
  ids,
  onNavigate,
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
  companySlug: CompanySlug;
  bcp47: string;
  backTo: string;
  ids: number[] | undefined;
  onNavigate: (id: number) => void;
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
  syncResult: SyncResult | null;
  syncError: string | null;
}) {
  const t = useT();
  const { order, items, statusLog, allowedNextStatuses, invoice } = data;
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderTransitionStatus | null>(null);
  const [requestedStatus, setRequestedStatus] = useState<OrderTransitionStatus | null>(null);
  // Cancellation goes through the policy-aware dialog (/cancel), not the
  // bare /transition path — /transition doesn't refund on `cancelled`.
  const cancelOffered = allowedNextStatuses.includes('cancelled');
  const transitionStatuses = allowedNextStatuses.filter(
    (s) => s !== 'cancelled',
  ) as OrderTransitionStatus[];
  const primaryStatus = transitionStatuses.find((s) => !isRefundStatus(s));
  const otherStatuses = transitionStatuses.filter((s) => s !== primaryStatus);
  const pendingCopy = pendingStatus ? transitionConfirmCopy(t, pendingStatus, order) : null;

  const position = ids ? ids.indexOf(order.id) : -1;
  const prevId = position > 0 ? ids![position - 1] : undefined;
  const nextId = position >= 0 && ids && position < ids.length - 1 ? ids[position + 1] : undefined;

  const paymentBadge = order.paidAt ? (
    order.status === 'paid' ? null : (
      <Badge variant="success">{t('orders.status.paid')}</Badge>
    )
  ) : UNPAID_NOTABLE.has(order.status) ? (
    <Badge variant="warning">{t('orders.unpaid')}</Badge>
  ) : null;

  const actions = (
    <>
      {primaryStatus ? (
        <Button
          size="sm"
          disabled={isTransitioning}
          loading={isTransitioning && requestedStatus === primaryStatus}
          onClick={() => setPendingStatus(primaryStatus)}
        >
          <Check aria-hidden="true" />
          {t(STATUS_LABEL[primaryStatus])}
        </Button>
      ) : null}
      {otherStatuses.length > 0 || cancelOffered ? (
        // Not modal: a modal menu would hand focus back to its trigger beneath the dialog that just opened.
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={isTransitioning}
              loading={
                isTransitioning && requestedStatus !== null && requestedStatus !== primaryStatus
              }
            >
              <MoreHorizontal aria-hidden="true" />
              {t('orders.detail.moreActions')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {otherStatuses.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => setPendingStatus(s)}
                className={cn(isRefundStatus(s) && 'text-destructive focus:text-destructive')}
              >
                <Check aria-hidden="true" />
                {t(STATUS_LABEL[s])}
              </DropdownMenuItem>
            ))}
            {cancelOffered ? (
              <>
                {otherStatuses.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onSelect={() => setCancelDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban aria-hidden="true" />
                  {t('orders.transition.cancelAction')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );

  const pager =
    ids && position >= 0 && ids.length > 1 ? (
      <div
        role="group"
        aria-label={t('orders.detail.position', { n: position + 1, total: ids.length })}
        className="flex items-center gap-0.5"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('orders.detail.prev')}
          disabled={prevId === undefined}
          onClick={() => prevId !== undefined && onNavigate(prevId)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span
          aria-hidden="true"
          className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
        >
          {position + 1} / {ids.length}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('orders.detail.next')}
          disabled={nextId === undefined}
          onClick={() => nextId !== undefined && onNavigate(nextId)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    ) : null;

  return (
    <PageContainer>
      <RecordNav pager={pager}>
        <BackLink to={backTo}>{t('orders.title')}</BackLink>
      </RecordNav>
      <PageHeading
        title={<span className="tabular-nums">{order.orderNumber}</span>}
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            {paymentBadge}
          </>
        }
        subtitle={`${order.customerName} · ${t(KIND_LABEL[order.kind])}`}
        actions={actions}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <PositionsCard order={order} items={items} bcp47={bcp47} />

          <AppointmentsCard
            key={`appt:${order.id}:${order.updatedAt}`}
            order={order}
            onConfirmAppointment={onConfirmAppointment}
            isConfirmingAppointment={isConfirmingAppointment}
            onProposeSlots={onProposeSlots}
            isProposingSlots={isProposingSlots}
            onSendBookingLink={onSendBookingLink}
            isSendingBookingLink={isSendingBookingLink}
          />

          <SectionCard title={t('orders.detail.communication')}>
            <Tabs defaultValue="message">
              <TabsList variant="line">
                <TabsTrigger value="message">{t('orders.detail.tabMessage')}</TabsTrigger>
                <TabsTrigger value="emails">{t('emails.record.title')}</TabsTrigger>
              </TabsList>
              {/* Kept mounted: switching to the log must not drop a draft. */}
              <TabsContent value="message" forceMount className="data-[state=inactive]:hidden">
                <OrderMessageComposer
                  companySlug={companySlug}
                  order={order}
                  bcp47={bcp47}
                  onSend={onSendMessage}
                  isSending={isSendingMessage}
                />
              </TabsContent>
              <TabsContent value="emails" forceMount className="data-[state=inactive]:hidden">
                <EmailLogList
                  parentKey={['order-detail', companySlug, order.id]}
                  brand={companySlug}
                  filter={{ refType: 'order', refId: order.id }}
                />
              </TabsContent>
            </Tabs>
          </SectionCard>

          {statusLog.length > 0 && (
            <SectionCard title={t('orders.section.history')}>
              <ol className="space-y-2 text-2sm">
                {statusLog.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground">
                        {entry.fromStatus
                          ? `${statusText(t, entry.fromStatus)} → ${statusText(t, entry.toStatus)}`
                          : statusText(t, entry.toStatus)}
                      </span>
                      {entry.reason && (
                        <span className="text-muted-foreground"> · {entry.reason}</span>
                      )}
                      <span className="text-muted-foreground">
                        {' · '}
                        <time className="tabular-nums" dateTime={entry.createdAt}>
                          {formatDateTime(entry.createdAt, bcp47)}
                        </time>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <SectionCard title={t('orders.section.customer')} bodyClassName="p-4">
            <KeyValueList layout="grid">
              <KeyValue label={t('orders.create.name')} value={order.customerName} />
              <KeyValue
                label={t('orders.create.email')}
                value={
                  <a href={`mailto:${order.customerEmail}`} className={cn(TEXT_LINK, 'break-all')}>
                    {order.customerEmail}
                  </a>
                }
              />
              <KeyValue
                label={t('orders.create.phone')}
                value={
                  order.customerPhone ? (
                    <a href={`tel:${order.customerPhone}`} className={TEXT_LINK}>
                      {order.customerPhone}
                    </a>
                  ) : null
                }
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard
            title={
              order.pickupMode === 'onsite'
                ? t('orders.section.serviceAddress')
                : t('orders.section.pickup')
            }
            bodyClassName="space-y-1.5 p-4 text-2sm"
          >
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
              <p className="text-xs text-muted-foreground">
                {t('orders.preferredDate', { date: formatDay(order.preferredDate, bcp47) })}
              </p>
            )}
          </SectionCard>

          {order.paymentMode === 'after_service' ? (
            <AfterServicePaymentCard companySlug={companySlug} order={order} bcp47={bcp47} />
          ) : (
            <StripePaymentCard
              order={order}
              onSyncStripe={onSyncStripe}
              isSyncing={isSyncing}
              syncResult={syncResult}
              syncError={syncError}
            />
          )}

          <SectionCard title={t('orders.detail.documents')} bodyClassName="space-y-4 p-4">
            <ReceiptBlock order={order} bcp47={bcp47} />
            <InvoiceBlock
              invoice={invoice}
              bcp47={bcp47}
              onCreate={onCreateInvoice}
              isCreating={isCreatingInvoice}
            />
          </SectionCard>

          <SectionCard title={t('orders.detail.notes')} bodyClassName="space-y-4 p-4">
            {order.customerNotes ? (
              <div className="space-y-1">
                <SectionLabel as="h3">{t('orders.section.customerNote')}</SectionLabel>
                <p className="whitespace-pre-wrap text-2sm">{order.customerNotes}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <FormField label={t('orders.section.internalNotes')}>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder={t('orders.notesPlaceholder')}
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!notesDirty}
                  loading={isSavingNotes}
                  onClick={onSaveNotes}
                >
                  <Save aria-hidden="true" />
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </SectionCard>
        </aside>
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
          if (pendingStatus) {
            setRequestedStatus(pendingStatus);
            onTransition(pendingStatus);
          }
          setPendingStatus(null);
        }}
      />
    </PageContainer>
  );
}

function PositionsCard({
  order,
  items,
  bcp47,
}: {
  order: OrderRow;
  items: OrderDetailResponse['items'];
  bcp47: string;
}) {
  const t = useT();
  return (
    <SectionCard title={t('orders.section.positions')} bodyClassName="space-y-3">
      <ul className="divide-y divide-border text-2sm">
        {items.map((it) => {
          const meta = [
            it.quantityLabel,
            it.metadata?.lengthCm && it.metadata.widthCm
              ? `${it.metadata.lengthCm} × ${it.metadata.widthCm} cm`
              : null,
            it.metadata?.tagNumber ? `${t('orders.receipt.tag')} ${it.metadata.tagNumber}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const photoCount = it.metadata?.photos?.length ?? 0;
          return (
            <li key={it.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-foreground">{it.label}</p>
                {meta || photoCount > 0 ? (
                  <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                    {meta ? <span>{meta}</span> : null}
                    {photoCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        {meta ? <span aria-hidden="true">·</span> : null}
                        <Camera className="size-3" aria-hidden="true" />
                        <span className="tabular-nums">{photoCount}</span>
                        <span className="sr-only">{t('orders.receipt.photos')}</span>
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 tabular-nums">
                {formatCurrency(it.subtotalCents / 100, 'EUR', bcp47)}
              </span>
            </li>
          );
        })}
      </ul>
      <KeyValueList className="border-t border-border pt-3">
        {order.pickupFeeCents > 0 ? (
          <KeyValue
            label={t('orders.section.pickup')}
            value={
              <span className="tabular-nums">
                {formatCurrency(order.pickupFeeCents / 100, 'EUR', bcp47)}
              </span>
            }
          />
        ) : null}
        <KeyValue
          label={<span className="font-medium text-foreground">{t('orders.total')}</span>}
          value={
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(order.totalCents / 100, 'EUR', bcp47)}
            </span>
          }
        />
      </KeyValueList>
    </SectionCard>
  );
}

function ReceiptBlock({ order, bcp47 }: { order: OrderRow; bcp47: string }) {
  const t = useT();
  const location = useLocation();
  const receiptHref = `/auftraege/${order.id}/eingangsbestaetigung`;
  const history = order.metadata?.receipt?.history ?? [];
  const last = history[history.length - 1];
  const savedAt = order.metadata?.receipt?.savedAt;
  const available = order.pickupMode !== 'onsite' && RECEIPT_STATUSES.has(order.status);
  // On-site jobs never hand anything over; an order past handover without a
  // receipt has nothing to show here.
  if (!available && !last) return null;

  return (
    <div className="space-y-2">
      <SectionLabel as="h3" icon={<PackageCheck aria-hidden="true" />}>
        {t('orders.receipt.section')}
      </SectionLabel>
      {last ? (
        <div className="space-y-2">
          <div>
            <p className="text-2sm text-foreground">
              {t('orders.receipt.sentAt', { date: formatDateTime(last.sentAt, bcp47) })}
              {last.sentByName ? ` ${t('orders.receipt.sentBy', { name: last.sentByName })}` : ''}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(last.totalCents / 100, 'EUR', bcp47)}
              {history.length > 1
                ? ` · ${t('orders.receipt.sentTimes', { count: history.length })}`
                : ''}
            </p>
          </div>
          {available && (
            <Button variant="outline" size="sm" asChild>
              <Link to={receiptHref} state={location.state}>
                <PackageCheck aria-hidden="true" />
                {t('orders.receipt.editResend')}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {savedAt
              ? t('orders.receipt.draftSavedAt', { date: formatDateTime(savedAt, bcp47) })
              : t('orders.receipt.hint')}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to={receiptHref} state={location.state}>
              <PackageCheck aria-hidden="true" />
              {savedAt ? t('orders.receipt.continueDraft') : t('orders.receipt.create')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Creating never issues: the draft carries this order's positions so later extras go on the
 * same invoice (one document for the customer). Finalising is a separate step there.
 */
function InvoiceBlock({
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
    <div className="space-y-2">
      <SectionLabel as="h3" icon={<Receipt aria-hidden="true" />}>
        {t('orders.section.invoice')}
      </SectionLabel>
      {invoice ? (
        <div className="space-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2sm font-medium tabular-nums">
                {invoice.number ?? t('orders.invoice.noNumber')}
              </span>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                {t(INVOICE_STATUS_LABEL[invoice.status])}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {formatCurrency(invoice.totalCents / 100, 'EUR', bcp47)}
              {invoice.status === 'draft'
                ? ` · ${t('orders.invoice.editable')}`
                : invoice.issuedAt
                  ? ` · ${t('orders.invoice.issuedAt', { date: formatDateTime(invoice.issuedAt, bcp47) })}`
                  : null}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/rechnungen/${invoice.id}`}>
              {invoice.status === 'draft' ? t('orders.invoice.edit') : t('orders.invoice.open')}
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('orders.invoice.createHint')}
          </p>
          <Button variant="outline" size="sm" onClick={onCreate} loading={isCreating}>
            <Receipt aria-hidden="true" />
            {t('orders.invoice.create')}
          </Button>
        </div>
      )}
    </div>
  );
}

// Confirming also books the slot into the shared CLEANILO Calendly calendar; that leg is
// reported separately because it can fail without invalidating the order.
function AppointmentsCard({
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
  const { bcp47 } = useLocale();
  const confirmedSlot = order.metadata?.confirmedSlot ?? null;
  const calendly = order.metadata?.calendly ?? null;
  const slots = useMemo(() => order.metadata?.preferredSlots ?? [], [order.metadata]);

  const [drafts, setDrafts] = useState<string[]>(() => {
    const base = slots.slice(0, 3);
    return [base[0] ?? '', base[1] ?? '', base[2] ?? ''];
  });
  const [proposing, setProposing] = useState(slots.length === 0);
  const [confirmingSlot, setConfirmingSlot] = useState<string | null>(null);

  const cleaned = drafts.map((s) => s.trim()).filter(Boolean);
  const changed = JSON.stringify(cleaned) !== JSON.stringify(slots);
  const canSave = cleaned.length > 0 && changed;

  return (
    <SectionCard title={t('orders.section.appointments')} bodyClassName="space-y-3">
      {confirmedSlot ? (
        <Alert tone="success" title={t('orders.appointment.confirmedTitle')}>
          <span className="font-medium tabular-nums">{formatSlot(t, confirmedSlot, bcp47)}</span>
        </Alert>
      ) : (
        <p className="text-xs text-muted-foreground">
          {slots.length > 0 ? t('orders.appointment.pickOne') : t('orders.appointment.noSlotsYet')}
        </p>
      )}

      <CalendlyStatus calendly={calendly} confirmedSlot={confirmedSlot} />

      {slots.length > 0 && (
        <ul className="space-y-1.5">
          {slots.map((slot) => {
            const isConfirmed = confirmedSlot === slot;
            return (
              <li
                key={slot}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-2sm',
                  isConfirmed ? 'border-success/25 bg-success-soft' : 'border-border',
                )}
              >
                <span className="flex items-center gap-2 tabular-nums">
                  <CalendarClock
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {formatSlot(t, slot, bcp47)}
                </span>
                {isConfirmed ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('orders.appointment.confirmed')}
                  </span>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isConfirmingAppointment}
                    loading={isConfirmingAppointment && confirmingSlot === slot}
                    onClick={() => {
                      setConfirmingSlot(slot);
                      onConfirmAppointment(slot);
                    }}
                  >
                    {t('orders.appointment.confirm')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!confirmedSlot &&
        (proposing ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t('orders.appointment.proposals')}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {drafts.map((value, i) => (
                <DateTimePicker
                  key={i}
                  // The three slots share one heading, so each needs its own name:
                  // a screen reader otherwise reaches three identical blank fields.
                  aria-label={t('orders.appointment.slot', { n: i + 1, total: drafts.length })}
                  value={value}
                  onValueChange={(next) => setDrafts((d) => d.map((v, j) => (j === i ? next : v)))}
                />
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              {slots.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setProposing(false)}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!canSave}
                loading={isProposingSlots}
                onClick={() => onProposeSlots(cleaned)}
              >
                <Save aria-hidden="true" />
                {t('orders.appointment.saveProposals')}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" variant="outline" onClick={() => setProposing(true)}>
              <CalendarClock aria-hidden="true" />
              {t('orders.appointment.propose')}
            </Button>
          </div>
        ))}

      {!confirmedSlot && (
        <div className="space-y-1 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            loading={isSendingBookingLink}
            onClick={onSendBookingLink}
          >
            <Send aria-hidden="true" />
            {t('orders.appointment.letCustomerBook')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('orders.appointment.bookingLinkHint')}</p>
        </div>
      )}
    </SectionCard>
  );
}

/** The crew works off the CLEANILO Calendly calendar, so a lagging or failed booking must show. */
function CalendlyStatus({
  calendly,
  confirmedSlot,
}: {
  calendly: CalendlyPickupMeta | null;
  confirmedSlot: string | null;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  if (!calendly) {
    if (!confirmedSlot) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.calendarNotConfigured')}
      </p>
    );
  }

  if (calendly.status === 'booked') {
    // A stale booking for a slot that was later changed elsewhere — flag it.
    const mismatch = !!confirmedSlot && !!calendly.slot && calendly.slot !== confirmedSlot;
    return (
      <p className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Check className="size-3 text-success" aria-hidden="true" />
          {t('orders.appointment.inCalendar')}
          {calendly.source === 'webhook' ? t('orders.appointment.bookedByCustomer') : ''}
        </span>
        {mismatch && (
          <span className="ml-1 text-destructive">
            {t('orders.appointment.bookedMismatch', {
              slot: formatSlot(t, calendly.slot!, bcp47),
            })}
          </span>
        )}
        {calendly.rescheduleUrl && (
          <a
            href={calendly.rescheduleUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(QUIET_LINK, 'ml-2')}
          >
            {t('orders.appointment.reschedule')}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </p>
    );
  }

  if (calendly.status === 'link_sent') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.linkSentWaiting')}
        {calendly.bookingUrl && (
          <a
            href={calendly.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(QUIET_LINK, 'ml-2')}
          >
            {t('orders.appointment.openLink')}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </p>
    );
  }

  if (calendly.status === 'cancelled') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('orders.appointment.calendarEntryCancelled')}
        {calendly.source === 'webhook' ? t('orders.appointment.byCustomer') : ''}.
      </p>
    );
  }

  return (
    <Alert tone="destructive" title={t('orders.appointment.calendarMissingTitle')}>
      {t('orders.appointment.calendarMissingBody')}
    </Alert>
  );
}

// Sends under the order's own brand.
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
      /* toast in the parent mutation */
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
    <div className="space-y-3">
      {sent.length > 0 && (
        <ul className="space-y-1.5">
          {sent.slice(-3).map((m, i) => (
            <li key={i} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                <span>{m.sentByName ?? t('orders.message.team')}</span>
                <time className="tabular-nums" dateTime={m.sentAt}>
                  {formatDateTime(m.sentAt, bcp47)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-2sm text-foreground">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-lg border border-input bg-card transition-colors duration-fast focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
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
          className="min-h-[120px] resize-none rounded-none border-0 bg-transparent px-3.5 py-3 leading-relaxed shadow-none focus-visible:ring-0 sm:text-2sm"
        />
        {localError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-1.5 px-3.5 pb-2 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span>{localError}</span>
          </div>
        )}
        {justSent && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 px-3.5 pb-2 text-xs text-success"
          >
            <Check className="size-3.5" aria-hidden="true" />
            <span>{t('orders.message.sentNotice')}</span>
          </div>
        )}
        <ClaudeChatBox
          editablePrompt={{ kind: 'order_message', companySlug }}
          busy={assist.busy}
          history={assist.history}
          placeholder={t('orders.message.aiPlaceholder')}
          idleHint={body.trim() ? t('orders.message.aiRefine') : t('orders.message.aiFresh')}
          busyHint={t('ai.writing')}
          sendLabel={t('ai.send')}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            <Mail className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t('orders.message.recipientPrefix')}{' '}
              <span className="font-medium text-foreground">{order.customerEmail}</span>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <kbd className="hidden items-center gap-0.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:inline-flex">
              ⌘↩
            </kbd>
            <Button
              size="sm"
              onClick={requestSend}
              disabled={body.trim() === ''}
              loading={isSending}
            >
              <Send aria-hidden="true" />
              {isSending ? t('orders.message.sending') : t('orders.message.send')}
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

function AfterServicePaymentCard({
  companySlug,
  order,
  bcp47,
}: {
  companySlug: CompanySlug;
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
          ? t('orders.afterService.failed')
          : null;
  const amount = formatCurrency(order.totalCents / 100, 'EUR', bcp47);

  return (
    <SectionCard title={t('orders.section.payAfterService')} bodyClassName="space-y-3 p-4">
      {isPaid ? (
        <Alert
          tone="success"
          title={`${t('orders.status.paid')}${
            order.paymentMethod ? ` · ${t(PAYMENT_METHOD_LABEL[order.paymentMethod])}` : ''
          }`}
        >
          {order.paidAt ? (
            <span className="tabular-nums">
              {formatDateTime(order.paidAt, bcp47)} · {amount}
            </span>
          ) : null}
        </Alert>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('orders.afterService.recordHint', { amount })}
          </p>
          <div className="grid gap-2">
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy}
              loading={recordPayment.isPending && recordPayment.variables === 'cash'}
              onClick={() => recordPayment.mutate('cash')}
            >
              <Banknote aria-hidden="true" />
              {t(PAYMENT_METHOD_LABEL.cash)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy}
              loading={recordPayment.isPending && recordPayment.variables === 'ec_card'}
              onClick={() => recordPayment.mutate('ec_card')}
            >
              <Wallet aria-hidden="true" />
              {t(PAYMENT_METHOD_LABEL.ec_card)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy}
              loading={paymentLink.isPending}
              onClick={() => paymentLink.mutate()}
            >
              <CreditCard aria-hidden="true" />
              {t(PAYMENT_METHOD_LABEL.credit_card)}
            </Button>
          </div>

          {linkUrl && (
            <Alert tone="info">
              <p>{t('orders.afterService.linkCreated', { email: order.customerEmail })}</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  readOnly
                  value={linkUrl}
                  aria-label={t('orders.afterService.linkLabel')}
                  className="min-w-0 flex-1 font-mono sm:text-xs"
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
                      /* clipboard unavailable; the field stays selectable */
                    }
                  }}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? t('orders.afterService.copied') : t('orders.afterService.copy')}
                </Button>
              </div>
            </Alert>
          )}

          {errorMsg && <Alert tone="destructive">{errorMsg}</Alert>}
        </>
      )}
    </SectionCard>
  );
}

function ProviderIdCard({
  provider,
  action,
  children,
}: {
  provider: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted/40 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {provider}
        </span>
        {action}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

function StripePaymentCard({
  order,
  onSyncStripe,
  isSyncing,
  syncResult,
  syncError,
}: {
  order: OrderRow;
  onSyncStripe: () => void;
  isSyncing: boolean;
  syncResult: SyncResult | null;
  syncError: string | null;
}) {
  const t = useT();
  // PayPal orders settle in the PayPal account — no Stripe IDs and no Stripe sync.
  if (order.paymentProvider === 'paypal') {
    return <PayPalPaymentCard order={order} />;
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
    <SectionCard title={t('orders.section.payment')} bodyClassName="space-y-3 p-4">
      {!hasAnyStripeId ? (
        <p className="text-xs text-muted-foreground">{t('orders.stripe.noData')}</p>
      ) : (
        <ProviderIdCard
          provider="Stripe"
          action={
            piUrl ? (
              <a
                href={piUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(TEXT_LINK, 'inline-flex items-center gap-1 text-xs')}
              >
                {t('orders.stripe.openDashboard')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null
          }
        >
          <KeyValueList>
            {order.stripePaymentIntentId ? (
              <KeyValue
                label={t('orders.stripe.paymentIntent')}
                value={<ProviderId value={order.stripePaymentIntentId} href={piUrl} />}
              />
            ) : null}
            {order.stripeSessionId ? (
              <KeyValue
                label={t('orders.stripe.checkoutSession')}
                value={<ProviderId value={order.stripeSessionId} href={sessionUrl} />}
              />
            ) : null}
          </KeyValueList>
        </ProviderIdCard>
      )}

      {canSync && (
        <Alert
          tone="warning"
          action={
            <Button size="sm" variant="outline" onClick={onSyncStripe} loading={isSyncing}>
              <RefreshCcw aria-hidden="true" />
              {t('orders.stripe.sync')}
            </Button>
          }
        >
          {t('orders.stripe.syncHint')}
        </Alert>
      )}

      {syncResult && <SyncResultBanner result={syncResult} />}
      {syncError && <Alert tone="destructive">{syncError}</Alert>}
    </SectionCard>
  );
}

function PayPalPaymentCard({ order }: { order: OrderRow }) {
  const t = useT();
  const hasIds = !!(order.paypalOrderId || order.paypalCaptureId);
  return (
    <SectionCard title={t('orders.section.payment')} bodyClassName="space-y-3 p-4">
      <ProviderIdCard provider="PayPal">
        {hasIds ? (
          <KeyValueList>
            {order.paypalOrderId ? (
              <KeyValue
                label={t('orders.paypal.orderId')}
                value={<ProviderId value={order.paypalOrderId} href={null} />}
              />
            ) : null}
            {order.paypalCaptureId ? (
              <KeyValue
                label={t('orders.paypal.captureId')}
                value={<ProviderId value={order.paypalCaptureId} href={null} />}
              />
            ) : null}
          </KeyValueList>
        ) : (
          <p className="text-xs text-muted-foreground">{t('orders.paypal.noData')}</p>
        )}
      </ProviderIdCard>
      <p className="text-xs text-muted-foreground">{t('orders.paypal.manualNote')}</p>
    </SectionCard>
  );
}

function ProviderId({ value, href }: { value: string; href: string | null }) {
  const display = abbreviateId(value);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(TEXT_LINK, 'font-mono text-xs')}
      title={value}
    >
      {display}
    </a>
  ) : (
    <span className="font-mono text-xs" title={value}>
      {display}
    </span>
  );
}

function abbreviateId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

const SYNC_RESULT_TONE = {
  marked_paid: 'success',
  marked_cancelled: 'destructive',
  still_pending: 'warning',
  noop: 'neutral',
} as const;

function SyncResultBanner({ result }: { result: SyncResult }) {
  const t = useT();
  const text = {
    marked_paid: t('orders.stripe.markedPaid'),
    marked_cancelled: t('orders.stripe.markedCancelled'),
    still_pending: t('orders.stripe.stillPending', {
      sessionStatus: result.stripe.sessionStatus,
      paymentStatus: result.stripe.paymentStatus,
    }),
    noop: t('orders.stripe.noop'),
  }[result.action];
  return <Alert tone={SYNC_RESULT_TONE[result.action]}>{text}</Alert>;
}
