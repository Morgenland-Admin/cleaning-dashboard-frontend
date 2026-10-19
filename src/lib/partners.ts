import { useQueries } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import {
  partnerApplicationsApi,
  partnersAdminApi,
  type ChatConversation,
  type MatchReason,
  type PartnerApplicationStatus,
  type PartnerDetailResponse,
  type PartnerDocumentKind,
  type PartnerDocumentState,
  type PartnerOfferStatus,
  type PartnerStatus,
  type ServicePricingMode,
} from '@/lib/api';
import { isNonContactableEmail } from '@/lib/utils';

import type { DictKey } from '@/i18n';

export type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';
type Translate = (key: DictKey, vars?: Record<string, string | number>) => string;

const PARTNER_STATUS_KEY: Record<PartnerStatus, DictKey> = {
  pending: 'partners.status.pending',
  active: 'partners.status.active',
  suspended: 'partners.status.suspended',
  rejected: 'partners.status.rejected',
};

const PARTNER_STATUS_HINT_KEY: Record<PartnerStatus, DictKey> = {
  pending: 'partners.statusHint.pending',
  active: 'partners.statusHint.active',
  suspended: 'partners.statusHint.suspended',
  rejected: 'partners.statusHint.rejected',
};

const PARTNER_STATUS_TONE: Record<PartnerStatus, Tone> = {
  pending: 'warning',
  active: 'success',
  suspended: 'neutral',
  rejected: 'danger',
};

const DOC_KIND_KEY: Record<PartnerDocumentKind, DictKey> = {
  gewerbeanmeldung: 'partners.docKind.gewerbeanmeldung',
  haftpflicht: 'partners.docKind.haftpflicht',
  handelsregister: 'partners.docKind.handelsregister',
  ausweis: 'partners.docKind.ausweis',
  qualifikation: 'partners.docKind.qualifikation',
  sonstiges: 'partners.docKind.sonstiges',
};

const DOC_STATE_KEY: Record<PartnerDocumentState, DictKey> = {
  missing: 'partners.docState.missing',
  pending: 'partners.docState.pending',
  approved: 'partners.docState.approved',
  rejected: 'partners.docState.rejected',
  expired: 'partners.docState.expired',
};

const DOC_STATE_TONE: Record<PartnerDocumentState, Tone> = {
  missing: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'danger',
};

const OFFER_STATUS_KEY: Record<PartnerOfferStatus, DictKey> = {
  offered: 'dispatch.offerStatus.offered',
  accepted: 'dispatch.offerStatus.accepted',
  declined: 'dispatch.offerStatus.declined',
  expired: 'dispatch.offerStatus.expired',
  withdrawn: 'dispatch.offerStatus.withdrawn',
};

const OFFER_STATUS_TONE: Record<PartnerOfferStatus, Tone> = {
  offered: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'neutral',
  withdrawn: 'neutral',
};

const MATCH_REASON_KEY: Record<MatchReason, DictKey> = {
  not_active: 'dispatch.reason.not_active',
  not_verified: 'dispatch.reason.not_verified',
  no_location: 'dispatch.reason.no_location',
  out_of_radius: 'dispatch.reason.out_of_radius',
  service_not_offered: 'dispatch.reason.service_not_offered',
};

const APPLICATION_STATUS_KEY: Record<PartnerApplicationStatus, DictKey> = {
  new: 'partnerApps.status.new',
  invited: 'partnerApps.status.invited',
  rejected: 'partnerApps.status.rejected',
};

const APPLICATION_STATUS_TONE: Record<PartnerApplicationStatus, Tone> = {
  new: 'info',
  invited: 'success',
  rejected: 'neutral',
};

const APPLICATION_SOURCE_KEY: Partial<Record<string, DictKey>> = {
  storefront: 'partnerApps.sourceLabel.storefront',
  import_legacy_cleanilo: 'partnerApps.sourceLabel.import_legacy_cleanilo',
};

const PRICING_MODE_KEY: Record<ServicePricingMode, DictKey> = {
  fixed: 'serviceCatalog.pricing.fixed',
  inquiry: 'serviceCatalog.pricing.inquiry',
};

const STRIPE_STATUS_KEY: Partial<Record<string, DictKey>> = {
  none: 'partners.stripeStatus.none',
  pending: 'partners.stripeStatus.pending',
  restricted: 'partners.stripeStatus.restricted',
  active: 'partners.stripeStatus.active',
};

// DB-fed enums: an unknown value (old import, newer backend) shows raw instead of breaking the page.
function labelFrom(
  map: Partial<Record<string, DictKey>>,
  value: string | null | undefined,
  t: Translate,
): string {
  if (!value) return '—';
  const key = map[value];
  return key ? t(key) : value;
}

function toneFrom(map: Partial<Record<string, Tone>>, value: string | null | undefined): Tone {
  return (value ? map[value] : undefined) ?? 'neutral';
}

export const partnerStatusLabel = (t: Translate, s: string) => labelFrom(PARTNER_STATUS_KEY, s, t);
export function partnerStatusHint(t: Translate, s: string): string {
  const key = (PARTNER_STATUS_HINT_KEY as Partial<Record<string, DictKey>>)[s];
  return key ? t(key) : '';
}
export const partnerStatusTone = (s: string) => toneFrom(PARTNER_STATUS_TONE, s);
export const docKindLabel = (t: Translate, k: string) => labelFrom(DOC_KIND_KEY, k, t);
export const docStateLabel = (t: Translate, s: string) => labelFrom(DOC_STATE_KEY, s, t);
export const docStateTone = (s: string) => toneFrom(DOC_STATE_TONE, s);
export const offerStatusLabel = (t: Translate, s: string) => labelFrom(OFFER_STATUS_KEY, s, t);
export const offerStatusTone = (s: string) => toneFrom(OFFER_STATUS_TONE, s);
export const matchReasonLabel = (t: Translate, r: string) => labelFrom(MATCH_REASON_KEY, r, t);
export const applicationStatusLabel = (t: Translate, s: string) =>
  labelFrom(APPLICATION_STATUS_KEY, s, t);
export const applicationStatusTone = (s: string) => toneFrom(APPLICATION_STATUS_TONE, s);
export const applicationSourceLabel = (t: Translate, s: string | null) =>
  labelFrom(APPLICATION_SOURCE_KEY, s, t);
export const pricingModeLabel = (t: Translate, m: string) => labelFrom(PRICING_MODE_KEY, m, t);
export const stripeStatusLabel = (t: Translate, s: string) => labelFrom(STRIPE_STATUS_KEY, s, t);

/** Imported categories are slugs ("haus-and-dachreinigung"); typed ones are shown as entered. */
export function catalogCategoryLabel(category: string | null): string | null {
  if (!category) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) return category;
  return category
    .replace(/-and-/g, ' & ')
    .split('-')
    .join(' ')
    .split(' ')
    .map((w, i) => (w === 'und' && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Statuses the admin chat lists (mirrors `GET /admin/chat/conversations`). */
export const CHAT_PARTNER_STATUSES: readonly string[] = ['pending', 'active'];

export function chatHref(slug: CompanySlug, partnerUserId: string): string {
  return `/chat?${new URLSearchParams({ partner: partnerUserId, brand: slug })}`;
}

/** Profile contact first, then the login account; placeholder import addresses never count. */
export function chatContactOf(c: ChatConversation): { email: string | null; phone: string | null } {
  const email =
    [c.partnerContactEmail, c.partnerEmail].find((e) => !!e && !isNonContactableEmail(e)) ?? null;
  return { email, phone: c.partnerContactPhone || c.partnerPhone || null };
}

// The brand rides along as `?brand=`: tenants' partner ids can collide.
export function partnerHref(slug: CompanySlug, id: number): string {
  return `/partner/${id}?brand=${encodeURIComponent(slug)}`;
}

export function partnerDetailKey(slug: CompanySlug, id: number) {
  return ['partner-detail', slug, id] as const;
}

/** Brand from `?brand=`; push links carry none, so every visible brand is tried then. */
export function usePartnerRecord(id: number | null) {
  const [searchParams] = useSearchParams();
  const { activeProject, projects, isAllBrands } = useProject();
  const brandParam = searchParams.get('brand');
  const linkedBrand = projects.find((p) => p.companySlug === brandParam) ?? null;
  const candidates: Project[] = linkedBrand
    ? [linkedBrand]
    : isAllBrands
      ? projects
      : [activeProject];

  const queries = useQueries({
    queries: candidates.map((b) => ({
      queryKey: partnerDetailKey(b.companySlug, id ?? 0),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        partnersAdminApi.get(b.companySlug, id!, signal),
      enabled: id !== null,
      retry: false,
    })),
  });

  let data: PartnerDetailResponse | null = null;
  let brand: Project | null = null;
  for (let i = 0; i < queries.length; i++) {
    const hit = queries[i]?.data;
    if (hit) {
      data = hit;
      brand = candidates[i] ?? null;
      break;
    }
  }
  return {
    data,
    brand,
    isLoading: !data && queries.some((q) => q.isLoading),
    isFetching: queries.some((q) => q.isFetching),
    error: queries.find((q) => q.error)?.error ?? null,
    refetch: () => queries.forEach((q) => void q.refetch()),
  };
}

export function applicationsKey(slug: CompanySlug) {
  return ['partner-applications', slug] as const;
}

/** Applications of several brands (list tab + its counter). */
export function useApplications(brands: Project[]) {
  return useQueries({
    queries: brands.map((b) => ({
      queryKey: applicationsKey(b.companySlug),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        partnerApplicationsApi.list(b.companySlug, signal),
    })),
  });
}
