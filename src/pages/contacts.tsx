import { Inbox, Paperclip, Search, X } from 'lucide-react';
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
import { contactApi, type ContactMessage } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import { InboxToolbar, NewDot } from '@/pages/inbox-components';
import {
  ROW_LINK,
  contactLine,
  contactPath,
  contactStatusMeta,
  displayName,
  loadError,
  readInboxParams,
  sourceLabel,
  withParam,
  type BrandListState,
  type Translate,
} from '@/pages/inbox-shared';
import { countOf, useInboxList, useUrlSearch, type BrandRow } from '@/pages/use-inbox-list';

type Row = BrandRow<ContactMessage>;

const STATUS_FILTERS = ['open', 'new', 'read', 'replied', 'archived', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// `open` = not answered yet.
const STATUS_GROUP: Record<StatusFilter, readonly string[] | 'all'> = {
  open: ['new', 'read'],
  new: ['new'],
  read: ['read'],
  replied: ['replied'],
  archived: ['archived'],
  all: 'all',
};

export function ContactsPage() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProject();
  // Older links: `?contact=<slug>:<id>` (dashboard, search) and `?id=<id>` (notification mails).
  const legacy = searchParams.get('contact') ?? searchParams.get('id');
  const match = legacy ? /^(?:([a-z0-9_-]{2,63}):)?(\d+)$/.exec(legacy) : null;
  if (match) {
    const [, slug, id] = match;
    return (
      <Navigate
        replace
        to={contactPath((slug as CompanySlug | undefined) ?? activeProject.companySlug, Number(id))}
      />
    );
  }
  return <ContactsList />;
}

function ContactsList() {
  const { activeProject, isAllBrands } = useProject();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('contacts.title'));
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, source } = readInboxParams(searchParams, STATUS_FILTERS, 'open');
  const { search, setSearch, q, searching } = useUrlSearch();

  const list = useInboxList<ContactMessage>({
    key: 'contacts',
    filters: { status, q, source },
    fetchPage: async (slug, opts, signal) => {
      const res = await contactApi.list(slug, opts, signal);
      return { rows: res.messages, nextCursor: res.nextCursor };
    },
    fetchCounts: contactApi.counts,
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
      ids: rows.map((m) => ({ slug: m._brand.companySlug, id: m.id })),
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
    open: t('contacts.tabOpen'),
    new: t('contacts.tabNew'),
    read: t('contacts.tabRead'),
    replied: t('contacts.tabReplied'),
    archived: t('contacts.tabArchived'),
    all: t('contacts.tabAll'),
  };
  const activeCount = countOf(counts, STATUS_GROUP[status]);
  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const error = loadError(list.error, t, 'contacts');
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
        breadcrumb={[{ label: brandLabel }, { label: t('contacts.breadcrumb') }]}
        title={t('contacts.title')}
        subtitle={t('contacts.subtitle', { brand: brandLabel })}
        actions={<RefreshButton onClick={list.refetch} fetching={list.isFetching} />}
      />

      <div className="relative flex flex-col gap-4">
        <InboxToolbar
          statusLabel={t('contacts.statusFilter')}
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
          searchPlaceholder={t('contacts.searchPlaceholder')}
          source={source}
          onSourceChange={(next) => setParam('source', next || null)}
          sourceCounts={counts?.bySource}
        />

        {activeCount !== undefined ? (
          <p className="sr-only" aria-live="polite">
            {activeCount}{' '}
            {activeCount === 1 ? t('contacts.messageSingular') : t('contacts.messagePlural')}
          </p>
        ) : null}

        {list.isLoading ? (
          <div className="rounded-lg border border-border bg-card">
            <LoadingState label={t('contacts.inboxLoading')} />
          </div>
        ) : error && rows.length === 0 ? (
          <ErrorState error={error} onRetry={list.refetch} retrying={list.isFetching} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              variant="dashed"
              icon={<Search />}
              title={t('inbox.searchEmpty')}
              message={q ? t('inbox.searchEmptyHint', { query: q }) : t('contacts.inboxEmpty')}
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
              message={status === 'open' ? t('contacts.emptyOpen') : t('contacts.inboxEmpty')}
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
              {rows.map((m) => (
                <ContactMobileRow
                  key={`${m._brand.companySlug}:${m.id}`}
                  row={m}
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
                    <TableHead className="w-36">{t('contacts.colReceived')}</TableHead>
                    <TableHead>{t('contacts.colSender')}</TableHead>
                    <TableHead>{t('contacts.colSubject')}</TableHead>
                    {isAllBrands ? <TableHead>{t('contacts.colBrand')}</TableHead> : null}
                    <TableHead className="hidden lg:table-cell">
                      {t('contacts.detailSource')}
                    </TableHead>
                    <TableHead>{t('contacts.colStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => (
                    <ContactTableRow
                      key={`${m._brand.companySlug}:${m.id}`}
                      row={m}
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

type RowProps = {
  row: Row;
  showBrand: boolean;
  linkState: BrandListState;
  bcp47: string;
  t: Translate;
};

function ContactTableRow({ row: m, showBrand, linkState, bcp47, t }: RowProps) {
  const isNew = m.status === 'new';
  const status = contactStatusMeta(t, m.status);
  const contact = contactLine(m);
  return (
    <TableRow className={cn('relative', isNew && 'font-semibold')}>
      <TableCell className="whitespace-nowrap py-2">
        <span className="flex items-center gap-2">
          <NewDot show={isNew} />
          <time dateTime={m.createdAt} className="tabular-nums text-muted-foreground">
            {formatDateTime(m.createdAt, bcp47, { dateStyle: 'short', timeStyle: 'short' })}
          </time>
        </span>
      </TableCell>
      <TableCell className="max-w-[16rem] py-2">
        <Link
          to={contactPath(m._brand.companySlug, m.id)}
          state={linkState}
          className={cn(
            'block truncate text-foreground hover:underline',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {displayName(t, m)}
        </Link>
        {contact ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{contact}</p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-[28rem] py-2">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{m.subject || t('contacts.detailNoSubject')}</span>
          {m.attachments?.length ? (
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </p>
        <p className="truncate text-xs font-normal text-muted-foreground">{m.message}</p>
      </TableCell>
      {showBrand ? (
        <TableCell className="py-2">
          <BrandChip brand={m._brand} />
        </TableCell>
      ) : null}
      <TableCell className="hidden whitespace-nowrap py-2 text-xs font-normal text-muted-foreground lg:table-cell">
        {sourceLabel(t, m.source)}
      </TableCell>
      <TableCell className="py-2">
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

function ContactMobileRow({ row: m, showBrand, linkState, bcp47, t }: RowProps) {
  const isNew = m.status === 'new';
  const status = contactStatusMeta(t, m.status);
  return (
    <li className="relative space-y-0.5 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60">
      <div className="flex items-center gap-2">
        <NewDot show={isNew} />
        <Link
          to={contactPath(m._brand.companySlug, m.id)}
          state={linkState}
          className={cn(
            'min-w-0 truncate text-2sm text-foreground',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {displayName(t, m)}
        </Link>
        <time
          dateTime={m.createdAt}
          className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {formatDateTime(m.createdAt, bcp47, { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      </div>
      <p className="truncate pl-3.5 text-xs text-muted-foreground">
        {m.subject ? `${m.subject} · ` : ''}
        {m.message}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 pl-3.5 pt-0.5">
        {showBrand ? <BrandChip brand={m._brand} /> : null}
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="text-xs text-muted-foreground">{sourceLabel(t, m.source)}</span>
        {m.attachments?.length ? (
          <Paperclip className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>
    </li>
  );
}
