/** What a QR code on a template is for; the import script tags every QR slot with one. */
export type QrPurpose =
  | 'website'
  | 'booking'
  | 'inquiry'
  | 'review'
  | 'voucher'
  | 'partner'
  | 'verify'
  | 'order';

export const QR_PURPOSES: QrPurpose[] = [
  'website',
  'booking',
  'inquiry',
  'review',
  'voucher',
  'partner',
  'verify',
  'order',
];

export type QrLinks = Record<QrPurpose, string>;

/** Stored per template path; `_brand` holds the brand-wide part (values, links, utm). */
export interface MaterialDraftData {
  /** Whole-text edits keyed by the original text. */
  edits?: Record<string, string>;
  /** Placeholder values keyed by placeholder key; brand-wide. */
  values?: Record<string, string>;
  /** QR content per slot index (template override). */
  qr?: Record<string, string>;
  /** Photo URL per slot index. */
  images?: Record<string, string>;
  /** Brand QR link defaults per purpose. */
  links?: Partial<QrLinks>;
  /** Append utm_* parameters to brand-domain QR links. */
  utm?: boolean;
}

export const BRAND_PATH = '_brand';

export function isQrPurpose(value: string | undefined): value is QrPurpose {
  return !!value && (QR_PURPOSES as string[]).includes(value);
}

/** utm_source=print&utm_medium=qr&utm_campaign=<template>; keeps parameters already set. */
export function withUtm(content: string, campaign: string): string {
  let url: URL;
  try {
    url = new URL(content);
  } catch {
    return content;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return content;
  const set = (key: string, value: string) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  set('utm_source', 'print');
  set('utm_medium', 'qr');
  set('utm_campaign', campaign);
  return url.toString();
}

export type QrSource = 'template' | 'brand' | 'default';

/** Template override → brand link → built-in default; UTM only on the brand's own domain. */
export function resolveQr(opts: {
  purpose: QrPurpose;
  override: string | undefined;
  links: Partial<QrLinks> | undefined;
  defaults: QrLinks;
  utm: boolean;
  campaign: string;
}): { content: string; base: string; source: QrSource } {
  const override = opts.override?.trim();
  const brand = opts.links?.[opts.purpose]?.trim();
  const base = override || brand || opts.defaults[opts.purpose];
  const source: QrSource = override ? 'template' : brand ? 'brand' : 'default';
  let content = base;
  if (opts.utm && sameSite(base, opts.defaults.website)) content = withUtm(base, opts.campaign);
  return { content, base, source };
}

function sameSite(a: string, b: string): boolean {
  try {
    const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
    return host(a) === host(b);
  } catch {
    return false;
  }
}

/** "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00". */
export function formatIban(iban: string): string {
  return iban
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export interface CompanyFacts {
  vatId?: string | null;
  iban?: string | null;
  bic?: string | null;
  accountHolder?: string | null;
  legalName?: string | null;
  name?: string | null;
}

/** Placeholder values the company record already knows (keys as sheet.js names them). */
export function companyValues(company: CompanyFacts | undefined): Record<string, string> {
  if (!company) return {};
  const out: Record<string, string> = {};
  const put = (key: string, value: string | null | undefined) => {
    if (value?.trim()) out[key] = value.trim();
  };
  put('USt-IdNr. · [PLATZHALTER]', company.vatId);
  put('IBAN · [PLATZHALTER]', company.iban ? formatIban(company.iban) : null);
  put('BIC · [PLATZHALTER]', company.bic);
  put('[ Kontoinhaber ]', company.accountHolder || company.legalName || company.name);
  return out;
}

// Company facts and partner terms are the same on every template; customer and document
// details (names, subjects, dates) stay on the one template they were typed into.
const BRAND_VALUE =
  /^(?:(?:USt-IdNr\.|IBAN|BIC|Provision|Basis-Provision|Auszahlungsrhythmus|Vergütungsmodell|Leistungsbonus) · |\[ Kontoinhaber \]$|\[0800-NUMMER\]$)/;

export function isBrandValue(key: string): boolean {
  return BRAND_VALUE.test(key);
}

/** Company facts < brand values < template values; empty strings mean "not set". */
export function effectiveValues(
  company: Record<string, string>,
  ...layers: (Record<string, string> | undefined)[]
): Record<string, string> {
  const out = { ...company };
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer ?? {})) {
      if (value.trim()) out[key] = value;
    }
  }
  return out;
}

const SECTIONS = ['edits', 'values', 'qr', 'images', 'links'] as const;

/**
 * Three-way merge after a save conflict: keys this client changed since `base` win, every
 * other key takes the newer server copy.
 */
export function mergeDraft(
  base: MaterialDraftData,
  local: MaterialDraftData,
  fresh: MaterialDraftData,
): MaterialDraftData {
  const out: MaterialDraftData = {};
  for (const section of SECTIONS) {
    const b = (base[section] ?? {}) as Record<string, string>;
    const l = (local[section] ?? {}) as Record<string, string>;
    const merged: Record<string, string> = {
      ...((fresh[section] ?? {}) as Record<string, string>),
    };
    for (const key of new Set([...Object.keys(b), ...Object.keys(l)])) {
      if (b[key] === l[key]) continue;
      if (key in l) merged[key] = l[key]!;
      else delete merged[key];
    }
    if (Object.keys(merged).length) (out as Record<string, unknown>)[section] = merged;
  }
  const utm = local.utm !== base.utm ? local.utm : fresh.utm;
  if (utm !== undefined) out.utm = utm;
  return out;
}
