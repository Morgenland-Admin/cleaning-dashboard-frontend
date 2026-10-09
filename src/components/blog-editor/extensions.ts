import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import type { Extensions } from '@tiptap/react';

/**
 * The editor's schema is deliberately the backend sanitizer's allowlist
 * (backend/src/lib/sanitize-html.ts) and nothing more: whatever can be typed
 * here survives the save and renders on the storefront unchanged.
 */
export function blogExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      // All six levels so an automated draft's stray <h1>/<h5> survives a
      // round-trip; the toolbar only offers 2–4 (the post title is the H1).
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    // Non-inclusive: typing right after a link must not grow the link (autolink
    // would otherwise make the mark inclusive).
    Link.extend({ inclusive: () => false }).configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['mailto', 'tel'],
      // No default target/rel: the sanitizer adds nofollow to external links
      // and must leave internal ones (the point of SEO internal linking) alone.
      HTMLAttributes: { target: null, rel: null },
    }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: false }),
    // Not resizable: column widths would be written as inline styles, which the
    // sanitizer strips anyway — the storefront sizes tables itself.
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
  ];
}

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Light pretty-print for the HTML tab: one block per line, nothing re-nested. */
export function formatHtml(html: string): string {
  return html
    .replace(
      /(<\/(?:p|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|pre|figure)>|<hr>|<img[^>]*>)(?!\n)/g,
      '$1\n',
    )
    .replace(/(<(?:ul|ol|table|tbody|thead|tr|blockquote)(?:\s[^>]*)?>)(?!\n)/g, '$1\n')
    .trim();
}
