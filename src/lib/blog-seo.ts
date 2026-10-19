// Editorial + technical checks for a blog post. Pure (no imports) so `node --test` can run it directly.
// Only `error` blocks publishing; warnings and suggestions are advice, never ranking promises.

export type IssueLevel = 'error' | 'warning' | 'suggestion';

export type FieldTarget =
  | 'title'
  | 'slug'
  | 'content'
  | 'featuredImage'
  | 'featuredImageAlt'
  | 'metaTitle'
  | 'metaDescription'
  | 'canonical'
  | 'indexing'
  | 'focusKeyphrase'
  | 'outline';

export type IssueId =
  | 'titleMissing'
  | 'contentMissing'
  | 'imageMissing'
  | 'slugInvalid'
  | 'slugTaken'
  | 'canonicalInvalid'
  | 'bodyH1'
  | 'headingSkip'
  | 'imagesNoAlt'
  | 'imageAltMissing'
  | 'metaDescriptionMissing'
  | 'noindex'
  | 'canonicalElsewhere'
  | 'vagueLinkText'
  | 'insecureLink'
  | 'noInternalLinks'
  | 'noSubheadings'
  | 'metaTitleLong'
  | 'metaTitleShort'
  | 'metaDescriptionLength'
  | 'shortContent'
  | 'keyphraseTitle'
  | 'keyphraseDescription'
  | 'keyphraseIntro';

export type FixAction = 'demoteH1' | 'generateDescription';

export interface SeoIssue {
  id: IssueId;
  level: IssueLevel;
  target: FieldTarget;
  params?: Record<string, string | number>;
  fix?: FixAction;
}

export interface DocFacts {
  words: number;
  headings: Array<{ level: number; text: string }>;
  images: Array<{ src: string; alt: string | null }>;
  links: Array<{ href: string; text: string }>;
  firstParagraph: string;
}

export interface PostDraft {
  title: string;
  slug: string;
  slugStatus: 'ok' | 'invalid' | 'taken' | 'unknown';
  doc: DocFacts;
  /** As rendered: the SEO title field, or the default built from the post title. */
  seoTitle: string;
  /** The meta description field only (no excerpt fallback). */
  metaDescription: string;
  featuredImage: string | null;
  featuredImageAlt: string;
  canonicalUrl: string;
  noindex: boolean;
  focusKeyphrase: string;
  /** The post's own public URL, to tell a self-canonical from a cross-domain one. */
  ownUrl: string | null;
  siteHost: string | null;
}

// Soft display guidance only: Google sets no fixed limit and truncates by pixel width.
export const SEO_TITLE_RANGE = { min: 30, max: 60 };
export const META_DESCRIPTION_RANGE = { min: 70, max: 160 };
export const SHORT_POST_WORDS = 300;

const VAGUE_LINK_TEXT = new Set([
  'hier',
  'hier klicken',
  'klicken sie hier',
  'mehr',
  'mehr erfahren',
  'weiterlesen',
  'link',
  'here',
  'click here',
  'read more',
  'more',
]);

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function contains(haystack: string, needle: string): boolean {
  const n = normalize(needle);
  return n.length > 0 && normalize(haystack).includes(n);
}

export function isInternalHref(href: string, siteHost: string | null): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  if (!siteHost) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    return host === siteHost.replace(/^www\./, '');
  } catch {
    return false;
  }
}

export function headingSkips(
  headings: DocFacts['headings'],
): Array<{ from: number; to: number; text: string }> {
  const skips: Array<{ from: number; to: number; text: string }> = [];
  // The post title is the page's H1, so the body starts one level below it.
  let previous = 1;
  for (const h of headings) {
    if (h.level > previous + 1) skips.push({ from: previous, to: h.level, text: h.text });
    previous = h.level;
  }
  return skips;
}

export function analyzePost(post: PostDraft): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (issue: SeoIssue) => issues.push(issue);
  const { doc } = post;

  if (!post.title.trim()) add({ id: 'titleMissing', level: 'error', target: 'title' });
  if (doc.words === 0) add({ id: 'contentMissing', level: 'error', target: 'content' });
  if (!post.featuredImage) add({ id: 'imageMissing', level: 'error', target: 'featuredImage' });
  if (post.slugStatus === 'invalid') add({ id: 'slugInvalid', level: 'error', target: 'slug' });
  if (post.slugStatus === 'taken') add({ id: 'slugTaken', level: 'error', target: 'slug' });

  const canonical = post.canonicalUrl.trim();
  if (canonical && !isHttpUrl(canonical)) {
    add({ id: 'canonicalInvalid', level: 'error', target: 'canonical' });
  } else if (
    canonical &&
    post.ownUrl &&
    canonical.replace(/\/$/, '') !== post.ownUrl.replace(/\/$/, '')
  ) {
    add({ id: 'canonicalElsewhere', level: 'warning', target: 'canonical' });
  }

  const h1s = doc.headings.filter((h) => h.level === 1).length;
  if (h1s > 0)
    add({ id: 'bodyH1', level: 'warning', target: 'content', params: { n: h1s }, fix: 'demoteH1' });
  const skip = headingSkips(doc.headings.filter((h) => h.level > 1))[0];
  if (skip) {
    add({
      id: 'headingSkip',
      level: 'warning',
      target: 'outline',
      params: { from: skip.from, to: skip.to, text: skip.text },
    });
  }

  const noAlt = doc.images.filter((i) => i.alt === null).length;
  if (noAlt > 0)
    add({ id: 'imagesNoAlt', level: 'warning', target: 'content', params: { n: noAlt } });
  if (post.featuredImage && !post.featuredImageAlt.trim()) {
    add({ id: 'imageAltMissing', level: 'warning', target: 'featuredImageAlt' });
  }

  const description = post.metaDescription.trim();
  if (!description && doc.words > 0) {
    add({
      id: 'metaDescriptionMissing',
      level: 'warning',
      target: 'metaDescription',
      fix: 'generateDescription',
    });
  }
  if (post.noindex) add({ id: 'noindex', level: 'warning', target: 'indexing' });

  const vague = doc.links.find((l) => VAGUE_LINK_TEXT.has(normalize(l.text)));
  if (vague)
    add({
      id: 'vagueLinkText',
      level: 'warning',
      target: 'content',
      params: { text: vague.text.trim() },
    });
  const insecure = doc.links.filter((l) => /^http:\/\//i.test(l.href)).length;
  if (insecure > 0)
    add({ id: 'insecureLink', level: 'warning', target: 'content', params: { n: insecure } });

  if (doc.words > 0 && !doc.links.some((l) => isInternalHref(l.href, post.siteHost))) {
    add({ id: 'noInternalLinks', level: 'suggestion', target: 'content' });
  }
  if (doc.words >= SHORT_POST_WORDS && !doc.headings.some((h) => h.level === 2)) {
    add({ id: 'noSubheadings', level: 'suggestion', target: 'content' });
  }
  const titleLength = post.seoTitle.trim().length;
  if (titleLength > SEO_TITLE_RANGE.max) {
    add({
      id: 'metaTitleLong',
      level: 'suggestion',
      target: 'metaTitle',
      params: { n: titleLength },
    });
  } else if (post.title.trim() && titleLength < SEO_TITLE_RANGE.min) {
    add({
      id: 'metaTitleShort',
      level: 'suggestion',
      target: 'metaTitle',
      params: { n: titleLength },
    });
  }
  if (
    description &&
    (description.length < META_DESCRIPTION_RANGE.min ||
      description.length > META_DESCRIPTION_RANGE.max)
  ) {
    add({
      id: 'metaDescriptionLength',
      level: 'suggestion',
      target: 'metaDescription',
      params: { n: description.length },
    });
  }
  if (doc.words > 0 && doc.words < SHORT_POST_WORDS) {
    add({ id: 'shortContent', level: 'suggestion', target: 'content', params: { n: doc.words } });
  }

  const keyphrase = post.focusKeyphrase.trim();
  if (keyphrase) {
    if (!contains(post.seoTitle, keyphrase) && !contains(post.title, keyphrase)) {
      add({ id: 'keyphraseTitle', level: 'suggestion', target: 'metaTitle' });
    }
    if (description && !contains(description, keyphrase)) {
      add({ id: 'keyphraseDescription', level: 'suggestion', target: 'metaDescription' });
    }
    if (doc.firstParagraph && !contains(doc.firstParagraph, keyphrase)) {
      add({ id: 'keyphraseIntro', level: 'suggestion', target: 'content' });
    }
  }

  return issues;
}

/** A first meta-description draft from the opening text, cut at a sentence or word boundary. */
export function suggestDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd >= 70) return cut.slice(0, sentenceEnd + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : max).replace(/[,;:–-]+$/, '')} …`;
}
