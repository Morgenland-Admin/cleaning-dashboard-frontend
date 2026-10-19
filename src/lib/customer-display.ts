import { humanizeSlug } from '@/lib/use-order-kind-label';
import { isNonContactableEmail } from '@/lib/utils';

import type { useT } from '@/i18n';
import type { Customer } from '@/lib/api';

type T = ReturnType<typeof useT>;

/** Tag the legacy CLEANILO import put on every customer it created. */
export const LEGACY_CUSTOMER_TAG = 'altsystem';

/** `t()` echoes a missing key; DB values outside our enums get a readable fallback instead. */
export function labelOr(t: T, key: string, value: string | null | undefined): string {
  const label = t(key as never);
  if (label && label !== key) return label;
  return value ? humanizeSlug(value) : '—';
}

/** The address if it can receive mail; null for empty or imported placeholder addresses. */
export function contactEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed && !isNonContactableEmail(trimmed) ? trimmed : null;
}

type Nameable = Pick<Customer, 'id' | 'email' | 'name' | 'companyName' | 'phone'> & {
  tags?: string[] | null;
};

/** Name, company, phone, real email — never a placeholder address; else "Altkunde #12" / "Kunde #12". */
export function customerTitle(customer: Nameable, t: T): string {
  const named =
    customer.name?.trim() ||
    customer.companyName?.trim() ||
    customer.phone?.trim() ||
    contactEmail(customer.email);
  if (named) return named;
  return customer.tags?.includes(LEGACY_CUSTOMER_TAG)
    ? t('customers.legacyLabel', { id: customer.id })
    : t('customers.fallbackLabel', { id: customer.id });
}

const TIER_TONE: Record<string, 'neutral' | 'info' | 'success'> = {
  neukunde: 'neutral',
  stammkunde: 'info',
  premium: 'success',
};

export function tierBadge(tier: string, t: T) {
  return {
    label: labelOr(t, `customers.tier.${tier}`, tier),
    tone: TIER_TONE[tier] ?? 'neutral',
  } as const;
}

export function customerTypeLabel(type: string | null | undefined, t: T): string {
  return labelOr(t, `customers.type.${type ?? 'private'}`, type);
}
