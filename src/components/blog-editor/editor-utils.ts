/** `www.x.de` → `https://www.x.de`; site-relative, anchors, mail and tel stay as typed. */
export function normalizeHref(raw: string): string {
  const href = raw.trim();
  if (!href) return '';
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(href)) return href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}

/** Only schemes the backend sanitizer keeps; anything else would be stripped on save. */
export function isAllowedHref(href: string): boolean {
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s/()-]+|\/[^\s]*|#[^\s]*)$/i.test(href);
}

export interface FaqDraft {
  key: string;
  question: string;
  answer: string;
}

let faqSeq = 0;
export function newFaqKey(): string {
  faqSeq += 1;
  return `faq-${faqSeq}`;
}
