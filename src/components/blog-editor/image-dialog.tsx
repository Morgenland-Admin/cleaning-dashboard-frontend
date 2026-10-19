import { ImagePlus, Link2, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useT } from '@/i18n';
import { errMessage, uploadPublicImage } from '@/lib/api';
import { ACCEPTED_IMAGE_LABEL, formatBytes, MAX_IMAGE_BYTES } from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import { IMAGE_MIME } from './extensions';

import type { CompanySlug } from '@/contexts/project-context';
import type { Editor } from '@tiptap/react';

type Source = 'upload' | 'url';

/** Inserts or edits an in-article image; a caption turns it into <figure>, "decorative" writes alt="". */
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
  // Seeded on mount; the caller mounts it per open.
  const editingType = editor.isActive('figure')
    ? 'figure'
    : editor.isActive('image')
      ? 'image'
      : null;
  const current = (editingType ? editor.getAttributes(editingType) : {}) as {
    src?: string;
    alt?: string | null;
    caption?: string;
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [source, setSource] = useState<Source>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(current.src ?? null);
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState(current.alt ?? '');
  const [decorative, setDecorative] = useState(editingType !== null && current.alt === '');
  const [caption, setCaption] = useState(current.caption ?? '');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

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
  const hasImage = editingType !== null || (source === 'upload' ? !!file : urlValid);
  const altOk = decorative || alt.trim().length > 0;
  const canSubmit = hasImage && altOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    let src = current.src ?? '';
    if (!editingType) {
      try {
        setProgress(0);
        src =
          source === 'upload'
            ? await uploadPublicImage(companySlug, file!, setProgress)
            : url.trim();
      } catch (err) {
        setError(errMessage(err));
        setProgress(null);
        return;
      }
    }
    const attrs = { src, alt: decorative ? '' : alt.trim() };
    const node = caption.trim()
      ? { type: 'figure', attrs: { ...attrs, caption: caption.trim() } }
      : { type: 'image', attrs };
    const chain = editor.chain().focus();
    if (editingType) chain.deleteSelection();
    chain.insertContent(node).run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingType ? t('blogEditor.imageEditTitle') : t('blogEditor.imageInsertTitle')}
          </DialogTitle>
          <DialogDescription>
            {editingType
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
          {!editingType ? (
            <SegmentedControl<Source>
              label={t('blogEditor.imageSource')}
              value={source}
              onValueChange={(next) => {
                setSource(next);
                setError(null);
              }}
              className="self-start"
              options={[
                {
                  value: 'upload',
                  icon: <UploadCloud aria-hidden="true" />,
                  label: t('blogEditor.imageFromUpload'),
                },
                {
                  value: 'url',
                  icon: <Link2 aria-hidden="true" />,
                  label: t('blogEditor.imageFromUrl'),
                },
              ]}
            />
          ) : null}

          {!editingType && source === 'upload' ? (
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
                    ? 'border-primary bg-primary-soft'
                    : 'border-border-strong bg-muted hover:bg-accent/60',
                )}
              >
                {preview ? (
                  <img src={preview} alt="" className="size-full object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-2 px-4 text-center text-2sm text-muted-foreground">
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

          {!editingType && source === 'url' ? (
            <FormField
              label={t('blogEditor.imageUrl')}
              htmlFor="img-url"
              error={url && !urlValid ? t('blogEditor.imageUrlInvalid') : null}
            >
              <Input
                id="img-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
            </FormField>
          ) : null}

          {editingType && preview ? (
            <img
              src={preview}
              alt=""
              className="max-h-56 w-full rounded-md border border-border bg-muted object-contain"
            />
          ) : null}

          <FormField
            label={t('blogEditor.imageAlt')}
            htmlFor="img-alt"
            hint={decorative ? t('blogEditor.imageDecorativeHint') : t('blogEditor.imageAltHint')}
            required={!decorative}
          >
            <Input
              id="img-alt"
              value={decorative ? '' : alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder={t('blogEditor.imageAltPlaceholder')}
              maxLength={300}
              disabled={decorative}
            />
          </FormField>
          <div className="-mt-2 flex items-center gap-2">
            <Checkbox
              id="img-decorative"
              checked={decorative}
              onChange={(e) => setDecorative(e.target.checked)}
            />
            <Label htmlFor="img-decorative" className="font-normal">
              {t('blogEditor.imageDecorative')}
            </Label>
          </div>
          <FormField
            label={t('blogEditor.imageCaption')}
            htmlFor="img-caption"
            hint={t('blogEditor.imageCaptionHint')}
          >
            <Input
              id="img-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={300}
            />
          </FormField>

          {error ? <Alert tone="destructive">{error}</Alert> : null}
          {progress !== null && source === 'upload' && !editingType ? (
            <div
              role="progressbar"
              aria-label={t('blog.uploading')}
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-fast"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
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
            <Button type="submit" disabled={!canSubmit} loading={busy}>
              <ImagePlus aria-hidden="true" />
              {busy
                ? t('blog.uploading')
                : editingType
                  ? t('common.save')
                  : t('blogEditor.imageInsert')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
