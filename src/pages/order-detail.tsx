import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Camera,
  Check,
  CheckCircle2,
  MapPin,
  MoreHorizontal,
  Save,
  Truck,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmailLogList } from '@/components/email-log-list';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { OrderAppointmentsCard } from '@/components/order-appointments-card';
import { OrderCancelDialog } from '@/components/order-cancel-dialog';
import { OrderDocumentsCard } from '@/components/order-documents';
import { OrderFilesCard } from '@/components/order-files';
import { OrderLegacyCard } from '@/components/order-legacy-card';
import { OrderMessageComposer, OrderSentMessages } from '@/components/order-message-composer';
import { OrderPaymentCard } from '@/components/order-payment-cards';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { PartnerDispatchCard } from '@/components/partner-dispatch';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard, SectionLabel } from '@/components/section';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ordersAdminApi,
  type OrderDetailResponse,
  type OrderRow,
  type OrderStatus,
  type OrderTransitionStatus,
  ApiError,
} from '@/lib/api';
import { useOrderKindLabel } from '@/lib/use-order-kind-label';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime, isNonContactableEmail } from '@/lib/utils';
import {
  STATUS_LABEL,
  formatDay,
  invalidateOrder,
  isClosedStatus,
  isImportedOrder,
  isRefundStatus,
  orderDetailKey,
  orderFilesOf,
  readOrderNavState,
  statusText,
  transitionConfirmCopy,
} from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

/**
 * "Unpaid" badge only where the status does not already say it (payment_pending)
 * and the order is not closed out (cancelled / refunded).
 */
const UNPAID_NOTABLE: ReadonlySet<string> = new Set([
  'pending',
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
  'delivered',
  'completed',
]);

/** Payment steps happen at checkout, cancelling has its own dialog: neither goes through /transition. */
const NOT_TRANSITIONS: ReadonlySet<string> = new Set([
  'pending',
  'payment_pending',
  'paid',
  'cancelled',
]);

/** Mirrors the backend: no new partner offers once an order is closed. */
const DISPATCH_CLOSED: ReadonlySet<string> = new Set(['cancelled', 'refunded', 'completed']);

const TEXT_LINK =
  'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  const location = useLocation();
  const nav = readOrderNavState(location.state);
  const backTo = `/auftraege${nav.from ?? ''}`;

  const detail = useQuery({
    queryKey: orderDetailKey(companySlug, orderId),
    enabled: orderId != null,
    queryFn: ({ signal }) => ordersAdminApi.get(companySlug, orderId!, signal),
  });
  usePageTitle(detail.data ? detail.data.order.orderNumber : t('orders.detailTitle'));

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

  return <DetailBody data={detail.data} companySlug={companySlug} backTo={backTo} />;
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
  backTo,
}: {
  data: OrderDetailResponse;
  companySlug: CompanySlug;
  backTo: string;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const kindLabel = useOrderKindLabel(companySlug);
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const { order, items, statusLog, allowedNextStatuses, invoice } = data;
  const imported = isImportedOrder(order);
  const closed = isClosedStatus(order.status);
  const contactable = !isNonContactableEmail(order.customerEmail);
  const files = orderFilesOf(order.metadata);

  const paymentBadge = imported ? null : order.paidAt ? (
    order.status === 'paid' ? null : (
      <Badge variant="success">{t('orders.status.paid')}</Badge>
    )
  ) : UNPAID_NOTABLE.has(order.status) ? (
    <Badge variant="warning">{t('orders.unpaid')}</Badge>
  ) : null;

  return (
    <PageContainer>
      <RecordNav
        pager={<RecordPager currentId={order.id} hrefFor={(next) => `/auftraege/${next}`} />}
      >
        <BackLink to={backTo}>{t('orders.title')}</BackLink>
      </RecordNav>
      <PageHeading
        title={<span className="tabular-nums">{order.orderNumber}</span>}
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            {paymentBadge}
            {imported ? <Badge variant="outline">{t('orders.legacy.badge')}</Badge> : null}
          </>
        }
        subtitle={`${order.customerName || t('orders.unknownCustomer')} · ${kindLabel(order.kind)}`}
        // Imported history is read-only: a refund or status change there would rewrite the archive.
        actions={
          canWrite && !imported ? (
            <OrderStatusActions
              companySlug={companySlug}
              order={order}
              allowedNextStatuses={allowedNextStatuses}
            />
          ) : null
        }
      />

      {imported ? (
        <Alert tone="neutral" className="mb-5">
          {t('orders.legacy.notice')}
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <PositionsCard order={order} items={items} bcp47={bcp47} />

          <OrderLegacyCard order={order} />
          <OrderFilesCard companySlug={companySlug} files={files} />

          <PartnerDispatchCard
            companySlug={companySlug}
            target={{ kind: 'orders', order }}
            assignedPartnerId={order.assignedPartnerId}
            closed={DISPATCH_CLOSED.has(order.status)}
            onAssignmentChange={async () => {
              await queryClient.invalidateQueries({
                queryKey: ['order-detail', companySlug, order.id],
              });
              await queryClient.invalidateQueries({
                queryKey: ['orders-infinite', companySlug],
                exact: false,
              });
            }}
          />

          <OrderAppointmentsCard
            key={`appt:${order.id}:${order.updatedAt}`}
            companySlug={companySlug}
            order={order}
            editable={canWrite && !closed && !imported}
          />

          <SectionCard title={t('orders.detail.communication')}>
            <Tabs defaultValue="message">
              <TabsList variant="line">
                <TabsTrigger value="message">{t('orders.detail.tabMessage')}</TabsTrigger>
                <TabsTrigger value="emails">{t('emails.record.title')}</TabsTrigger>
              </TabsList>
              {/* Kept mounted: switching to the log must not drop a draft. */}
              <TabsContent value="message" forceMount className="data-[state=inactive]:hidden">
                {canWrite && contactable && !imported ? (
                  <OrderMessageComposer companySlug={companySlug} order={order} />
                ) : (
                  <div className="space-y-3">
                    <OrderSentMessages order={order} />
                    <p className="text-xs text-muted-foreground">
                      {imported
                        ? t('orders.message.imported')
                        : contactable
                          ? t('orders.message.readOnly')
                          : t('orders.message.noEmail')}
                    </p>
                  </div>
                )}
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
          <CustomerCard order={order} />
          <AddressCard order={order} bcp47={bcp47} />
          <OrderPaymentCard companySlug={companySlug} order={order} canWrite={canWrite} />
          <OrderDocumentsCard
            companySlug={companySlug}
            order={order}
            invoice={invoice}
            canWrite={canWrite}
          />
          <NotesCard key={order.id} companySlug={companySlug} order={order} canWrite={canWrite} />
        </aside>
      </div>
    </PageContainer>
  );
}

/** Next step as the primary button, the rest (refunds, cancel) behind "More". */
function OrderStatusActions({
  companySlug,
  order,
  allowedNextStatuses,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  allowedNextStatuses: OrderStatus[];
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderTransitionStatus | null>(null);
  const [requestedStatus, setRequestedStatus] = useState<OrderTransitionStatus | null>(null);

  const transition = useMutation({
    mutationFn: (toStatus: OrderTransitionStatus) =>
      ordersAdminApi.transition(companySlug, order.id, { toStatus }),
    onSuccess: async (_res, toStatus) => {
      await invalidateOrder(queryClient, companySlug, order.id);
      toast.success(t('orders.transition.done', { status: t(STATUS_LABEL[toStatus]) }));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.transition.failed')),
  });

  // Cancellation goes through the policy-aware dialog (/cancel), not the
  // bare /transition path — /transition doesn't refund on `cancelled`.
  const cancelOffered = allowedNextStatuses.includes('cancelled');
  const transitionStatuses = allowedNextStatuses.filter(
    (s): s is OrderTransitionStatus => s in STATUS_LABEL && !NOT_TRANSITIONS.has(s),
  );
  const primaryStatus = transitionStatuses.find((s) => !isRefundStatus(s));
  const otherStatuses = transitionStatuses.filter((s) => s !== primaryStatus);
  const pendingCopy = pendingStatus ? transitionConfirmCopy(t, pendingStatus, order) : null;
  const busy = transition.isPending;

  if (!primaryStatus && otherStatuses.length === 0 && !cancelOffered) return null;

  return (
    <>
      {primaryStatus ? (
        <Button
          size="sm"
          disabled={busy}
          loading={busy && requestedStatus === primaryStatus}
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
              disabled={busy}
              loading={busy && requestedStatus !== null && requestedStatus !== primaryStatus}
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
        confirmLabel={t('orders.transition.confirm')}
        isDangerous={pendingCopy?.isDangerous ?? false}
        isPending={busy}
        onConfirm={() => {
          if (pendingStatus) {
            setRequestedStatus(pendingStatus);
            transition.mutate(pendingStatus);
          }
          setPendingStatus(null);
        }}
      />
    </>
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
      {items.length === 0 ? (
        <p className="text-2sm text-muted-foreground">
          {isImportedOrder(order) ? t('orders.noPositionsImported') : t('orders.noPositions')}
        </p>
      ) : (
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
      )}
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

function CustomerCard({ order }: { order: OrderRow }) {
  const t = useT();
  const contactable = !isNonContactableEmail(order.customerEmail);
  return (
    <SectionCard
      title={t('orders.section.customer')}
      bodyClassName="space-y-3 p-4"
      actions={
        order.customerId ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/customers/${order.customerId}`}>
              <UserRound aria-hidden="true" />
              {t('orders.openCustomer')}
            </Link>
          </Button>
        ) : null
      }
    >
      <KeyValueList layout="grid">
        <KeyValue
          label={t('orders.create.name')}
          value={order.customerName || null}
          empty={t('orders.unknownCustomer')}
        />
        <KeyValue
          label={t('orders.create.email')}
          value={
            contactable && order.customerEmail ? (
              <a href={`mailto:${order.customerEmail}`} className={cn(TEXT_LINK, 'break-all')}>
                {order.customerEmail}
              </a>
            ) : null
          }
          empty={t('orders.noEmail')}
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
          empty="—"
        />
      </KeyValueList>
    </SectionCard>
  );
}

function AddressCard({ order, bcp47 }: { order: OrderRow; bcp47: string }) {
  const t = useT();
  const showPreferred = !!order.preferredDate && !order.metadata?.preferredSlots?.length;
  const hasAddress = !!(order.addressLine1 || order.addressPostalCode || order.addressCity);
  return (
    <SectionCard
      title={
        order.pickupMode === 'onsite'
          ? t('orders.section.serviceAddress')
          : t('orders.section.pickup')
      }
      bodyClassName="space-y-1.5 p-4 text-2sm"
    >
      {order.pickupLabel ? (
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{order.pickupLabel}</span>
        </div>
      ) : null}
      {hasAddress ? (
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <address className="not-italic">
            {order.addressLine1 ? (
              <>
                {order.addressLine1}
                <br />
              </>
            ) : null}
            {order.addressLine2 ? (
              <>
                {order.addressLine2}
                <br />
              </>
            ) : null}
            {[order.addressPostalCode, order.addressCity].filter(Boolean).join(' ')}
          </address>
        </div>
      ) : null}
      {showPreferred ? (
        <p className="text-xs text-muted-foreground">
          {t('orders.preferredDate', { date: formatDay(order.preferredDate!, bcp47) })}
        </p>
      ) : null}
      {!order.pickupLabel && !hasAddress && !showPreferred ? (
        <p className="text-muted-foreground">{t('orders.noAddress')}</p>
      ) : null}
    </SectionCard>
  );
}

function NotesCard({
  companySlug,
  order,
  canWrite,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  canWrite: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(order.internalNotes ?? '');
  const [dirty, setDirty] = useState(false);
  // Reset during render, not in an effect, so refetches don't clobber typing.
  const loadedKey = `${order.id}:${order.updatedAt}`;
  const [syncedKey, setSyncedKey] = useState(loadedKey);
  if (loadedKey !== syncedKey && !dirty) {
    setSyncedKey(loadedKey);
    setNotes(order.internalNotes ?? '');
  }

  const save = useMutation({
    mutationFn: (next: string) =>
      ordersAdminApi.updateNotes(companySlug, order.id, next.trim() === '' ? null : next),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: orderDetailKey(companySlug, order.id) });
      toast.success(t('orders.notesSaved'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.notesSaveFailed')),
  });

  if (!canWrite && !order.customerNotes && !order.internalNotes) return null;

  return (
    <SectionCard title={t('orders.detail.notes')} bodyClassName="space-y-4 p-4">
      {order.customerNotes ? (
        <div className="space-y-1">
          <SectionLabel as="h3">{t('orders.section.customerNote')}</SectionLabel>
          <p className="whitespace-pre-wrap text-2sm">{order.customerNotes}</p>
        </div>
      ) : null}
      {canWrite ? (
        <div className="space-y-2">
          <FormField label={t('orders.section.internalNotes')}>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder={t('orders.notesPlaceholder')}
            />
          </FormField>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => save.mutate(notes)}
            >
              <Save aria-hidden="true" />
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : order.internalNotes ? (
        <div className="space-y-1">
          <SectionLabel as="h3">{t('orders.section.internalNotes')}</SectionLabel>
          <p className="whitespace-pre-wrap text-2sm">{order.internalNotes}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
