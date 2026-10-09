import { AlertCircle, ImagePlus, Link2, Loader2, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { errMessage, uploadPublicImage } from '@/lib/api';
import { ACCEPTED_IMAGE_LABEL, formatBytes, MAX_IMAGE_BYTES } from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import { IMAGE_MIME } from './extensions';

import type { CompanySlug } from '@/contexts/project-context';
import type { Editor } from '@tiptap/react';

type Source = 'upload' | 'url';

/**
 * Insert an image into the article, or edit the selected one's alt text. Alt
 * text is required: it is what Google and screen readers see of the image.
 */
export function ImageDialog({
  editor,
  companySlug,
  open,
  onOpenChange,
}: {
  editor: Editor;
  companySlug: CompanySlug;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  // Seeded on mount; the caller remounts per open via `key`.
  const editing = editor.isActive('image');
  const current = editor.getAttributes('image') as { src?: string; alt?: string; title?: string };

  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [source, setSource] = useState<Source>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editing ? (current.src ?? null) : null);
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState(editing ? (current.alt ?? '') : '');
  const [title, setTitle] = useState(editing ? (current.title ?? '') : '');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!IMAGE_MIME.includes(candidate.type)) {
      setError(t('blog.imageTypeError'));
      return;
    }
    if (candidate.size > MAX_IMAGE_BYTES) {
      setError(t('blog.imageTooLarge', { max: formatBytes(MAX_IMAGE_BYTES) }));
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(candidate);
    setPreview(objectUrlRef.current);
    setFile(candidate);
    setError(null);
  }

  const urlValid = /^https:\/\/\S+$/i.test(url.trim());
  const hasImage = editing || (source === 'upload' ? !!file : urlValid);
  const canSubmit = hasImage && alt.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    const attrs = { alt: alt.trim(), title: title.trim() || null };
    if (editing) {
      editor.chain().focus().updateAttributes('image', attrs).run();
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const src = source === 'upload' ? await uploadPublicImage(companySlug, file!) : url.trim();
      editor
        .chain()
        .focus()
        .setImage({ src, alt: attrs.alt, title: attrs.title ?? undefined })
        .run();
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? t('blogEditor.imageEditTitle') : t('blogEditor.imageInsertTitle')}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t('blogEditor.imageEditHint')
              : t('blogEditor.imageInsertHint', {
                  types: ACCEPTED_IMAGE_LABEL,
                  max: formatBytes(MAX_IMAGE_BYTES),
                })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!editing ? (
            <div
              role="tablist"
              aria-label={t('blogEditor.imageSource')}
              className="inline-flex self-start rounded-lg border border-border bg-muted/60 p-0.5"
            >
              {(['upload', 'url'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={source === s}
                  onClick={() => {
                    setSource(s);
                    setError(null);
                  }}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-2sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    source === s
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'upload' ? (
                    <UploadCloud className="size-4" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-4" aria-hidden="true" />
                  )}
                  {s === 'upload' ? t('blogEditor.imageFromUpload') : t('blogEditor.imageFromUrl')}
                </button>
              ))}
            </div>
          ) : null}

          {!editing && source === 'upload' ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={IMAGE_MIME.join(',')}
                className="hidden"
                onChange={(e) => {
                  accept(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  accept(e.dataTransfer.files?.[0]);
                }}
                disabled={busy}
                className={cn(
                  'relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  dragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted hover:bg-muted/70',
                )}
              >
                {preview ? (
                  <img src={preview} alt="" className="size-full object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
                    <UploadCloud className="size-7" aria-hidden="true" />
                    {t('blog.dropHint')}
                  </span>
                )}
              </button>
              {file ? (
                <p className="-mt-2 truncate text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : null}
            </>
          ) : null}

          {!editing && source === 'url' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="img-url">{t('blogEditor.imageUrl')}</Label>
              <Input
                id="img-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
              {url && !urlValid ? (
                <p className="text-xs text-destructive">{t('blogEditor.imageUrlInvalid')}</p>
              ) : null}
            </div>
          ) : null}

          {editing && preview ? (
            <img
              src={preview}
              alt=""
              className="max-h-56 w-full rounded-lg border border-border bg-muted object-contain"
            />
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="img-alt">
              {t('blogEditor.imageAlt')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              id="img-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder={t('blogEditor.imageAltPlaceholder')}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">{t('blogEditor.imageAltHint')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="img-title">{t('blogEditor.imageTitle')}</Label>
            <Input
              id="img-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
              {busy
                ? t('blog.uploading')
                : editing
                  ? t('common.save')
                  : t('blogEditor.imageInsert')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
