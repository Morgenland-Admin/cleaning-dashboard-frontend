import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ImageUp, Loader2, UploadCloud } from 'lucide-react';
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
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { errMessage, seoPagesAdminApi, type SeoPageRow } from '@/lib/api';
import {
  ACCEPTED_IMAGE_LABEL,
  ACCEPTED_IMAGE_TYPES,
  featuredImageUrl,
  formatBytes,
  MAX_IMAGE_BYTES,
  OG_HEIGHT,
  OG_WIDTH,
} from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

export function BlogImageDialog({
  open,
  onOpenChange,
  companySlug,
  post,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  post: SeoPageRow | null;
  onSuccess: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentImage = post ? featuredImageUrl(post) : null;

  // Revoke the last preview object URL on unmount (cleanup only — no setState).
  // Call sites remount via `key`, so per-open reset is handled by a fresh mount.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const uploadMutation = useMutation({
    mutationFn: (f: File) => seoPagesAdminApi.uploadFeaturedImage(companySlug, post!.id, f),
    onSuccess: () => {
      toast.success(t('blog.imageUploaded'));
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => setError(errMessage(err)),
  });

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(candidate.type)) {
      setError(t('blog.imageTypeError'));
      return;
    }
    if (candidate.size > MAX_IMAGE_BYTES) {
      setError(t('blog.imageTooLarge', { max: formatBytes(MAX_IMAGE_BYTES) }));
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(candidate);
    objectUrlRef.current = url;
    setError(null);
    setFile(candidate);
    setPreviewUrl(url);
  }

  const shownImage = previewUrl ?? currentImage;
  const busy = uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('blog.featuredImage')}</DialogTitle>
          <DialogDescription>
            {t('blog.imageRecommendation', {
              w: String(OG_WIDTH),
              h: String(OG_HEIGHT),
              types: ACCEPTED_IMAGE_LABEL,
              max: formatBytes(MAX_IMAGE_BYTES),
            })}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
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
          aria-label={t('blog.uploadImage')}
          className={cn(
            'group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
            'aspect-[1200/630] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted hover:bg-muted/70',
            busy && 'opacity-60',
          )}
        >
          {shownImage ? (
            <>
              <img src={shownImage} alt="" className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/55 py-2 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                <ImageUp className="size-4" aria-hidden="true" />
                {t('blog.replaceImage')}
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <UploadCloud className="size-7" aria-hidden="true" />
              {t('blog.dropHint')}
            </span>
          )}
        </button>

        {file ? (
          <p className="truncate text-xs text-muted-foreground">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!file || busy}
            onClick={() => file && uploadMutation.mutate(file)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImageUp className="size-4" aria-hidden="true" />
            )}
            {busy ? t('blog.uploading') : t('blog.saveImage')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
