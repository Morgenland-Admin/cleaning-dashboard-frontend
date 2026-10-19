import { useInfiniteQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { LoadingState } from '@/components/empty-state';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale, useT } from '@/i18n';
import { emailsAdminApi, type EmailLogRow, type EmailRefType } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

type DisplayStatus =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'
  | 'skipped'
  | 'blocked';

function displayStatus(row: EmailLogRow): DisplayStatus {
  if (row.status === 'blocked' || row.status === 'skipped' || row.status === 'failed') {
    return row.status;
  }
  if (row.status === 'sending') return 'sending';
  switch (row.deliveryStatus) {
    case 'bounced':
    case 'complained':
    case 'failed':
    case 'suppressed':
      return row.deliveryStatus;
    default:
      break;
  }
  if (row.openedAt) return 'opened';
  if (row.deliveryStatus === 'delivered') return 'delivered';
  if (row.deliveryStatus === 'delivery_delayed') return 'delayed';
  return 'sent';
}

const STATUS_VARIANT: Record<
  DisplayStatus,
  'secondary' | 'info' | 'success' | 'warning' | 'destructive'
> = {
  sending: 'secondary',
  sent: 'info',
  delivered: 'success',
  opened: 'success',
  delayed: 'warning',
  bounced: 'destructive',
  complained: 'destructive',
  failed: 'destructive',
  suppressed: 'warning',
  skipped: 'secondary',
  blocked: 'secondary',
};

export function EmailStatusBadge({ row }: { row: EmailLogRow }) {
  const t = useT();
  const s = displayStatus(row);
  return <Badge variant={STATUS_VARIANT[s]}>{t(`emails.status.${s}` as never)}</Badge>;
}

const PAGE_SIZE = 10;

/** `toAddress` is the recipient list joined with ", ". */
function sentTo(row: EmailLogRow, address: string): boolean {
  const want = address.trim().toLowerCase();
  return row.toAddress.split(',').some((a) => a.trim().toLowerCase() === want);
}

/**
 * `parentKey` is the record's own query key: the list is cached under it, so actions that mail
 * the customer invalidate it too.
 */
export function EmailLogList({
  parentKey,
  brand,
  filter,
  empty,
}: {
  parentKey: readonly unknown[];
  brand: CompanySlug;
  /** By record link, or — for customers, which have none — by recipient address. */
  filter: { refType: EmailRefType; refId: number } | { recipient: string };
  empty?: React.ReactNode;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const recipient = 'recipient' in filter ? filter.recipient : null;

  const list = useInfiniteQuery({
    queryKey: [...parentKey, 'emails', filter] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      emailsAdminApi.list(
        {
          brand,
          ...('recipient' in filter
            ? { q: filter.recipient }
            : { refType: filter.refType, refId: filter.refId }),
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (list.isLoading) {
    return <LoadingState inline label={t('emails.loading')} />;
  }
  if (list.isError) {
    return (
      <ErrorState
        error={list.error}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }

  const all = list.data?.pages.flatMap((p) => p.emails) ?? [];
  // The search also hits subjects and longer addresses — keep exact recipients.
  const rows = recipient != null ? all.filter((r) => sentTo(r, recipient)) : all;

  if (rows.length === 0 && !list.hasNextPage) {
    return (
      empty ?? (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-xs text-muted-foreground">
          {t('emails.record.empty')}
        </p>
      )
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/emails/${row.id}`}
                state={{ from: `${location.pathname}${location.search}` }}
                className="flex flex-col gap-0.5 px-3 py-2 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-2sm font-medium">{row.subject}</span>
                  <EmailStatusBadge row={row} />
                </span>
                <span className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate">
                      {t(`emails.kind.${row.kind}` as never)}
                      {recipient == null ? ` · ${t('emails.toShort')} ${row.toAddress}` : null}
                    </span>
                    {row.attachmentCount > 0 ? (
                      <Paperclip
                        className="size-3 shrink-0"
                        role="img"
                        aria-label={t('emails.hasAttachments', { n: row.attachmentCount })}
                      />
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatDateTime(row.createdAt, bcp47, {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="ghost"
          size="xs"
          className="self-start"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('emails.record.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
