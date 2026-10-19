import { formatDateTime, isNonContactableEmail } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';
import type { DictKey, useT } from '@/i18n';
import type { OrderKind, OrderRow, OrderStatus, OrderTransitionStatus } from '@/lib/api';
import type { QueryClient } from '@tanstack/react-query';

export type Translate = ReturnType<typeof useT>;

/** Handed over via `location.state`: the list's search string (back link) and its row ids (prev/next). */
export interface OrderNavState {
  from?: string;
  ids?: number[];
}

export function readOrderNavState(state: unknown): OrderNavState {
  if (!state || typeof state !== 'object') return {};
  const s = state as Record<string, unknown>;
  return {
    from: typeof s.from === 'string' ? s.from : undefined,
    ids:
      Array.isArray(s.ids) && s.ids.every((n) => typeof n === 'number')
        ? (s.ids as number[])
        : undefined,
  };
}

export function orderDetailKey(companySlug: CompanySlug, orderId: number | null) {
  return ['order-detail', companySlug, orderId] as const;
}

/** After a write: the order, its brand list (tab counts live under the same prefix) and the cross-brand list. */
export async function invalidateOrder(
  queryClient: QueryClient,
  companySlug: CompanySlug,
  orderId: number,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: orderDetailKey(companySlug, orderId) });
  await queryClient.invalidateQueries({ queryKey: ['orders-infinite', companySlug], exact: false });
  await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
}

export const STATUS_LABEL: Record<OrderStatus, DictKey> = {
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

export const STATUS_VARIANT: Record<
  OrderStatus,
  'accent' | 'info' | 'warning' | 'success' | 'secondary' | 'destructive'
> = {
  pending: 'secondary',
  payment_pending: 'warning',
  paid: 'info',
  accepted: 'info',
  picked_up: 'accent',
  in_cleaning: 'accent',
  ready: 'accent',
  delivered: 'success',
  completed: 'success',
  cancelled: 'destructive',
  // A partial refund is not a dead order — it keeps running with less money on it.
  partially_refunded: 'warning',
  refunded: 'destructive',
};

export const KIND_LABEL: Record<OrderKind, DictKey> = {
  teppichreinigung: 'orders.kind.teppichreinigung',
  teppichreparatur: 'orders.kind.teppichreparatur',
  polsterreinigung: 'orders.kind.polsterreinigung',
  teppichbodenreinigung: 'orders.kind.teppichbodenreinigung',
};

export const PAYMENT_METHOD_LABEL: Record<'cash' | 'ec_card' | 'credit_card', DictKey> = {
  cash: 'orders.paymentMethod.cash',
  ec_card: 'orders.paymentMethod.ecCard',
  credit_card: 'orders.paymentMethod.creditCard',
};

/** Stored payment method → label; an unknown value shows raw rather than blank. */
export function paymentMethodText(t: Translate, method: string | null | undefined): string | null {
  if (!method) return null;
  const key = PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL];
  return key ? t(key) : method;
}

/** Done or dead; everything else is still in flight. Mirrors the backend `view=open`. */
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'refunded']);

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}

/** Rows written by an import script (old CLEANILO system, 2021–26 invoices): history, not work. */
export function isImportedOrder(order: Pick<OrderRow, 'source'>): boolean {
  return !!order.source && order.source.startsWith('import_');
}

/** `open` is the default view; `cancelled` and `completed` keep the history one click away. */
export type StatusFilter =
  | 'open'
  | 'paid'
  | 'accepted'
  | 'in_cleaning'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'all';

export const STATUS_FILTERS: Array<{ value: StatusFilter; labelKey: DictKey }> = [
  { value: 'open', labelKey: 'orders.tab.open' },
  { value: 'paid', labelKey: 'orders.tab.paid' },
  { value: 'accepted', labelKey: 'orders.tab.accepted' },
  { value: 'in_cleaning', labelKey: 'orders.tab.inCleaning' },
  { value: 'ready', labelKey: 'orders.tab.ready' },
  { value: 'completed', labelKey: 'orders.tab.completed' },
  { value: 'cancelled', labelKey: 'orders.tab.cancelled' },
  { value: 'all', labelKey: 'orders.tab.all' },
];

export function parseStatusFilter(raw: string | null): StatusFilter {
  return STATUS_FILTERS.some((f) => f.value === raw) ? (raw as StatusFilter) : 'open';
}

/** The list API's filter for a tab. */
export function filterQuery(filter: StatusFilter): {
  status?: OrderStatus;
  view?: 'open';
} {
  if (filter === 'all') return {};
  if (filter === 'open') return { view: 'open' };
  return { status: filter };
}

/** Tab count from the per-status totals; undefined while they load. */
export function filterCount(
  filter: StatusFilter,
  counts: Partial<Record<string, number>> | undefined,
): number | undefined {
  if (!counts) return undefined;
  const entries = Object.entries(counts) as Array<[string, number | undefined]>;
  const sum = (keep: (status: string) => boolean) =>
    entries.reduce((n, [status, c]) => (keep(status) ? n + (c ?? 0) : n), 0);
  if (filter === 'all') return sum(() => true);
  if (filter === 'open') return sum((s) => !CLOSED_STATUSES.has(s));
  return counts[filter] ?? 0;
}

/** Second line under a customer name: email (unless an import placeholder) and phone. */
export function contactLine(order: Pick<OrderRow, 'customerEmail' | 'customerPhone'>): string {
  const email = isNonContactableEmail(order.customerEmail) ? null : order.customerEmail;
  return [email, order.customerPhone].filter(Boolean).join(' · ');
}

export function isRefundStatus(status: OrderStatus): boolean {
  return status === 'refunded' || status === 'partially_refunded';
}

// Transitions the backend emails the customer about, so the confirm copy says so.
const CUSTOMER_NOTIFYING: ReadonlySet<OrderStatus> = new Set([
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
  'delivered',
  'completed',
]);

export function transitionConfirmCopy(
  t: Translate,
  status: OrderTransitionStatus,
  order: OrderRow,
): { title: string; description: string; isDangerous: boolean } {
  const title = t('orders.transition.confirmTitle', { status: t(STATUS_LABEL[status]) });
  if (isRefundStatus(status)) {
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

/** Status-log values come from the server; an unknown one shows raw rather than blank. */
export function statusText(t: Translate, status: string | null | undefined): string {
  if (!status) return '—';
  const key = STATUS_LABEL[status as OrderStatus];
  return key ? t(key) : status;
}

/**
 * "2026-05-27T09:00" → "27.05.2026 · 09:00 Uhr" (de) / "27/05/2026 · 09:00" (en). A slot is a
 * wall-clock time without a zone, so it is formatted from its parts; other strings pass through.
 */
export function formatSlot(t: Translate, slot: string, bcp47: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(slot);
  if (!m) return slot;
  const [, y, mo, d, h, min] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min));
  return t('orders.appointment.slotFormat', {
    date: formatDateTime(date, bcp47, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: formatDateTime(date, bcp47, { hour: '2-digit', minute: '2-digit' }),
  });
}

export function formatDay(day: string, bcp47: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatDateTime(date, bcp47, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface OrderFile {
  key: string;
  name: string;
  size: number;
  contentType?: string;
}

/** `metadata.files` as written by the import (`[{ key, name, size, contentType }]`); malformed entries are dropped. */
export function orderFilesOf(metadata: Record<string, unknown> | null | undefined): OrderFile[] {
  const raw = metadata?.files;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): OrderFile[] => {
    if (!f || typeof f !== 'object') return [];
    const { key, name, size, contentType } = f as Record<string, unknown>;
    if (typeof key !== 'string' || !key) return [];
    return [
      {
        key,
        name: typeof name === 'string' && name ? name : (key.split('/').pop() ?? key),
        size: typeof size === 'number' ? size : 0,
        ...(typeof contentType === 'string' ? { contentType } : {}),
      },
    ];
  });
}
