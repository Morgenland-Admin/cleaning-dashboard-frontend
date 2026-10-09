import type { DictKey } from '@/i18n';
import type { SeoPageRow, SeoPageStatus } from '@/lib/api';

/** Client-side upload guardrails (backend allows up to 10 MB). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_LABEL = 'JPG, PNG, WebP';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Recommended Open Graph dimensions for the article hero / social card. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const STATUS_KEY: Record<SeoPageStatus, DictKey> = {
  draft: 'blog.statusDraft',
  live: 'blog.statusLive',
  protected: 'blog.statusProtected',
};

export const STATUS_TONE: Record<SeoPageStatus, 'info' | 'success' | 'warning'> = {
  draft: 'info',
  live: 'success',
  protected: 'warning',
};

export function postSlug(path: string): string {
  return path.replace(/^blog\//, '');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Pull the featured image URL out of the article's JSON-LD, if any. */
export function featuredImageUrl(row: SeoPageRow): string | null {
  const schema = row.schemaJsonld;
  const nodes = Array.isArray(schema) ? schema : schema ? [schema] : [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const img = (node as Record<string, unknown>).image;
    if (typeof img === 'string') return img;
    if (
      img &&
      typeof img === 'object' &&
      typeof (img as Record<string, unknown>).url === 'string'
    ) {
      return (img as Record<string, string>).url;
    }
  }
  return null;
}

/** Read author / publish date carried in the article's JSON-LD Article node. */
export function articleMeta(row: SeoPageRow): {
  author: string | null;
  datePublished: string | null;
} {
  const schema = row.schemaJsonld;
  const nodes = Array.isArray(schema) ? schema : schema ? [schema] : [];
  let author: string | null = null;
  let datePublished: string | null = null;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const o = node as Record<string, unknown>;
    if (!datePublished && typeof o.datePublished === 'string') datePublished = o.datePublished;
    if (!author) {
      const a = o.author;
      if (typeof a === 'string') author = a;
      else if (
        a &&
        typeof a === 'object' &&
        typeof (a as Record<string, unknown>).name === 'string'
      ) {
        author = (a as Record<string, string>).name;
      }
    }
  }
  return { author, datePublished };
}

/** Path prefix every blog row carries in seo_pages (`blog/<slug>`). */
export const BLOG_PATH_PREFIX = 'blog/';

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * German-aware URL slug: umlauts transliterated (ä → ae), everything else
 * reduced to a-z0-9 joined by single hyphens. Matches the backend PATH_RE.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface ArticleFields {
  image: string | null;
  author: string | null;
  datePublished: string | null;
}

export function readArticle(row: Pick<SeoPageRow, 'schemaJsonld'>): ArticleFields {
  const { author, datePublished } = articleMeta(row as SeoPageRow);
  return { image: featuredImageUrl(row as SeoPageRow), author, datePublished };
}

function isObject(node: unknown): node is Record<string, unknown> {
  return !!node && typeof node === 'object' && !Array.isArray(node);
}

function isArticle(node: unknown): node is Record<string, unknown> {
  return isObject(node) && /article|blogposting/i.test(String(node['@type'] ?? ''));
}

/**
 * Write the editor's article fields onto the JSON-LD Article node, keeping
 * every other node and key the automation put there. Empty values delete the
 * key so the storefront falls back to its defaults.
 */
export function writeArticle(
  schema: SeoPageRow['schemaJsonld'],
  fields: ArticleFields & { headline: string; description: string },
): Record<string, unknown> | unknown[] {
  const apply = (node: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...node };
    if (!next['@context']) next['@context'] = 'https://schema.org';
    if (!next['@type']) next['@type'] = 'BlogPosting';
    const set = (key: string, value: unknown) => {
      if (value === null || value === '') delete next[key];
      else next[key] = value;
    };
    set('headline', fields.headline);
    set('description', fields.description);
    set('image', fields.image);
    set('datePublished', fields.datePublished);
    const prevAuthor = node.author;
    if (!fields.author) delete next.author;
    else if (isObject(prevAuthor)) next.author = { ...prevAuthor, name: fields.author };
    else next.author = { '@type': 'Organization', name: fields.author };
    return next;
  };

  if (Array.isArray(schema)) {
    const idx = schema.findIndex(isArticle);
    const at = idx >= 0 ? idx : schema.findIndex(isObject);
    if (at < 0) return [...schema, apply({})];
    return schema.map((n, i) => (i === at ? apply(n as Record<string, unknown>) : n));
  }
  return apply(isObject(schema) ? schema : {});
}

/** Plain text of an HTML fragment (for word counts and SEO checks). */
export function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Same rate the storefront uses for its "Min. Lesezeit". */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** `2026-10-09T…Z` → `2026-10-09` for a date input, in local time. */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Storefronts whose look the editor canvas and preview reproduce (see
 * `.site-theme-*` in index.css). Brands without an entry fall back to the
 * dashboard palette.
 */
const SITE_THEME: Partial<Record<string, string>> = {
  hamburg_teppichreinigung: 'site-theme-hamburg',
};

export function siteThemeClass(companySlug: string): string | null {
  return SITE_THEME[companySlug] ?? null;
}
