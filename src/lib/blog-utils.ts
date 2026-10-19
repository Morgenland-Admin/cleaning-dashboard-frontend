import type { DictKey } from '@/i18n';
import type { BlogListItem, SeoPageRow, SeoPageStatus, UserAccessLevel } from '@/lib/api';
import type { DocFacts } from '@/lib/blog-seo';

// Client-side limit; the backend allows up to 10 MB.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_LABEL = 'JPG, PNG, WebP';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// The storefront hero crops to 16:9; Google Discover wants ≥1200 px wide.
export const RECOMMENDED_IMAGE = { width: 1600, height: 900 };
export const MIN_IMAGE_WIDTH = 1200;

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

export function isPublic(status: SeoPageStatus): boolean {
  return status === 'live' || status === 'protected';
}

// Mirrors the backend's seo-pages write gate (requireAccess).
export function canEditBlog(level: UserAccessLevel | undefined): boolean {
  return level === 'super_admin' || level === 'admin' || level === 'manager' || level === 'seo';
}

export function postSlug(path: string): string {
  return path.replace(/^blog\//, '');
}

/** The storefront serves posts with a trailing slash (Next `trailingSlash: true`). */
export function publicPostUrl(domain: string | null | undefined, slug: string): string | null {
  return domain && slug ? `https://${domain}/blog/${slug}/` : null;
}

/** What the storefront puts in <title> when the SEO title is empty. */
export function defaultSeoTitle(title: string, brand: string): string {
  return title.trim() ? `${title.trim()} | ${brand}` : '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ListBlocker = 'title' | 'body' | 'image';

/** Same rule as the backend's "needs attention" filter. */
export function listBlockers(item: BlogListItem): ListBlocker[] {
  const out: ListBlocker[] = [];
  if (!item.hasTitle) out.push('title');
  if (!item.hasBody) out.push('body');
  if (!item.image) out.push('image');
  return out;
}

export function featuredImageUrl(row: Pick<SeoPageRow, 'schemaJsonld'>): string | null {
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

export function articleMeta(row: Pick<SeoPageRow, 'schemaJsonld'>): {
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

// Blog posts are seo_pages rows with path `blog/<slug>`.
export const BLOG_PATH_PREFIX = 'blog/';

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

// Must match the backend PATH_RE.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
  const { author, datePublished } = articleMeta(row);
  return { image: featuredImageUrl(row), author, datePublished };
}

function isObject(node: unknown): node is Record<string, unknown> {
  return !!node && typeof node === 'object' && !Array.isArray(node);
}

function isArticle(node: unknown): node is Record<string, unknown> {
  return isObject(node) && /article|blogposting/i.test(String(node['@type'] ?? ''));
}

// Keeps nodes/keys the automation wrote; empty values delete the key so the storefront uses its defaults.
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

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Same rate as the storefront's "Min. Lesezeit".
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** Facts the SEO checks need, read from the editor's HTML (browser only: DOMParser). */
export function extractDocFacts(html: string): DocFacts & { text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const firstParagraph =
    Array.from(doc.querySelectorAll('p'))
      .map((p) => (p.textContent ?? '').trim())
      .find(Boolean) ?? '';
  return {
    text,
    words: countWords(text),
    headings: Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
      level: Number(h.tagName.slice(1)),
      text: (h.textContent ?? '').trim(),
    })),
    images: Array.from(doc.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt'),
    })),
    links: Array.from(doc.querySelectorAll('a[href]')).map((a) => ({
      href: a.getAttribute('href') ?? '',
      text: (a.textContent ?? '').trim(),
    })),
    firstParagraph,
  };
}

export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Brands without an entry fall back to the dashboard palette (see `.site-theme-*` in index.css).
const SITE_THEME: Partial<Record<string, string>> = {
  hamburg_teppichreinigung: 'site-theme-hamburg',
};

export function siteThemeClass(companySlug: string): string | null {
  return SITE_THEME[companySlug] ?? null;
}
