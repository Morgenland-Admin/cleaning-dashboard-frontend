import { AlertTriangle, ImageUp, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { errMessage, uploadPublicImage } from '@/lib/api';
import {
  ACCEPTED_IMAGE_LABEL,
  ACCEPTED_IMAGE_TYPES,
  formatBytes,
  MAX_IMAGE_BYTES,
  MIN_IMAGE_WIDTH,
  RECOMMENDED_IMAGE,
} from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

/** One upload surface for every blog image slot (featured, social): validate → upload → preview. */
export function ImageField({
  id,
  companySlug,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  emptyLabel,
}: {
  id: string;
  companySlug: CompanySlug;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  emptyLabel?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smallWidth, setSmallWidth] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = progress !== null;

  async function accept(file: File | undefined) {
    if (!file || disabled || busy) return;
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError(t('blog.imageTypeError'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('blog.imageTooLarge', { max: formatBytes(MAX_IMAGE_BYTES) }));
      return;
    }
    setProgress(0);
    try {
      onChange(await uploadPublicImage(companySlug, file, setProgress));
      setSmallWidth(null);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setProgress(null);
    }
  }

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const pick = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-md border transition-colors',
          value ? 'border-border bg-muted' : 'border-2 border-dashed border-border-strong bg-muted',
          invalid && !value && 'border-destructive/60',
          dragging && 'border-primary bg-primary-soft',
        )}
      >
        {value ? (
          <img
            src={value}
            alt=""
            className="size-full object-cover"
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              setSmallWidth(w > 0 && w < MIN_IMAGE_WIDTH ? w : null);
            }}
          />
        ) : (
          <button
            id={id}
            type="button"
            onClick={pick}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void accept(e.dataTransfer.files?.[0]);
            }}
            disabled={disabled || busy}
            aria-describedby={[hintId, error ? errorId : null, describedBy]
              .filter(Boolean)
              .join(' ')}
            className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-2sm text-muted-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <UploadCloud className="size-6" aria-hidden="true" />
            <span className="font-medium text-foreground">
              {emptyLabel ?? t('blog.uploadImage')}
            </span>
            <span>{t('blog.dropHint')}</span>
          </button>
        )}
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/85 px-6">
            <span className="text-2sm font-medium tabular-nums">
              {t('blog.uploadingPercent', { n: Math.round((progress ?? 0) * 100) })}
            </span>
            <div
              role="progressbar"
              aria-label={t('blog.uploading')}
              aria-valuenow={Math.round((progress ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-fast"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {value && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            id={id}
            type="button"
            variant="outline"
            size="xs"
            onClick={pick}
            disabled={busy}
            aria-describedby={describedBy}
          >
            <ImageUp aria-hidden="true" />
            {t('blog.replaceImage')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
          >
            <Trash2 aria-hidden="true" />
            {t('blogEditor.removeImage')}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {smallWidth ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t('blogEditor.imageSmall', { w: smallWidth, min: MIN_IMAGE_WIDTH })}
        </p>
      ) : null}
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('blogEditor.imageGuidance', {
          w: RECOMMENDED_IMAGE.width,
          h: RECOMMENDED_IMAGE.height,
          types: ACCEPTED_IMAGE_LABEL,
          max: formatBytes(MAX_IMAGE_BYTES),
        })}
      </p>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('blogEditor.removeImageTitle')}
        description={t('blogEditor.removeImageBody')}
        confirmLabel={t('blogEditor.removeImage')}
        cancelLabel={t('common.cancel')}
        isDangerous
        onConfirm={() => {
          onChange(null);
          setSmallWidth(null);
          setConfirmRemove(false);
        }}
      />
    </div>
  );
}
