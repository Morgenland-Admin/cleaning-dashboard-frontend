import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Mail, Paperclip } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmailStatusBadge } from '@/components/email-log-list';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  emailsAdminApi,
  type EmailKind,
  type EmailLogRow,
  type EmailStatusFilter,
} from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';

type T = ReturnType<typeof useT>;

const STATUS_TABS: Array<EmailStatusFilter | 'all'> = [
  'all',
  'delivered',
  'opened',
  'problem',
  'not_sent',
];

const KIND_GROUPS: Array<{ group: string; kinds: EmailKind[] }> = [
  {
    group: 'orders',
    kinds: [
      'order_confirmation',
      'order_status',
      'order_message',
      'payment_request',
      'appointment_confirmed',
      'pickup_scheduling',
      'receipt',
    ],
  },
  { group: 'billing', kinds: ['invoice', 'dunning'] },
  { group: 'leads', kinds: ['contact_ack', 'contact_reply', 'inquiry_ack', 'quote'] },
  { group: 'newsletter', kinds: ['newsletter_confirm'] },
  {
    group: 'team',
    kinds: ['staff_notification', 'task_assigned', 'task_comment', 'invite', 'password_reset'],
  },
];

const ALL_KINDS = new Set<string>(KIND_GROUPS.flatMap((g) => g.kinds));

const PAGE_SIZE = 50;

export interface EmailListState {
  from: string;
  ids: number[];
}

function asDisplayError(error: unknown, t: T): Error | null {
  if (!error) return null;
  return error instanceof ApiError ? error : new Error(t('emails.loadFailed'));
}

function sentAtShort(iso: string, bcp47: string): string {
  return formatDateTime(iso, bcp47, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmailsPage() {
  const [params] = useSearchParams();
  const legacyId = params.get('email');
  if (legacyId && /^\d+$/.test(legacyId)) {
    return <Navigate to={`/emails/${legacyId}`} replace />;
  }
  return <EmailsList />;
}

function EmailsList() {
  const { activeProject, projects, isAllBrands } = useProject();
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  usePageTitle(t('emails.title'));

  // Filters live in the URL so the detail page's back link returns to the same list.
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: EmailStatusFilter | 'all' = STATUS_TABS.includes(rawStatus as EmailStatusFilter)
    ? (rawStatus as EmailStatusFilter)
    : 'all';
  const rawKind = params.get('kind') ?? '';
  const kind: EmailKind | '' = ALL_KINDS.has(rawKind) ? (rawKind as EmailKind) : '';
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  function setParam(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  // The debounced search goes to the URL (state → URL, never the reverse).
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    setParam('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const brand = isAllBrands ? undefined : activeProject.companySlug;

  const list = useInfiniteQuery({
    queryKey: ['emails', brand ?? 'all', status, kind, q] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      emailsAdminApi.list(
        {
          brand,
          status: status === 'all' ? undefined : status,
          kind: kind || undefined,
          q: q || undefined,
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const tracking = useQuery({
    queryKey: ['email-tracking'] as const,
    queryFn: ({ signal }) => emailsAdminApi.tracking(signal),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.emails) ?? [], [list.data]);
  const projectBySlug = useMemo(
    () => new Map(projects.map((p) => [p.companySlug, p] as const)),
    [projects],
  );

  const disconnected = useMemo(() => {
    const brands = tracking.data?.brands ?? [];
    return brands.filter((b) => !b.connected && (isAllBrands || b.slug === brand));
  }, [tracking.data, isAllBrands, brand]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [status, kind, q, brand]);

  const listError = asDisplayError(list.error, t);
  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const isFiltered = status !== 'all' || kind !== '' || q !== '';
  const linkState: EmailListState = {
    from: `${location.pathname}${location.search}`,
    ids: rows.map((r) => r.id),
  };

  function resetFilters() {
    setSearch('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('status');
        next.delete('kind');
        next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  const rowBrand = (row: EmailLogRow) =>
    row.companySlug ? projectBySlug.get(row.companySlug) : undefined;

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        breadcrumb={[{ label: brandLabel }, { label: t('emails.breadcrumb') }]}
        title={t('emails.title')}
        meta={
          list.data ? (
            <Badge variant="secondary" className="tabular-nums">
              {list.hasNextPage
                ? t('emails.countMore', { n: rows.length })
                : t('emails.count', { n: rows.length })}
            </Badge>
          ) : null
        }
        subtitle={t('emails.subtitle', { brand: brandLabel })}
        actions={<RefreshButton fetching={list.isFetching} onClick={() => void list.refetch()} />}
      />

      {disconnected.length > 0 ? (
        <Alert tone="info">
          {t('emails.trackingNotice', { brands: disconnected.map((b) => b.name).join(', ') })}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedControl
          label={t('emails.statusFilterLabel')}
          value={status}
          onValueChange={(v) => setParam('status', v === 'all' ? '' : v)}
          overflow="scroll"
          className="xl:w-auto"
          options={STATUS_TABS.map((value) => ({
            value,
            label: t(`emails.filter.${value}` as never),
          }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('emails.searchPlaceholder')}
            label={t('emails.searchLabel')}
            searching={list.isFetching && !list.isFetchingNextPage && q !== ''}
            containerClassName="sm:flex-1 xl:w-64 xl:flex-none"
          />
          <Select
            value={kind}
            onValueChange={(v) => setParam('kind', v)}
            aria-label={t('emails.kindLabel')}
            className="sm:w-56"
            options={[
              { value: '', label: t('emails.kindAll') },
              ...KIND_GROUPS.map(({ group, kinds }) => ({
                label: t(`emails.kindGroup.${group}` as never),
                options: kinds.map((k) => ({ value: k, label: t(`emails.kind.${k}` as never) })),
              })),
            ]}
          />
        </div>
      </div>

      {list.isLoading ? (
        <LoadingState label={t('emails.loading')} className="min-h-48" />
      ) : listError ? (
        <ErrorState
          error={listError}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : rows.length === 0 ? (
        isFiltered ? (
          <EmptyState
            variant="dashed"
            icon={<Mail aria-hidden="true" />}
            message={t('emails.emptyFiltered')}
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                {t('emails.resetFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            variant="dashed"
            icon={<Mail aria-hidden="true" />}
            message={t('emails.emptyNone', { brand: brandLabel })}
          />
        )
      ) : (
        // overflow-clip rounds the corners without becoming a scroll container, so the sticky header pins to the list box.
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div
            ref={listScrollRef}
            className="lg:max-h-[calc(100svh-18rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <ul className="divide-y divide-border md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <EmailListItem
                    row={row}
                    brand={rowBrand(row)}
                    showBrand={isAllBrands}
                    state={linkState}
                    t={t}
                    bcp47={bcp47}
                  />
                </li>
              ))}
            </ul>

            <Table containerClassName="hidden w-full md:block">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('emails.col.sentAt')}</TableHead>
                  <TableHead>{t('emails.col.to')}</TableHead>
                  <TableHead>{t('emails.col.subject')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('emails.col.kind')}</TableHead>
                  {isAllBrands ? <TableHead>{t('emails.col.brand')}</TableHead> : null}
                  <TableHead>{t('emails.col.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <EmailTableRow
                    key={row.id}
                    row={row}
                    brand={rowBrand(row)}
                    showBrand={isAllBrands}
                    state={linkState}
                    t={t}
                    bcp47={bcp47}
                  />
                ))}
              </TableBody>
            </Table>

            <InfiniteScrollSentinel
              hasMore={!!list.hasNextPage}
              isLoading={list.isFetchingNextPage}
              onIntersect={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              // Root only where the box scrolls (lg+); otherwise the sentinel is always visible and loads every page.
              rootRef={isDesktop ? listScrollRef : undefined}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

/** Platform mail has no brand and a brand outside the switcher has no Project; both get a plain chip like BrandChip. */
export function MailBrand({
  row,
  brand,
  t,
}: {
  row: EmailLogRow;
  brand: Project | undefined;
  t: T;
}) {
  if (brand) return <BrandChip brand={brand} />;
  return (
    <span className="inline-flex max-w-full shrink-0 items-center rounded-sm border border-border bg-card px-1.5 py-px text-2xs font-medium text-muted-foreground">
      <span className="truncate">{row.companyName ?? t('emails.system')}</span>
    </span>
  );
}

function AttachmentMark({ row, t }: { row: EmailLogRow; t: T }) {
  if (row.attachmentCount === 0) return null;
  return (
    <Paperclip
      className="size-3 shrink-0 text-muted-foreground"
      role="img"
      aria-label={t('emails.hasAttachments', { n: row.attachmentCount })}
    />
  );
}

interface RowProps {
  row: EmailLogRow;
  brand: Project | undefined;
  showBrand: boolean;
  state: EmailListState;
  t: T;
  bcp47: string;
}

function EmailTableRow({ row, brand, showBrand, state, t, bcp47 }: RowProps) {
  return (
    // Stretched link (after:inset-0): the row is one click target and one tab stop.
    <TableRow className="relative">
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {sentAtShort(row.createdAt, bcp47)}
      </TableCell>
      <TableCell className="max-w-[16rem]">
        <span className="block truncate" title={row.toAddress}>
          {row.toAddress}
        </span>
      </TableCell>
      <TableCell className="w-full max-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link
            to={`/emails/${row.id}`}
            state={state}
            className="truncate font-medium text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {row.subject}
          </Link>
          <AttachmentMark row={row} t={t} />
        </span>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
        {t(`emails.kind.${row.kind}` as never)}
      </TableCell>
      {showBrand ? (
        <TableCell>
          <MailBrand row={row} brand={brand} t={t} />
        </TableCell>
      ) : null}
      <TableCell>
        <EmailStatusBadge row={row} />
      </TableCell>
    </TableRow>
  );
}

function EmailListItem({ row, brand, showBrand, state, t, bcp47 }: RowProps) {
  return (
    <Link
      to={`/emails/${row.id}`}
      state={state}
      className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-2sm font-medium text-foreground">{row.toAddress}</span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {sentAtShort(row.createdAt, bcp47)}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-2sm text-muted-foreground">
        <span className="truncate">{row.subject}</span>
        <AttachmentMark row={row} t={t} />
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5">
        {showBrand ? <MailBrand row={row} brand={brand} t={t} /> : null}
        <EmailStatusBadge row={row} />
        <span className="text-2xs text-muted-foreground">
          {t(`emails.kind.${row.kind}` as never)}
        </span>
      </span>
    </Link>
  );
}
