import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlertTriangle,
  Code,
  ExternalLink,
  ImagePlus,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { errMessage, uploadPublicImage } from '@/lib/api';
import { formatBytes, MAX_IMAGE_BYTES } from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import { blogExtensions, formatHtml, IMAGE_MIME } from './extensions';
import { ImageDialog } from './image-dialog';
import { LinkDialog } from './link-dialog';
import { TableToolbar } from './table-toolbar';
import { EditorToolbar, ToolButton } from './toolbar';

import type { CompanySlug } from '@/contexts/project-context';
import type { EditorView } from '@tiptap/pm/view';

type Mode = 'visual' | 'html';

export interface EditorStats {
  words: number;
  characters: number;
}

/**
 * WYSIWYG article editor (Tiptap) with an HTML tab. Emits HTML on every change;
 * `onBaseline` fires once with the editor's normalised version of the initial
 * content, so "unsaved changes" means a real edit, not a re-serialisation.
 */
export function RichTextEditor({
  companySlug,
  initialHtml,
  readOnly,
  onChange,
  onBaseline,
  footer,
  stickyTop,
  themeClass,
}: {
  companySlug: CompanySlug;
  initialHtml: string;
  readOnly: boolean;
  onChange: (html: string) => void;
  onBaseline: (html: string) => void;
  footer?: React.ReactNode;
  /** Tailwind `top-*` class for the sticky toolbar (below the page's own sticky bar). */
  stickyTop: string;
  /** `.site-theme-*` class: render the canvas in that storefront's look. */
  themeClass?: string | null;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('visual');
  const [htmlDraft, setHtmlDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  const uploadAndInsert = useCallback(
    async (files: File[], pos: number | null) => {
      const images = files.filter((f) => IMAGE_MIME.includes(f.type));
      if (images.length === 0) return;
      for (const file of images) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(t('blog.imageTooLarge', { max: formatBytes(MAX_IMAGE_BYTES) }));
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const src = await uploadPublicImage(companySlug, file);
          const ed = editorRef.current;
          if (!ed || ed.isDestroyed) return;
          const at = Math.min(pos ?? ed.state.selection.to, ed.state.doc.content.size);
          ed.chain()
            .focus()
            .insertContentAt(at, { type: 'image', attrs: { src, alt: '' } })
            .run();
          toast.success(t('blogEditor.imageAddAlt'));
        } catch (err) {
          toast.error(errMessage(err));
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [companySlug, t],
  );

  const editor = useEditor({
    extensions: blogExtensions(t('blogEditor.placeholder')),
    content: initialHtml,
    editable: !readOnly,
    // Toolbar state comes from useEditorState; skip a full re-render per keystroke.
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: 'blog-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': t('blogEditor.contentLabel'),
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
      handleDrop: (view: EditorView, event: DragEvent, _slice, moved: boolean) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (moved || !files.some((f) => IMAGE_MIME.includes(f.type))) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void uploadAndInsert(files, at?.pos ?? null);
        return true;
      },
      handlePaste: (_view, event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => IMAGE_MIME.includes(f.type))) return false;
        event.preventDefault();
        void uploadAndInsert(files, null);
        return true;
      },
    },
  });

  // Baseline once the editor exists. Not in Tiptap's onCreate: that fires during
  // the first render, i.e. before the parent form has mounted.
  const baselineSent = useRef(false);
  useEffect(() => {
    if (!editor || baselineSent.current) return;
    baselineSent.current = true;
    editorRef.current = editor;
    onBaseline(editor.getHTML());
  }, [editor, onBaseline]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Fullscreen: Esc leaves, and the page behind must not scroll.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !linkOpen && !imageOpen) setFullscreen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, linkOpen, imageOpen]);

  function switchMode(next: Mode) {
    if (!editor || next === mode) return;
    if (next === 'html') {
      setHtmlDraft(formatHtml(editor.getHTML()));
    } else {
      // Parse the hand-edited HTML back into the schema; onUpdate re-emits the
      // normalised result, which is what gets saved from here on.
      editor.commands.setContent(htmlDraft, { emitUpdate: true });
    }
    setMode(next);
  }

  if (!editor) return null;

  const toolbarDisabled = readOnly || mode === 'html';

  return (
    <TooltipProvider delayDuration={300}>
      <section
        aria-label={t('blogEditor.contentLabel')}
        className={cn(
          'flex flex-col rounded-xl border border-border bg-card shadow-sm',
          fullscreen && 'fixed inset-0 z-50 rounded-none border-0',
        )}
      >
        <div
          className={cn(
            'z-10 rounded-t-xl border-b border-border bg-card/95 backdrop-blur',
            fullscreen ? 'sticky top-0 rounded-none' : `sticky ${stickyTop}`,
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImageOpen(true)}
              disabled={toolbarDisabled}
            >
              <ImagePlus aria-hidden="true" />
              {t('blogEditor.addMedia')}
            </Button>
            <div className="flex items-center gap-1">
              <div
                role="tablist"
                aria-label={t('blogEditor.modeLabel')}
                className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5"
              >
                {(['visual', 'html'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-2sm font-medium transition-colors sm:h-7',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      mode === m
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'html' ? <Code className="size-3.5" aria-hidden="true" /> : null}
                    {m === 'visual' ? t('blogEditor.modeVisual') : t('blogEditor.modeHtml')}
                  </button>
                ))}
              </div>
              <ToolButton
                icon={fullscreen ? Minimize2 : Maximize2}
                label={fullscreen ? t('blogEditor.exitFullscreen') : t('blogEditor.fullscreen')}
                shortcut={fullscreen ? 'Esc' : undefined}
                active={fullscreen}
                onClick={() => setFullscreen((f) => !f)}
              />
            </div>
          </div>
          <EditorToolbar
            editor={editor}
            disabled={toolbarDisabled}
            onLink={() => setLinkOpen(true)}
            onImage={() => setImageOpen(true)}
          />
          {mode === 'visual' ? <TableToolbar editor={editor} disabled={readOnly} /> : null}
        </div>

        <div
          className={cn(
            'flex-1',
            fullscreen && 'overflow-y-auto',
            mode === 'visual' && ['blog-canvas', themeClass],
          )}
        >
          <div className={cn(fullscreen && 'mx-auto max-w-3xl')}>
            {mode === 'visual' ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="flex flex-col gap-2 p-4">
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t('blogEditor.htmlHint')}
                </p>
                <textarea
                  value={htmlDraft}
                  onChange={(e) => {
                    setHtmlDraft(e.target.value);
                    onChange(e.target.value);
                  }}
                  readOnly={readOnly}
                  spellCheck={false}
                  aria-label={t('blogEditor.modeHtml')}
                  className="min-h-[32rem] w-full resize-y rounded-lg border border-input bg-muted/30 p-3 font-mono text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-b-xl border-t border-border/70 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {footer}
          {uploading > 0 ? (
            <span className="ml-auto animate-pulse font-medium text-foreground">
              {t('blog.uploading')}
            </span>
          ) : null}
        </div>
      </section>

      <BubbleMenu
        editor={editor}
        pluginKey="linkBubble"
        shouldShow={({ editor: ed }) => mode === 'visual' && ed.isEditable && ed.isActive('link')}
        options={{ placement: 'bottom-start', offset: 8 }}
      >
        <LinkBubble editor={editor} onEdit={() => setLinkOpen(true)} />
      </BubbleMenu>
      <BubbleMenu
        editor={editor}
        pluginKey="imageBubble"
        shouldShow={({ editor: ed }) => mode === 'visual' && ed.isEditable && ed.isActive('image')}
        options={{ placement: 'top', offset: 8 }}
      >
        <ImageBubble editor={editor} onEdit={() => setImageOpen(true)} />
      </BubbleMenu>

      {linkOpen ? <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} /> : null}
      {imageOpen ? (
        <ImageDialog
          editor={editor}
          companySlug={companySlug}
          open={imageOpen}
          onOpenChange={setImageOpen}
        />
      ) : null}
    </TooltipProvider>
  );
}

const BUBBLE =
  'flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg';
const BUBBLE_BTN =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-2sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function LinkBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const t = useT();
  // The editor skips React re-renders per transaction, so subscribe explicitly.
  const href = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.getAttributes('link') as { href?: string }).href ?? '',
  });
  const external = /^https?:\/\//i.test(href);
  return (
    <div className={BUBBLE}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-2sm text-primary hover:underline"
      >
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{href}</span>
      </a>
      {external ? (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-3xs font-medium uppercase text-muted-foreground">
          nofollow
        </span>
      ) : null}
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
      <button type="button" className={BUBBLE_BTN} onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden="true" />
        {t('common.edit')}
      </button>
      <button
        type="button"
        className={cn(BUBBLE_BTN, 'text-destructive hover:bg-destructive/10')}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        aria-label={t('blogEditor.linkRemove')}
      >
        <Unlink className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function ImageBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const t = useT();
  const alt = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.getAttributes('image') as { alt?: string | null }).alt ?? '',
  });
  return (
    <div className={BUBBLE}>
      {!alt ? (
        <span className="flex items-center gap-1 px-2 text-2sm font-medium text-warning">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {t('blogEditor.altMissing')}
        </span>
      ) : null}
      <button type="button" className={BUBBLE_BTN} onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden="true" />
        {t('blogEditor.imageAlt')}
      </button>
      <button
        type="button"
        className={cn(BUBBLE_BTN, 'text-destructive hover:bg-destructive/10')}
        onClick={() => editor.chain().focus().deleteSelection().run()}
        aria-label={t('blogEditor.imageRemove')}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
