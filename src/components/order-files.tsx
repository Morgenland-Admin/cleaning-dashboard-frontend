import { useQueries } from '@tanstack/react-query';
import { AlertCircle, Download, FileText, Loader2, Paperclip } from 'lucide-react';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { CountPill } from '@/components/count-pill';
import { SectionCard } from '@/components/section';
import { useLocale, useT } from '@/i18n';
import { uploadsAdminApi } from '@/lib/api';
import { formatBytes, isImageFile } from '@/lib/chat';
import { cn } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';
import type { OrderFile } from '@/pages/orders-shared';

/** Read-only: images open in the lightbox, everything else is a signed download. */
export function OrderFilesCard({
  companySlug,
  files,
}: {
  companySlug: CompanySlug;
  files: OrderFile[];
}) {
  const t = useT();
  if (files.length === 0) return null;
  const images = files.filter((f) => isImageFile(f));
  const others = files.filter((f) => !isImageFile(f));
  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          {t('orders.files.title')}
          <CountPill>{files.length}</CountPill>
        </span>
      }
      icon={<Paperclip />}
      bodyClassName="space-y-3"
    >
      {images.length > 0 ? (
        <AttachmentGallery
          companySlug={companySlug}
          attachments={images}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        />
      ) : null}
      {others.length > 0 ? <FileRows companySlug={companySlug} files={others} /> : null}
    </SectionCard>
  );
}

// Same cache key as AttachmentGallery, so a file signed once is reused.
function FileRows({ companySlug, files }: { companySlug: CompanySlug; files: OrderFile[] }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queries = useQueries({
    queries: files.map((f) => ({
      queryKey: ['upload-url', companySlug, f.key] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        uploadsAdminApi.signDownload(companySlug, f.key, signal),
      staleTime: 8 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })),
  });
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {files.map((f, i) => {
        const q = queries[i];
        const url = q?.data?.downloadUrl;
        const size = f.size > 0 ? formatBytes(f.size, bcp47) : null;
        const box =
          'flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left';
        const inner = (
          <>
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">{f.name}</span>
              {size ? <span className="block text-2xs text-muted-foreground">{size}</span> : null}
            </span>
            {q?.isError ? (
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
        return (
          <li key={f.key}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('orders.files.open', { name: f.name })}
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
                {q?.isError ? (
                  <span className="sr-only">{t('attachment.loadFailed', { name: f.name })}</span>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
