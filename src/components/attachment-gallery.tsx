import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueries } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useT } from '@/i18n';
import { uploadsAdminApi } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

type Attachment = {
  key: string;
  name: string;
  size: number;
  contentType?: string;
};

interface Props {
  companySlug: CompanySlug;
  attachments: Attachment[];
  className?: string;
}

function isImageAttachment(att: Attachment): boolean {
  return (
    att.contentType?.startsWith('image/') ??
    /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(att.name || att.key)
  );
}

/** Imported rows can lack a file name; the key's last segment stands in. */
function nameOf(att: Attachment): string {
  return att.name?.trim() || att.key.split('/').pop() || att.key;
}

function extensionOf(att: Attachment): string | null {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nameOf(att));
  return m ? m[1]!.toUpperCase() : null;
}

// Cache URL ~8min (backend TTL is 10min).
export function AttachmentGallery({ companySlug, attachments, className }: Props) {
  const t = useT();
  const queries = useQueries({
    queries: attachments.map((att) => ({
      queryKey: ['upload-url', companySlug, att.key] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        uploadsAdminApi.signDownload(companySlug, att.key, signal),
      staleTime: 8 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })),
  });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Signed URLs can point at files that are gone; those fall back to the file tile.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <>
      <ul className={className ?? 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
        {attachments.map((att, i) => {
          const q = queries[i];
          const url = q?.data?.downloadUrl;
          const isImage = isImageAttachment(att);
          const isClickable = !!url;
          const name = nameOf(att);
          const ext = extensionOf(att);
          return (
            <li
              key={`${i}:${att.key}`}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && setLightboxIndex(i)}
                className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
                aria-label={
                  q?.isError
                    ? t('attachment.loadFailed', { name })
                    : t('attachment.openImage', { name })
                }
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-muted">
                  {q?.isLoading ? (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : q?.isError ? (
                    <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                  ) : url && isImage && !broken.has(att.key) ? (
                    <img
                      src={url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      onError={() => setBroken((prev) => new Set(prev).add(att.key))}
                    />
                  ) : (
                    <span
                      className="flex flex-col items-center gap-1 text-muted-foreground"
                      aria-hidden="true"
                    >
                      <FileText className="size-6" />
                      {ext ? <span className="text-2xs font-medium">{ext}</span> : null}
                    </span>
                  )}
                </div>
                <div className="truncate border-t border-border px-2 py-1 text-2xs text-foreground">
                  {name}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {lightboxIndex !== null ? (
        <Lightbox
          attachments={attachments}
          urls={queries.map((q) => q?.data?.downloadUrl)}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}

export function Lightbox({
  attachments,
  urls,
  index,
  onIndex,
  onClose,
}: {
  attachments: Attachment[];
  urls: Array<string | undefined>;
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const total = attachments.length;
  const current = attachments[index];
  const url = urls[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' && total > 1) {
        e.preventDefault();
        onIndex((index + 1) % total);
      } else if (e.key === 'ArrowLeft' && total > 1) {
        e.preventDefault();
        onIndex((index - 1 + total) % total);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, onIndex]);

  if (!current) return null;
  const name = nameOf(current);
  const isImage = isImageAttachment(current);

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-label={name}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              {total > 1 ? (
                <p className="text-2xs text-white/60">
                  {index + 1} / {total}
                </p>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="inline-flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* Pointer-only close shortcut; keyboard users have Escape and the Close button,
              so this stays presentational. */}
          <div
            role="presentation"
            className="relative flex flex-1 items-center justify-center px-4 pb-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {total > 1 ? (
              <NavButton side="left" onClick={() => onIndex((index - 1 + total) % total)} />
            ) : null}

            {url && isImage ? (
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            ) : url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                {t('common.openInNewTab')}
              </a>
            ) : (
              <span role="status" className="inline-flex">
                <Loader2 className="size-6 animate-spin text-white/70" aria-hidden="true" />
                <span className="sr-only">{t('common.loading')}</span>
              </span>
            )}

            {total > 1 ? (
              <NavButton side="right" onClick={() => onIndex((index + 1) % total)} />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const t = useT();
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(side === 'left' ? 'attachment.previousImage' : 'attachment.nextImage')}
      className={cn(
        'absolute top-1/2 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-6" aria-hidden="true" />
    </button>
  );
}
