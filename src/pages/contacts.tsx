import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { Inbox, Paperclip } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { contactApi, type ContactMessage, type ContactStatus, ApiError } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

type Row = ContactMessage & { _brand: Project };
type Filter = ContactStatus | 'all';
type LinkState = { from: string; ids: { slug: CompanySlug; id: number }[] };

const STATUS_VARIANT: Record<ContactStatus, 'info' | 'success' | 'secondary' | 'warning'> = {
  new: 'info',
  read: 'warning',
  replied: 'success',
  archived: 'secondary',
};

const STATUS_LABEL_KEY: Record<ContactStatus, string> = {
  new: 'contacts.statusNew',
  read: 'contacts.statusRead',
  replied: 'contacts.statusReplied',
  archived: 'contacts.statusArchived',
};

const FILTERS: Filter[] = ['all', 'new', 'read', 'replied', 'archived'];

const PAGE_SIZE = 50;

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function contactPath(slug: CompanySlug, id: number): string {
  return `/contacts/${encodeURIComponent(slug)}/${id}`;
}

function listError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('contacts.errUnauthorized'));
    if (error.status === 403) return new Error(t('contacts.errForbidden'));
    return error;
  }
  return new Error(t('contacts.errGeneric'));
}

export function ContactsPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('contacts.title'));
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = searchParams.get('status') as Filter | null;
  const tab: Filter = statusParam && FILTERS.includes(statusParam) ? statusParam : 'all';
  const setTab = useCallback(
    (next: Filter) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'all') p.delete('status');
          else p.set('status', next);
          return p;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const singleInfinite = useInfiniteQuery({
    queryKey: ['contacts-infinite', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      contactApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['contacts', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        contactApi.list(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : singleInfinite.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : singleInfinite.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : singleInfinite.error;
  const allBrandsHasMore = isAllBrands && multi.some((q) => q.data?.nextCursor);

  const messages = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.messages ?? []).forEach((m) => out.push({ ...m, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    const pages = singleInfinite.data?.pages ?? [];
    return pages.flatMap((p) => p.messages.map((m) => ({ ...m, _brand: activeProject })));
  }, [isAllBrands, multi, projects, singleInfinite.data, activeProject]);

  const loadMore = useCallback(() => {
    if (!isAllBrands && singleInfinite.hasNextPage && !singleInfinite.isFetchingNextPage) {
      void singleInfinite.fetchNextPage();
    }
  }, [isAllBrands, singleInfinite]);

  const filtered = useMemo(() => {
    if (tab === 'all') return messages;
    return messages.filter((m) => m.status === tab);
  }, [messages, tab]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, activeProject.companySlug, isAllBrands]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: messages.length,
      new: 0,
      read: 0,
      replied: 0,
      archived: 0,
    };
    for (const m of messages) c[m.status]++;
    return c;
  }, [messages]);

  const linkState = useMemo<LinkState>(
    () => ({
      from: location.search,
      ids: filtered.map((m) => ({ slug: m._brand.companySlug, id: m.id })),
    }),
    [filtered, location.search],
  );

  // Legacy `?contact=<slug>:<id>` links (dashboard, emails, notifications) redirect to the record page.
  const legacy = searchParams.get('contact');
  const legacyMatch = legacy ? /^(?:([a-z0-9_-]{2,63}):)?(\d+)$/.exec(legacy) : null;
  if (legacyMatch) {
    const [, slug, id] = legacyMatch;
    return (
      <Navigate
        replace
        to={contactPath((slug as CompanySlug | undefined) ?? activeProject.companySlug, Number(id))}
      />
    );
  }

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void singleInfinite.refetch();
  }

  const error = listError(firstError, t);

  const STATUS_TABS: { value: Filter; label: string }[] = [
    { value: 'all', label: t('contacts.tabAll') },
    { value: 'new', label: t('contacts.tabNew') },
    { value: 'read', label: t('contacts.tabRead') },
    { value: 'replied', label: t('contacts.tabReplied') },
    { value: 'archived', label: t('contacts.tabArchived') },
  ];

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;

  const sentinel = !isAllBrands ? (
    <InfiniteScrollSentinel
      hasMore={!!singleInfinite.hasNextPage}
      isLoading={singleInfinite.isFetchingNextPage}
      onIntersect={loadMore}
      // Root only when the box scrolls (lg+); otherwise the sentinel stays inside it and loads every page.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  ) : null;

  return (
    <PageContainer width="full">
      <PageHeading
        breadcrumb={[{ label: brandLabel }, { label: t('contacts.breadcrumb') }]}
        title={t('contacts.title')}
        subtitle={t('contacts.subtitle', { brand: brandLabel })}
        actions={<RefreshButton onClick={refreshAll} fetching={isFetching} />}
      />

      <div className="flex flex-col gap-4">
        <SegmentedControl
          value={tab}
          onValueChange={setTab}
          label={t('contacts.statusFilter')}
          overflow="scroll"
          className="w-fit"
          options={STATUS_TABS.map((s) => ({ ...s, count: counts[s.value] }))}
        />

        {error ? <ErrorState error={error} onRetry={refreshAll} retrying={isFetching} /> : null}

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card">
            <LoadingState label={t('contacts.inboxLoading')} />
          </div>
        ) : filtered.length === 0 ? (
          error ? null : (
            <EmptyState variant="dashed" icon={<Inbox />} message={t('contacts.inboxEmpty')} />
          )
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {filtered.length}{' '}
              {filtered.length === 1 ? t('contacts.messageSingular') : t('contacts.messagePlural')}
            </p>

            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
              {filtered.map((m) => (
                <ContactMobileRow
                  key={`${m._brand.id}:${m.id}`}
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
              className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-36">{t('contacts.colReceived')}</TableHead>
                    <TableHead>{t('contacts.colSender')}</TableHead>
                    <TableHead>{t('contacts.colSubject')}</TableHead>
                    {isAllBrands ? <TableHead>{t('contacts.colBrand')}</TableHead> : null}
                    <TableHead>{t('contacts.colStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <ContactTableRow
                      key={`${m._brand.id}:${m.id}`}
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

            {allBrandsHasMore ? (
              <p className="text-center text-xs text-muted-foreground">
                {t('common.allBrandsHasMore')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}

function NewDot({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-full', show ? 'bg-highlight' : 'bg-transparent')}
    />
  );
}

function ContactTableRow({
  row: m,
  showBrand,
  linkState,
  bcp47,
  t,
}: {
  row: Row;
  showBrand: boolean;
  linkState: LinkState;
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  const isNew = m.status === 'new';
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
          title={t('contacts.openDetail')}
          className={cn(
            'block truncate text-foreground hover:underline',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {m.name}
        </Link>
        <p className="truncate text-xs font-normal text-muted-foreground">{m.email}</p>
      </TableCell>
      <TableCell className="max-w-[28rem] py-2">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{m.subject || t('contacts.detailNoSubject')}</span>
          {m.attachments.length > 0 ? (
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
      <TableCell className="py-2">
        <Badge variant={STATUS_VARIANT[m.status]}>{t(STATUS_LABEL_KEY[m.status] as never)}</Badge>
      </TableCell>
    </TableRow>
  );
}

function ContactMobileRow({
  row: m,
  showBrand,
  linkState,
  bcp47,
  t,
}: {
  row: Row;
  showBrand: boolean;
  linkState: LinkState;
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  const isNew = m.status === 'new';
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
          {m.name}
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
        <Badge variant={STATUS_VARIANT[m.status]}>{t(STATUS_LABEL_KEY[m.status] as never)}</Badge>
      </div>
    </li>
  );
}
