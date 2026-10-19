import { Inbox, Phone, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { inquiriesApi, type ServiceInquiry } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { InboxToolbar, NewDot } from '@/pages/inbox-components';
import {
  ROW_LINK,
  contactLine,
  displayName,
  inquiryPath,
  inquiryStatusMeta,
  loadError,
  readInboxParams,
  sourceLabel,
  withParam,
  type BrandListState,
  type Translate,
} from '@/pages/inbox-shared';
import { countOf, useInboxList, useUrlSearch, type BrandRow } from '@/pages/use-inbox-list';

type Row = BrandRow<ServiceInquiry>;

const STATUS_FILTERS = ['open', 'new', 'in_review', 'quoted', 'won', 'lost', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// `open` matches the dashboard tile: new + in review.
const STATUS_GROUP: Record<StatusFilter, readonly string[] | 'all'> = {
  open: ['new', 'in_review'],
  new: ['new'],
  in_review: ['in_review'],
  quoted: ['quoted'],
  won: ['won'],
  lost: ['lost'],
  all: 'all',
};

export function InquiriesPage() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProject();
  // Older links: `?inquiry=<slug>:<id>` (dashboard, search) and `?id=<id>` (notification mails).
  const legacy = searchParams.get('inquiry') ?? searchParams.get('id');
  const match = legacy ? /^(?:([a-z0-9_-]{2,63}):)?(\d+)$/.exec(legacy) : null;
  if (match) {
    const [, slug, id] = match;
    return (
      <Navigate
        replace
        to={inquiryPath((slug as CompanySlug | undefined) ?? activeProject.companySlug, Number(id))}
      />
    );
  }
  return <InquiriesList />;
}

function InquiriesList() {
  const { activeProject, isAllBrands } = useProject();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('inquiries.title'));
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, source } = readInboxParams(searchParams, STATUS_FILTERS, 'open');
  const { search, setSearch, q, searching } = useUrlSearch();

  const list = useInboxList<ServiceInquiry>({
    key: 'inquiries',
    filters: { status, q, source },
    fetchPage: async (slug, opts, signal) => {
      const res = await inquiriesApi.list(slug, opts, signal);
      return { rows: res.inquiries, nextCursor: res.nextCursor };
    },
    fetchCounts: inquiriesApi.counts,
  });
  const { rows, counts } = list;

  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [status, q, source, activeProject.companySlug, isAllBrands]);

  const linkState = useMemo<BrandListState>(
    () => ({
      from: location.search,
      ids: rows.map((i) => ({ slug: i._brand.companySlug, id: i.id })),
    }),
    [rows, location.search],
  );

  function setParam(key: string, value: string | null) {
    setSearchParams((prev) => withParam(prev, key, value), { replace: true });
  }
  function resetFilters() {
    setSearch('');
    setSearchParams((prev) => withParam(withParam(prev, 'q', null), 'source', null), {
      replace: true,
    });
  }

  const tabLabels: Record<StatusFilter, string> = {
    open: t('inquiries.tabOpen'),
    new: t('inquiries.tabNew'),
    in_review: t('inquiries.tabInReview'),
    quoted: t('inquiries.tabQuoted'),
    won: t('inquiries.tabWon'),
    lost: t('inquiries.tabLost'),
    all: t('inquiries.tabAll'),
  };
  const activeCount = countOf(counts, STATUS_GROUP[status]);
  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const error = loadError(list.error, t, 'inquiries');
  const filtered = !!q || !!source;

  const sentinel = (
    <InfiniteScrollSentinel
      hasMore={list.hasMore}
      isLoading={list.isFetchingNextPage}
      onIntersect={list.loadMore}
      // Root only when the box scrolls (lg+); otherwise the sentinel stays inside it and loads every page.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  );

  return (
    <PageContainer width="full">
      <PageHeading
        breadcrumb={[{ label: brandLabel }, { label: t('inquiries.title') }]}
        title={t('inquiries.title')}
        subtitle={t('inquiries.subtitleFor', { brand: brandLabel })}
        actions={<RefreshButton onClick={list.refetch} fetching={list.isFetching} />}
      />

      <div className="relative flex flex-col gap-4">
        <InboxToolbar
          statusLabel={t('inquiries.statusFilter')}
          status={status}
          onStatusChange={(next) => setParam('status', next === 'open' ? null : next)}
          statusOptions={STATUS_FILTERS.map((value) => ({
            value,
            label: tabLabels[value],
            count: countOf(counts, STATUS_GROUP[value]),
          }))}
          search={search}
          onSearchChange={setSearch}
          searching={searching}
          searchPlaceholder={t('inquiries.searchPlaceholder')}
          source={source}
          onSourceChange={(next) => setParam('source', next || null)}
          sourceCounts={counts?.bySource}
        />

        {activeCount !== undefined ? (
          <p className="sr-only" aria-live="polite">
            {activeCount === 1
              ? t('inquiries.countSingular', { count: activeCount })
              : t('inquiries.countPlural', { count: activeCount })}
          </p>
        ) : null}

        {list.isLoading ? (
          <div className="rounded-lg border border-border bg-card">
            <LoadingState label={t('inquiries.loading')} />
          </div>
        ) : error && rows.length === 0 ? (
          <ErrorState error={error} onRetry={list.refetch} retrying={list.isFetching} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="dashed"
              icon={<Search />}
              title={t('inbox.searchEmpty')}
              message={q ? t('inbox.searchEmptyHint', { query: q }) : t('inquiries.empty')}
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X aria-hidden="true" />
                  {t('inbox.resetFilters')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              variant="dashed"
              icon={<Inbox />}
              message={status === 'open' ? t('inquiries.emptyOpen') : t('inquiries.empty')}
            />
          )
        ) : (
          <div
            className={cn(
              'flex flex-col gap-3 transition-opacity',
              list.isPlaceholderData && 'opacity-60',
            )}
            aria-busy={list.isPlaceholderData || undefined}
          >
            {error && !list.nextPageFailed ? (
              <ErrorState error={error} onRetry={list.refetch} retrying={list.isFetching} />
            ) : null}

            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
              {rows.map((i) => (
                <InquiryMobileRow
                  key={`${i._brand.companySlug}:${i.id}`}
                  row={i}
                  showBrand={isAllBrands}
                  linkState={linkState}
                  bcp47={bcp47}
                  t={t}
                />
              ))}
            </ul>

            {/* The box is the scroll container, so the sticky header anchors to it; the Table's own wrapper must not scroll. */}
            <div
              ref={listScrollRef}
              className="relative hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-36">{t('inquiries.colReceived')}</TableHead>
                    <TableHead>{t('inquiries.colCustomer')}</TableHead>
                    <TableHead>{t('inquiries.colRequest')}</TableHead>
                    {isAllBrands ? <TableHead>{t('inquiries.colBrand')}</TableHead> : null}
                    <TableHead className="hidden lg:table-cell">
                      {t('inquiries.fields.source')}
                    </TableHead>
                    <TableHead>{t('inquiries.colStatus')}</TableHead>
                    <TableHead className="text-right">{t('inquiries.colAmount')}</TableHead>
                    <TableHead>{t('inquiries.colCallback')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((i) => (
                    <InquiryTableRow
                      key={`${i._brand.companySlug}:${i.id}`}
                      row={i}
                      showBrand={isAllBrands}
                      linkState={linkState}
                      bcp47={bcp47}
                      t={t}
                    />
                  ))}
                </TableBody>
              </Table>
              {isDesktop ? sentinel : null}
            </div>
            {isDesktop ? null : sentinel}

            {list.allBrandsHasMore ? (
              <p className="text-center text-xs text-muted-foreground">
                {t('common.allBrandsHasMore')}
              </p>
            ) : null}
            {list.nextPageFailed && error ? (
              <ErrorState
                error={error}
                onRetry={list.loadMore}
                retrying={list.isFetchingNextPage}
              />
            ) : null}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function CallbackOwnerBadge({ owner, t }: { owner: string | null; t: Translate }) {
  if (owner !== 'human' && owner !== 'ai') return null;
  return (
    <Badge variant={owner === 'human' ? 'warning' : 'secondary'}>
      <Phone aria-hidden="true" />
      {owner === 'human' ? t('inquiries.callbackOwner.human') : t('inquiries.callbackOwner.ai')}
    </Badge>
  );
}

function amountOf(row: Row, bcp47: string): string | null {
  const n = row.quotedAmount ? Number(row.quotedAmount) : NaN;
  return Number.isFinite(n) ? formatCurrency(n, 'EUR', bcp47) : null;
}

type RowProps = {
  row: Row;
  showBrand: boolean;
  linkState: BrandListState;
  bcp47: string;
  t: Translate;
};

function InquiryTableRow({ row: i, showBrand, linkState, bcp47, t }: RowProps) {
  const isNew = i.status === 'new';
  const contact = contactLine(i);
  const status = inquiryStatusMeta(t, i.status);
  const amount = amountOf(i, bcp47);
  return (
    <TableRow className={cn('relative', isNew && 'font-semibold')}>
      <TableCell className="whitespace-nowrap py-2">
        <span className="flex items-center gap-2">
          <NewDot show={isNew} />
          <time dateTime={i.createdAt} className="tabular-nums text-muted-foreground">
            {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short', timeStyle: 'short' })}
          </time>
        </span>
      </TableCell>
      <TableCell className="max-w-[16rem] py-2">
        <Link
          to={inquiryPath(i._brand.companySlug, i.id)}
          state={linkState}
          className={cn(
            'block truncate text-foreground hover:underline',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {displayName(t, i)}
        </Link>
        {contact ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{contact}</p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-[22rem] py-2">
        <p className="truncate">{i.service || i.callReason || i.message}</p>
        {i.service || i.callReason ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{i.message}</p>
        ) : null}
      </TableCell>
      {showBrand ? (
        <TableCell className="py-2">
          <BrandChip brand={i._brand} />
        </TableCell>
      ) : null}
      <TableCell className="hidden whitespace-nowrap py-2 text-xs font-normal text-muted-foreground lg:table-cell">
        {sourceLabel(t, i.source)}
      </TableCell>
      <TableCell className="py-2">
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">{amount}</TableCell>
      <TableCell className="py-2">
        <CallbackOwnerBadge owner={i.callbackOwner} t={t} />
      </TableCell>
    </TableRow>
  );
}

function InquiryMobileRow({ row: i, showBrand, linkState, bcp47, t }: RowProps) {
  const isNew = i.status === 'new';
  const status = inquiryStatusMeta(t, i.status);
  const amount = amountOf(i, bcp47);
  const topic = i.service || i.callReason;
  return (
    <li className="relative space-y-0.5 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60">
      <div className="flex items-center gap-2">
        <NewDot show={isNew} />
        <Link
          to={inquiryPath(i._brand.companySlug, i.id)}
          state={linkState}
          className={cn(
            'min-w-0 truncate text-2sm text-foreground',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {displayName(t, i)}
        </Link>
        <time
          dateTime={i.createdAt}
          className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      </div>
      <p className="truncate pl-3.5 text-xs text-muted-foreground">
        {topic ? `${topic} · ` : ''}
        {i.message}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 pl-3.5 pt-0.5">
        {showBrand ? <BrandChip brand={i._brand} /> : null}
        <Badge variant={status.variant}>{status.label}</Badge>
        <CallbackOwnerBadge owner={i.callbackOwner} t={t} />
        <span className="text-xs text-muted-foreground">{sourceLabel(t, i.source)}</span>
        {amount ? (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{amount}</span>
        ) : null}
      </div>
    </li>
  );
}
