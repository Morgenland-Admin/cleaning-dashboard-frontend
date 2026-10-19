import { labelOr } from '@/lib/customer-display';
import { isNonContactableEmail } from '@/lib/utils';

import type { useT } from '@/i18n';

type T = ReturnType<typeof useT>;

export function emailKindLabel(t: T, kind: string): string {
  return labelOr(t, `emails.kind.${kind}`, kind);
}

export function emailEventLabel(t: T, type: string): string {
  return labelOr(t, `emails.event.${type}`, type);
}

/** `to_address` is a ", "-joined list; imported placeholder addresses are never shown. */
export function displayRecipients(t: T, toAddress: string): string {
  return toAddress
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => (isNonContactableEmail(a) ? t('emails.placeholderRecipient') : a))
    .join(', ');
}
