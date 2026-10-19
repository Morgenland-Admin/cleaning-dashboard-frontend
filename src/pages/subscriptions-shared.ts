import type { DictKey, useT } from '@/i18n';
import type { SubscriptionAction, SubscriptionStatus } from '@/lib/api';

type Translate = ReturnType<typeof useT>;
type Tone = 'success' | 'info' | 'danger' | 'neutral';

const TONE: Record<SubscriptionStatus, Tone> = {
  active: 'success',
  paused: 'info',
  past_due: 'danger',
  cancelled: 'neutral',
};

const LABEL: Record<SubscriptionStatus, DictKey> = {
  active: 'subscriptions.status.active',
  paused: 'subscriptions.status.paused',
  past_due: 'subscriptions.status.past_due',
  cancelled: 'subscriptions.status.cancelled',
};

/** Status values come from the DB; an unknown one renders raw and neutral. */
export function subscriptionStatusTone(status: string): Tone {
  return TONE[status as SubscriptionStatus] ?? 'neutral';
}

export function subscriptionStatusLabel(t: Translate, status: string): string {
  const key = LABEL[status as SubscriptionStatus];
  return key ? t(key) : status;
}

/** Valid lifecycle transitions; cancelled (and anything unknown) is terminal. */
export function lifecycleActionsFor(status: string): SubscriptionAction[] {
  switch (status) {
    case 'active':
      return ['pause', 'cancel'];
    case 'paused':
    case 'past_due':
      return ['resume', 'cancel'];
    default:
      return [];
  }
}

/** Every lifecycle action is mirrored to Stripe (billing stops or restarts), so each one is confirmed. */
export function lifecycleConfirmCopy(
  t: Translate,
  action: SubscriptionAction,
): { title: string; description: string; isDangerous: boolean } {
  switch (action) {
    case 'cancel':
      return {
        title: t('subscriptions.cancel'),
        description: t('subscriptions.confirmCancel'),
        isDangerous: true,
      };
    case 'pause':
      return {
        title: t('subscriptions.pause'),
        description: t('subscriptions.confirmPause'),
        isDangerous: false,
      };
    default:
      return {
        title: t('subscriptions.resume'),
        description: t('subscriptions.confirmResume'),
        isDangerous: false,
      };
  }
}

export type SubscriptionFilter = SubscriptionStatus | 'all';

export const SUBSCRIPTION_FILTERS: SubscriptionFilter[] = [
  'all',
  'active',
  'paused',
  'past_due',
  'cancelled',
];

export function parseSubscriptionFilter(raw: string | null): SubscriptionFilter {
  return SUBSCRIPTION_FILTERS.includes(raw as SubscriptionFilter)
    ? (raw as SubscriptionFilter)
    : 'all';
}
