import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Domain of synthetic placeholder addresses on imported customers with no real
 * email. Mirrors the backend guard in email/service.ts — these are never mailed.
 */
export const NONCONTACTABLE_EMAIL_DOMAIN = 'import.cleanilo.local';

/** True if `email` is a synthetic placeholder (imported customer, no real email). */
export function isNonContactableEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${NONCONTACTABLE_EMAIL_DOMAIN}`);
}

export function formatCurrency(amount: number, currency = 'EUR', bcp47 = 'de-DE') {
  // Always show cents — this renders real money (totals, lifetime spend,
  // subscription price); rounding to whole euros misstated amounts (€149.50 → €150).
  return new Intl.NumberFormat(bcp47, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, bcp47 = 'de-DE') {
  return new Intl.NumberFormat(bcp47).format(value);
}

export function formatDateTime(
  iso: string | Date,
  bcp47 = 'de-DE',
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
) {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(bcp47, opts).format(date);
}

export function formatShortDate(iso: string | Date, bcp47 = 'de-DE') {
  return formatDateTime(iso, bcp47, { day: '2-digit', month: '2-digit' });
}

/** Returns value if it's a safe http(s) URL, else null. Blocks javascript:/data: schemes (XSS guard). */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
