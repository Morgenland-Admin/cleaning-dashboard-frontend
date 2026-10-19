import { ApiError } from '@/lib/api';
import { isNonContactableEmail } from '@/lib/utils';

import type { BadgeProps } from '@/components/ui/badge';
import type { CompanySlug } from '@/contexts/project-context';
import type { DictKey, useT } from '@/i18n';

export type Translate = ReturnType<typeof useT>;
type Variant = NonNullable<BadgeProps['variant']>;

/** Filter value the backend reads as "rows without a source" (plain web-form submissions). */
export const NO_SOURCE = '_none';

export const INBOX_PAGE_SIZE = 50;

/** The name's `::after` stretches over the row: one click target and Tab stop, focus ring drawn inset. */
export const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export const TEXT_LINK =
  'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const INQUIRY_STATUS: Record<string, { key: DictKey; variant: Variant }> = {
  new: { key: 'inquiries.status.new', variant: 'info' },
  in_review: { key: 'inquiries.status.in_review', variant: 'warning' },
  quoted: { key: 'inquiries.status.quoted', variant: 'accent' },
  won: { key: 'inquiries.status.won', variant: 'success' },
  lost: { key: 'inquiries.status.lost', variant: 'secondary' },
};

const CONTACT_STATUS: Record<string, { key: DictKey; variant: Variant }> = {
  new: { key: 'contacts.statusNew', variant: 'info' },
  read: { key: 'contacts.statusRead', variant: 'warning' },
  replied: { key: 'contacts.statusReplied', variant: 'success' },
  archived: { key: 'contacts.statusArchived', variant: 'secondary' },
};

export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : value;
}

export function inquiryStatusMeta(t: Translate, status: string) {
  const meta = INQUIRY_STATUS[status];
  return meta
    ? { label: t(meta.key), variant: meta.variant }
    : { label: humanize(status), variant: 'secondary' as Variant };
}

export function contactStatusMeta(t: Translate, status: string) {
  const meta = CONTACT_STATUS[status];
  return meta
    ? { label: t(meta.key), variant: meta.variant }
    : { label: humanize(status), variant: 'secondary' as Variant };
}

const SOURCE_KEY: Record<string, DictKey> = {
  [NO_SOURCE]: 'inbox.source.web',
  ai_phone: 'inbox.source.aiPhone',
  email_inbound: 'inbox.source.email',
  dashboard: 'inbox.source.dashboard',
  'n8n-test': 'inbox.source.test',
  'prod-seed': 'inbox.source.test',
  'terminal-test': 'inbox.source.test',
};

export function isImportedSource(source: string | null | undefined): boolean {
  return !!source && source.startsWith('import_');
}

export function sourceLabel(t: Translate, source: string | null | undefined): string {
  if (!source) return t('inbox.source.web');
  if (isImportedSource(source)) return t('inbox.source.legacy');
  const key = SOURCE_KEY[source];
  return key ? t(key) : humanize(source);
}

/** The address to show or mail, or null for none / an import placeholder. */
export function usableEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed && !isNonContactableEmail(trimmed) ? trimmed : null;
}

/** Imported rows can lack a name: fall back to phone, then email, then a neutral label. */
export function displayName(
  t: Translate,
  row: { name?: string | null; email?: string | null; phone?: string | null },
): string {
  return row.name?.trim() || row.phone?.trim() || usableEmail(row.email) || t('inbox.unnamed');
}

export function contactLine(row: { email?: string | null; phone?: string | null }): string {
  return [usableEmail(row.email), row.phone?.trim()].filter(Boolean).join(' · ');
}

export function loadError(
  error: unknown,
  t: Translate,
  ns: 'inquiries' | 'contacts',
): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t(`${ns}.errUnauthorized`));
    if (error.status === 403) return new Error(t(`${ns}.errForbidden`));
    return error;
  }
  return error instanceof Error ? error : new Error(t(`${ns}.errGeneric`));
}

export type BrandRef = { slug: CompanySlug; id: number };

/** What a cross-brand inbox list passes in `location.state` when it opens a record. */
export interface BrandListState {
  from?: string;
  ids?: BrandRef[];
}

export function readBrandListState(state: unknown): BrandListState {
  if (!state || typeof state !== 'object') return {};
  const s = state as Record<string, unknown>;
  const ids = Array.isArray(s.ids)
    ? s.ids.filter(
        (r): r is BrandRef =>
          !!r &&
          typeof r === 'object' &&
          typeof (r as BrandRef).slug === 'string' &&
          typeof (r as BrandRef).id === 'number',
      )
    : undefined;
  return { from: typeof s.from === 'string' ? s.from : undefined, ids };
}

export function inquiryPath(slug: CompanySlug, id: number): string {
  return `/inquiries/${encodeURIComponent(slug)}/${id}`;
}

export function contactPath(slug: CompanySlug, id: number): string {
  return `/contacts/${encodeURIComponent(slug)}/${id}`;
}

/** Status / search / source live in the URL so back from a record restores the view. */
export function readInboxParams<S extends string>(
  params: URLSearchParams,
  statuses: readonly S[],
  fallback: S,
) {
  const raw = params.get('status');
  const status = raw && (statuses as readonly string[]).includes(raw) ? (raw as S) : fallback;
  return {
    status,
    q: params.get('q') ?? '',
    source: params.get('source') ?? '',
  };
}

export function withParam(prev: URLSearchParams, key: string, value: string | null) {
  const p = new URLSearchParams(prev);
  if (value) p.set(key, value);
  else p.delete(key);
  return p;
}
