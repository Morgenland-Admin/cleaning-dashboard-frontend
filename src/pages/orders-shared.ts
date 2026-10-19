import { formatDateTime } from '@/lib/utils';

import type { DictKey, useT } from '@/i18n';
import type { OrderRow, OrderStatus, OrderTransitionStatus } from '@/lib/api';

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

export const KIND_LABEL: Record<OrderRow['kind'], DictKey> = {
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

export type StatusFilter = OrderStatus | 'all';

export const STATUS_FILTERS: Array<{ value: StatusFilter; labelKey: DictKey }> = [
  { value: 'all', labelKey: 'orders.tab.all' },
  { value: 'paid', labelKey: 'orders.tab.paid' },
  { value: 'accepted', labelKey: 'orders.tab.accepted' },
  { value: 'in_cleaning', labelKey: 'orders.tab.inCleaning' },
  { value: 'ready', labelKey: 'orders.tab.ready' },
  { value: 'completed', labelKey: 'orders.tab.completed' },
];

export function parseStatusFilter(raw: string | null): StatusFilter {
  return STATUS_FILTERS.some((f) => f.value === raw) ? (raw as StatusFilter) : 'all';
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
