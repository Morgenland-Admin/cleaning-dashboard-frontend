import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueries } from '@tanstack/react-query';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
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
    att.contentType?.startsWith('image/') ?? /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(att.name)
  );
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

  return (
    <>
      <ul className={className ?? 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
        {attachments.map((att, i) => {
          const q = queries[i];
          const url = q?.data?.downloadUrl;
          const isImage = isImageAttachment(att);
          const isClickable = !!url;
          return (
            <li
              key={att.key}
              className="overflow-hidden rounded-lg border border-border bg-muted/30"
            >
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && setLightboxIndex(i)}
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 disabled:cursor-default"
                aria-label={t('attachment.openImage', { name: att.name })}
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-background/60">
                  {q?.isLoading ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : q?.isError ? (
                    <AlertCircle className="size-4 text-rust" />
                  ) : url && isImage ? (
                    <img
                      src={url}
                      alt={att.name}
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="px-2 text-center text-[11px] text-muted-foreground">
                      {att.name}
                    </span>
                  )}
                </div>
                <div className="truncate px-2 py-1 text-[11px] text-foreground/80">{att.name}</div>
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

function Lightbox({
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
  const isImage = isImageAttachment(current);

  // Arrow keys navigate; Radix handles Esc/scroll-lock/focus-trap.
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
          aria-label={current.name}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{current.name}</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current.name}</p>
              {total > 1 ? (
                <p className="text-[11px] text-white/60">
                  {index + 1} / {total}
                </p>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="inline-flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div
            className="relative flex flex-1 items-center justify-center px-4 pb-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {total > 1 ? (
              <NavButton side="left" onClick={() => onIndex((index - 1 + total) % total)} />
            ) : null}

            {url && isImage ? (
              <img src={url} alt={current.name} className="max-h-full max-w-full object-contain" />
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
              <Loader2 className="size-6 animate-spin text-white/70" />
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
        'absolute top-1/2 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-6" />
    </button>
  );
}
