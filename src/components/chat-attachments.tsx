import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Lightbox } from '@/components/attachment-gallery';
import { useLocale } from '@/i18n';
import { uploadsAdminApi, type ChatAttachment } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

// Same cache key and lifetime as AttachmentGallery (backend TTL is 10 min), so a file is signed once.
const signedUrl = (companySlug: CompanySlug, key: string) => ({
  queryKey: ['upload-url', companySlug, key] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    uploadsAdminApi.signDownload(companySlug, key, signal),
  staleTime: 8 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

const nameOf = (a: ChatAttachment) => a.name?.trim() || a.key.split('/').pop() || a.key;

/** Image thumbnails that open the shared lightbox; `limit` trims the tiles, not the lightbox. */
export function ChatImageGrid({
  companySlug,
  images,
  limit,
  className,
  tileClassName,
}: {
  companySlug: CompanySlug;
  images: ChatAttachment[];
  limit?: number;
  className?: string;
  tileClassName?: string;
}) {
  const { t } = useLocale();
  const queries = useQueries({ queries: images.map((a) => signedUrl(companySlug, a.key)) });
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const shown = limit === undefined ? images : images.slice(0, limit);

  return (
    <>
      <ul className={cn('grid gap-1', className)}>
        {shown.map((img, i) => {
          const q = queries[i];
          const url = q?.data?.downloadUrl;
          const name = nameOf(img);
          return (
            <li key={`${i}:${img.key}`} className="min-w-0">
              <button
                type="button"
                disabled={!url}
                onClick={() => setOpen(i)}
                aria-label={
                  q?.isError
                    ? t('attachment.loadFailed', { name })
                    : t('attachment.openImage', { name })
                }
                title={name}
                className={cn(
                  'relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-muted transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-default',
                  tileClassName ?? 'aspect-[4/3]',
                )}
              >
                {q?.isError ? (
                  <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                ) : !url ? (
                  <Loader2
                    className="size-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : broken.has(img.key) ? (
                  <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                    onError={() => setBroken((prev) => new Set(prev).add(img.key))}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null ? (
        <Lightbox
          attachments={images}
          urls={queries.map((q) => q?.data?.downloadUrl)}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** One file as a download row: icon, name, meta line. */
export function ChatFileLink({
  companySlug,
  file,
  meta,
  className,
}: {
  companySlug: CompanySlug;
  file: ChatAttachment;
  meta?: string | null;
  className?: string;
}) {
  const { t } = useLocale();
  const q = useQuery(signedUrl(companySlug, file.key));
  const url = q.data?.downloadUrl;
  const name = nameOf(file);
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{name}</span>
        {meta ? (
          <span className="block truncate text-2xs text-muted-foreground">{meta}</span>
        ) : null}
      </span>
      {q.isError ? (
        <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      ) : url ? (
        <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Loader2
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </>
  );
  const box = cn(
    'flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-1.5 text-left',
    className,
  );
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('chat.openFile', { name })}
      className={cn(
        box,
        'transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {inner}
    </a>
  ) : (
    <div className={box}>
      {inner}
      {q.isError ? <span className="sr-only">{t('attachment.loadFailed', { name })}</span> : null}
    </div>
  );
}
