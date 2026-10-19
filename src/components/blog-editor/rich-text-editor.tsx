import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { AlertTriangle, ExternalLink, Pencil, Trash2, Unlink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { EditorToolbar } from './toolbar';

import type { CompanySlug } from '@/contexts/project-context';
import type { EditorView } from '@tiptap/pm/view';

type Mode = 'visual' | 'html';

/** `onBaseline` fires once with the editor's normalised initial HTML, so "unsaved" means a real edit. */
export function RichTextEditor({
  companySlug,
  initialHtml,
  readOnly,
  onChange,
  onBaseline,
  onReady,
  stickyTop,
  status,
}: {
  companySlug: CompanySlug;
  initialHtml: string;
  readOnly: boolean;
  onChange: (html: string) => void;
  onBaseline: (html: string) => void;
  onReady?: (editor: Editor) => void;
  stickyTop: string;
  /** Right side of the toolbar (word count). */
  status?: ReactNode;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('visual');
  const [htmlDraft, setHtmlDraft] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  const uploadAndInsert = useCallback(
    async (files: File[], pos: number | null) => {
      const images = files.filter((f) => IMAGE_MIME.includes(f.type));
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
          // No alt attribute yet (not alt=""), so the checks flag it until the author describes it.
          ed.chain().focus().insertContentAt(at, { type: 'image', attrs: { src } }).run();
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
    // No re-render per transaction; toolbar state comes from useEditorState.
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        id: 'post-content',
        class: 'blog-editor-content blog-editor-workspace',
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

  // Not in onCreate: that fires during the first render, before the parent form has mounted.
  const baselineSent = useRef(false);
  useEffect(() => {
    if (!editor || baselineSent.current) return;
    baselineSent.current = true;
    editorRef.current = editor;
    onBaseline(editor.getHTML());
    onReady?.(editor);
  }, [editor, onBaseline, onReady]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  function toggleHtml() {
    if (!editor) return;
    if (mode === 'visual') {
      setHtmlDraft(formatHtml(editor.getHTML()));
      setMode('html');
    } else {
      // onUpdate re-emits the schema-normalised HTML, which is what gets saved from here on.
      editor.commands.setContent(htmlDraft, { emitUpdate: true });
      setMode('visual');
    }
  }

  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col">
        {readOnly ? null : (
          <div
            className={cn(
              'sticky z-10 -mx-2 mb-2 rounded-lg border border-border bg-card/95 text-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:-mx-3',
              stickyTop,
            )}
          >
            <div className="flex items-center gap-2 px-1.5 py-1">
              <div className="scroll-fade-x scrollbar-none min-w-0 flex-1 overflow-x-auto">
                <EditorToolbar
                  editor={editor}
                  disabled={readOnly}
                  htmlMode={mode === 'html'}
                  onLink={() => setLinkOpen(true)}
                  onImage={() => setImageOpen(true)}
                  onToggleHtml={toggleHtml}
                />
              </div>
              {uploading > 0 ? (
                <span role="status" className="shrink-0 text-xs font-medium text-foreground">
                  {t('blog.uploading')}
                </span>
              ) : status ? (
                <span className="hidden shrink-0 pr-2 text-xs tabular-nums text-muted-foreground md:inline">
                  {status}
                </span>
              ) : null}
            </div>
            {mode === 'visual' ? <TableToolbar editor={editor} disabled={readOnly} /> : null}
          </div>
        )}

        {mode === 'visual' ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="flex flex-col gap-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t('blogEditor.htmlHint')}
              </span>
              <Button type="button" variant="outline" size="xs" onClick={toggleHtml}>
                {t('blogEditor.backToVisual')}
              </Button>
            </div>
            <Textarea
              value={htmlDraft}
              onChange={(e) => {
                setHtmlDraft(e.target.value);
                onChange(e.target.value);
              }}
              readOnly={readOnly}
              spellCheck={false}
              aria-label={t('blogEditor.editHtml')}
              className="min-h-[32rem] resize-y bg-card p-3 font-mono leading-relaxed text-foreground sm:text-2sm"
            />
          </div>
        )}
      </div>

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
        shouldShow={({ editor: ed }) =>
          mode === 'visual' && ed.isEditable && (ed.isActive('image') || ed.isActive('figure'))
        }
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
  'flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-1 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md';
const BUBBLE_DANGER = 'text-destructive hover:bg-destructive-soft hover:text-destructive';

function LinkBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const t = useT();
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
        className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-2sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{href}</span>
      </a>
      {external ? <Badge variant="secondary">nofollow</Badge> : null}
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
      <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        {t('common.edit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={BUBBLE_DANGER}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        aria-label={t('blogEditor.linkRemove')}
      >
        <Unlink aria-hidden="true" />
      </Button>
    </div>
  );
}

function ImageBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const t = useT();
  const alt = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const attrs = (
        e.isActive('figure') ? e.getAttributes('figure') : e.getAttributes('image')
      ) as {
        alt?: string | null;
      };
      return attrs.alt ?? null;
    },
  });
  return (
    <div className={BUBBLE}>
      {alt === null ? (
        <span className="flex items-center gap-1 px-2 text-xs font-medium text-warning">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {t('blogEditor.altMissing')}
        </span>
      ) : null}
      <Button type="button" variant="ghost" size="xs" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        {t('blogEditor.imageEditAction')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={BUBBLE_DANGER}
        onClick={() => editor.chain().focus().deleteSelection().run()}
        aria-label={t('blogEditor.imageRemove')}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
