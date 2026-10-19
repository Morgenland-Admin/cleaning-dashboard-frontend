import type { SubscriptionAction, SubscriptionStatus } from '@/lib/api';

export const STATUS_TONE: Record<SubscriptionStatus, 'success' | 'info' | 'danger' | 'neutral'> = {
  active: 'success',
  paused: 'info',
  past_due: 'danger',
  cancelled: 'neutral',
};

/** Valid lifecycle transitions; cancelled is terminal. */
export function lifecycleActionsFor(status: SubscriptionStatus): SubscriptionAction[] {
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
