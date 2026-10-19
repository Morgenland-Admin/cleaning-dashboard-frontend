import { MATERIAL_ITEMS, MATERIAL_SYSTEMS } from './brand-materials.generated';

import type { Project } from '@/contexts/project-context';
import type { QrLinks } from '@/lib/material-data';
import type { PrintSize } from '@/lib/material-print';

/** Print/marketing set from Kabir's Claude Design project, served from public/brand-materials. */
export type MaterialBrand = 'cleanilo' | 'htr' | 'trl';
export type MaterialSet = 'kunden' | 'partner';

export interface MaterialDoc {
  path: string;
  /** Content hash; part of the URL so a deploy never serves a cached old sheet. */
  version: string;
  width: number;
  height: number;
}

export interface MaterialItem extends MaterialDoc {
  brand: MaterialBrand;
  set: MaterialSet;
  no: string;
  slug: string;
  title: string;
  format: string;
  /** Final print sizes; each artboard is matched to one by aspect ratio. */
  print?: PrintSize[];
  /** Values of the template's `docType` prop (Angebot / Rechnung). */
  variants?: string[];
}

interface BrandSwatch {
  name: string;
  hex: string;
}

export interface BrandMeta {
  id: MaterialBrand;
  name: string;
  short: string;
  tagline: string;
  fonts: string[];
  palette: BrandSwatch[];
  /** Banner colours, taken from the design's overview page. */
  banner: { bg: string; fg: string; sub: string; accent: string; accentFg: string };
  /** White logo for the dark banner; TRL has no logo yet (placeholder wordmark). */
  bannerLogo?: string;
  logos: { file: string; label: string; dark?: boolean }[];
  /** Matching dashboard company slug. */
  companySlug: string;
  /** Default QR targets; pages that exist on the brand's live site. */
  links: QrLinks;
}

function siteLinks(origin: string, paths: Partial<QrLinks>): QrLinks {
  const url = (p: string | undefined) => (p ? origin + p : origin);
  return {
    website: origin,
    booking: url(paths.booking),
    inquiry: url(paths.inquiry),
    review: url(paths.review),
    voucher: url(paths.voucher),
    partner: url(paths.partner),
    verify: url(paths.verify),
    order: url(paths.order),
  };
}

export const MATERIAL_BRANDS: BrandMeta[] = [
  {
    id: 'cleanilo',
    name: 'CLEANILO',
    short: 'CLEANILO',
    tagline: 'Modern · freundlich · transparent',
    fonts: ['Urbanist', 'Cabin'],
    palette: [
      { name: 'Grün', hex: '#039B52' },
      { name: 'Blau', hex: '#0852B9' },
      { name: 'Gelb', hex: '#FFBF00' },
      { name: 'Ink', hex: '#0A182D' },
      { name: 'Weiß', hex: '#FFFFFF' },
    ],
    banner: {
      bg: '#0A182D',
      fg: '#FFFFFF',
      sub: '#9DB0C9',
      accent: '#039B52',
      accentFg: '#FFFFFF',
    },
    bannerLogo: 'cleanilo-logo-white.svg',
    logos: [
      { file: 'cleanilo-logo.svg', label: 'Primär' },
      { file: 'cleanilo-logo-ink.svg', label: 'Mono dunkel' },
      { file: 'cleanilo-logo-white.svg', label: 'Negativ', dark: true },
    ],
    companySlug: 'cleanilo',
    links: siteLinks('https://www.cleanilo.de', {
      booking: '/buchung',
      inquiry: '/anfrage',
      review: '/bewertungen',
      voucher: '/kontakt',
      partner: '/partner',
      verify: '/partner',
      order: '/bestellung',
    }),
  },
  {
    id: 'htr',
    name: 'Hamburg Teppichreinigung',
    short: 'HTR',
    tagline: 'Heritage · Orient-Spezialist',
    fonts: ['Lora', 'DM Sans'],
    palette: [
      { name: 'Terracotta', hex: '#A44023' },
      { name: 'Rostbraun', hex: '#7A2E17' },
      { name: 'Gold', hex: '#B8894A' },
      { name: 'Ink', hex: '#1E1A17' },
      { name: 'Creme', hex: '#FBF7F2' },
    ],
    banner: {
      bg: '#1E1A17',
      fg: '#F3DCD2',
      sub: '#B8967A',
      accent: '#A44023',
      accentFg: '#FBF7F2',
    },
    bannerLogo: 'htr-logo-white.svg',
    logos: [
      { file: 'htr-logo.svg', label: 'Primär' },
      { file: 'htr-logo-white.svg', label: 'Negativ', dark: true },
    ],
    companySlug: 'hamburg_teppichreinigung',
    links: siteLinks('https://hamburg-teppichreinigung.de', {
      booking: '/buchung',
      inquiry: '/kontakt',
      voucher: '/kontakt',
      partner: '/kontakt',
      verify: '/kontakt',
      order: '/bestellung',
    }),
  },
  {
    id: 'trl',
    name: 'teppichreinigen-lassen.de',
    short: 'TRL',
    tagline: 'Premium-Plattform · ruhig, fachkundig',
    fonts: ['Playfair Display', 'Inter', 'JetBrains Mono'],
    palette: [
      { name: 'Tiefblau', hex: '#1B3A5C' },
      { name: 'Salbei', hex: '#7A9B7E' },
      { name: 'Status', hex: '#2E9D6A' },
      { name: 'Ink', hex: '#0F1824' },
      { name: 'Hintergrund', hex: '#F7FAFA' },
    ],
    banner: {
      bg: '#1B3A5C',
      fg: '#F7FAFA',
      sub: '#A9BCC8',
      accent: '#F7FAFA',
      accentFg: '#1B3A5C',
    },
    logos: [],
    companySlug: 'teppichreinigen_lassen',
    // Site not live yet: everything points at the domain until pages exist.
    links: siteLinks('https://teppichreinigen-lassen.de', {}),
  },
];

export const MATERIAL_SETS: MaterialSet[] = ['kunden', 'partner'];

const MATERIALS_BASE = '/brand-materials/';

export function materialBrand(id: string | undefined): BrandMeta | undefined {
  return MATERIAL_BRANDS.find((b) => b.id === id);
}

export function isMaterialSet(value: string | null | undefined): value is MaterialSet {
  return value === 'kunden' || value === 'partner';
}

export function materialsFor(brand: MaterialBrand, set: MaterialSet): MaterialItem[] {
  return MATERIAL_ITEMS.filter((i) => i.brand === brand && i.set === set);
}

export function findMaterial(
  brand: string | undefined,
  set: string | undefined,
  slug: string | undefined,
): MaterialItem | undefined {
  return MATERIAL_ITEMS.find((i) => i.brand === brand && i.set === set && i.slug === slug);
}

export function designSystemFor(brand: MaterialBrand): MaterialDoc {
  return MATERIAL_SYSTEMS[brand];
}

/** The material set of the company picked in the header; undefined for a company without one. */
export function brandForProject(project: Project | undefined): BrandMeta | undefined {
  return MATERIAL_BRANDS.find((b) => b.companySlug === project?.companySlug);
}

/**
 * The same page for another brand: template by slug (or by number when the brand names it
 * differently), settings, design system, or the list as a last resort.
 */
export function counterpartHref(
  target: MaterialBrand,
  page: { item?: MaterialItem; view: 'template' | 'settings' | 'system' },
): string {
  if (page.view === 'settings') return materialsSettingsHref(target);
  if (page.view === 'system') return `/materialien/${target}/designsystem`;
  const item = page.item;
  if (!item) return materialsListHref(target, 'kunden');
  const twin =
    findMaterial(target, item.set, item.slug) ??
    materialsFor(target, item.set).find((m) => m.no === item.no);
  return twin ? materialHref(twin) : materialsListHref(target, item.set);
}

export function materialsListHref(brand: MaterialBrand, set: MaterialSet): string {
  return `/materialien?marke=${brand}&set=${set}`;
}

export function materialHref(item: Pick<MaterialItem, 'brand' | 'set' | 'slug'>): string {
  return `/materialien/${item.brand}/${item.set}/${item.slug}`;
}

export function materialSrc(doc: MaterialDoc): string {
  return `${MATERIALS_BASE}${doc.path}?v=${doc.version}`;
}

/** Draft key on the server: "kunden/visitenkarte", "partner/sop-a4" or "system/designsystem". */
export function templatePath(item: MaterialItem | undefined): string {
  return item ? `${item.set}/${item.slug}` : 'system/designsystem';
}

export function materialsSettingsHref(brand: MaterialBrand): string {
  return `/materialien/${brand}/einstellungen`;
}

export function logoSrc(file: string): string {
  return `${MATERIALS_BASE}assets/${file}`;
}

/** Download/print name, e.g. "HTR-Visitenkarte". */
export function materialFileName(item: MaterialItem, variant?: string): string {
  const brand = materialBrand(item.brand)?.short ?? item.brand.toUpperCase();
  return [brand, item.slug, variant?.toLowerCase()].filter(Boolean).join('-');
}
