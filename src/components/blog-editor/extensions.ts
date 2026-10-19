import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { Node, type Editor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/** `<figure><img><figcaption>` — an image with a caption, edited through the image dialog. */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      caption: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (el) => {
          const img = el.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            caption: el.querySelector('figcaption')?.textContent?.trim() ?? '',
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const { src, alt, caption } = node.attrs as {
      src: string;
      alt: string | null;
      caption: string;
    };
    const img = ['img', alt === null ? { src } : { src, alt }] as const;
    return caption ? ['figure', {}, img, ['figcaption', {}, caption]] : ['figure', {}, img];
  },
});

/** Schema = the backend sanitizer allowlist (backend/src/lib/sanitize-html.ts); anything more would be stripped on save. */
export function blogExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      // All six levels so an automated draft's <h1>/<h5> survives; the toolbar offers 2–4 (the title is the H1).
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    // Non-inclusive: autolink would otherwise make the mark inclusive, so typing after a link would extend it.
    Link.extend({ inclusive: () => false }).configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['mailto', 'tel'],
      // No default target/rel: the sanitizer adds nofollow to external links and leaves internal ones alone.
      HTMLAttributes: { target: null, rel: null },
    }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: false }),
    Figure,
    // Not resizable: widths would become inline styles, which the sanitizer strips.
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
  ];
}

export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export interface OutlineItem {
  level: number;
  text: string;
  pos: number;
}

export function readOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({ level: node.attrs.level as number, text: node.textContent.trim(), pos });
      return false;
    }
    return node.isBlock;
  });
  return items;
}

export function scrollToHeading(editor: Editor, pos: number) {
  editor
    .chain()
    .focus()
    .setTextSelection(pos + 1)
    .run();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** The post title is the page's only H1; body H1s (e.g. from automated drafts) become H2. */
export function demoteBodyH1(editor: Editor) {
  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level === 1) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: 2 });
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function formatHtml(html: string): string {
  return html
    .replace(
      /(<\/(?:p|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|pre|figure)>|<hr>|<img[^>]*>)(?!\n)/g,
      '$1\n',
    )
    .replace(/(<(?:ul|ol|table|tbody|thead|tr|blockquote|figure)(?:\s[^>]*)?>)(?!\n)/g, '$1\n')
    .trim();
}
