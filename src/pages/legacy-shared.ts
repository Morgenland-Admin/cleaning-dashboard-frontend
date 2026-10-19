import { isKnownLegacySource } from '@/lib/legacy-records';
import { formatDateTime } from '@/lib/utils';

import type { useT } from '@/i18n';

type T = ReturnType<typeof useT>;

export function legacySourceLabel(source: string, t: T): string {
  return isKnownLegacySource(source) ? t(`legacy.source.${source}`) : source;
}

export function legacyDate(iso: string, bcp47: string): string {
  return formatDateTime(iso, bcp47, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function legacyDateTime(iso: string, bcp47: string): string {
  return formatDateTime(iso, bcp47, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function legacyRange(
  firstAt: string | null,
  lastAt: string | null,
  bcp47: string,
  t: T,
): string {
  const first = firstAt ?? lastAt;
  const last = lastAt ?? firstAt;
  if (!first || !last) return t('legacy.noDate');
  const a = legacyDate(first, bcp47);
  const b = legacyDate(last, bcp47);
  return a === b ? a : `${a} – ${b}`;
}
