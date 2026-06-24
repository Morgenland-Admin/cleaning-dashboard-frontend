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
