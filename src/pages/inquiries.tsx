import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { Inbox, Phone } from 'lucide-react';
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
import { inquiriesApi, type InquiryStatus, type ServiceInquiry, ApiError } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

type Row = ServiceInquiry & { _brand: Project };
type Filter = InquiryStatus | 'all';
type LinkState = { from: string; ids: { slug: CompanySlug; id: number }[] };

const STATUS_VARIANT: Record<
  InquiryStatus,
  'default' | 'info' | 'warning' | 'success' | 'secondary'
> = {
  new: 'info',
  in_review: 'warning',
  quoted: 'default',
  won: 'success',
  lost: 'secondary',
};

const STATUS_KEY: Record<InquiryStatus, string> = {
  new: 'inquiries.status.new',
  in_review: 'inquiries.status.in_review',
  quoted: 'inquiries.status.quoted',
  won: 'inquiries.status.won',
  lost: 'inquiries.status.lost',
};

const FILTERS: Filter[] = ['all', 'new', 'in_review', 'quoted', 'won', 'lost'];

const PAGE_SIZE = 50;

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function inquiryPath(slug: CompanySlug, id: number): string {
  return `/inquiries/${encodeURIComponent(slug)}/${id}`;
}

function listError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('inquiries.errUnauthorized'));
    if (error.status === 403) return new Error(t('inquiries.errForbidden'));
    return error;
  }
  return new Error(t('inquiries.errGeneric'));
}

export function InquiriesPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('inquiries.title'));
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
    queryKey: ['inquiries-infinite', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      inquiriesApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['inquiries', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        inquiriesApi.list(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : singleInfinite.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : singleInfinite.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : singleInfinite.error;
  const allBrandsHasMore = isAllBrands && multi.some((q) => q.data?.nextCursor);

  const inquiries = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.inquiries ?? []).forEach((inq) => out.push({ ...inq, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    const pages = singleInfinite.data?.pages ?? [];
    return pages.flatMap((p) => p.inquiries.map((inq) => ({ ...inq, _brand: activeProject })));
  }, [isAllBrands, multi, projects, singleInfinite.data, activeProject]);

  const loadMore = useCallback(() => {
    if (!isAllBrands && singleInfinite.hasNextPage && !singleInfinite.isFetchingNextPage) {
      void singleInfinite.fetchNextPage();
    }
  }, [isAllBrands, singleInfinite]);

  const filtered = useMemo(() => {
    if (tab === 'all') return inquiries;
    return inquiries.filter((i) => i.status === tab);
  }, [inquiries, tab]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, activeProject.companySlug, isAllBrands]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: inquiries.length,
      new: 0,
      in_review: 0,
      quoted: 0,
      won: 0,
      lost: 0,
    };
    for (const i of inquiries) c[i.status]++;
    return c;
  }, [inquiries]);

  const linkState = useMemo<LinkState>(
    () => ({
      from: location.search,
      ids: filtered.map((i) => ({ slug: i._brand.companySlug, id: i.id })),
    }),
    [filtered, location.search],
  );

  // Legacy `?inquiry=<slug>:<id>` links (dashboard, emails, notifications) redirect to the record page.
  const legacy = searchParams.get('inquiry');
  const legacyMatch = legacy ? /^(?:([a-z0-9_-]{2,63}):)?(\d+)$/.exec(legacy) : null;
  if (legacyMatch) {
    const [, slug, id] = legacyMatch;
    return (
      <Navigate
        replace
        to={inquiryPath((slug as CompanySlug | undefined) ?? activeProject.companySlug, Number(id))}
      />
    );
  }

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void singleInfinite.refetch();
  }

  const error = listError(firstError, t);

  const STATUS_TABS: { value: Filter; label: string }[] = [
    { value: 'all', label: t('inquiries.tabAll') },
    { value: 'new', label: t('inquiries.tabNew') },
    { value: 'in_review', label: t('inquiries.tabInReview') },
    { value: 'quoted', label: t('inquiries.tabQuoted') },
    { value: 'won', label: t('inquiries.tabWon') },
    { value: 'lost', label: t('inquiries.tabLost') },
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
        breadcrumb={[{ label: brandLabel }, { label: t('inquiries.title') }]}
        title={t('inquiries.title')}
        subtitle={t('inquiries.subtitleFor', { brand: brandLabel })}
        actions={<RefreshButton onClick={refreshAll} fetching={isFetching} />}
      />

      <div className="flex flex-col gap-4">
        <SegmentedControl
          value={tab}
          onValueChange={setTab}
          label={t('inquiries.statusFilter')}
          overflow="scroll"
          className="w-fit"
          options={STATUS_TABS.map((s) => ({ ...s, count: counts[s.value] }))}
        />

        {error ? <ErrorState error={error} onRetry={refreshAll} retrying={isFetching} /> : null}

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card">
            <LoadingState label={t('inquiries.loading')} />
          </div>
        ) : filtered.length === 0 ? (
          error ? null : (
            <EmptyState variant="dashed" icon={<Inbox />} message={t('inquiries.empty')} />
          )
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {filtered.length === 1
                ? t('inquiries.countSingular', { count: filtered.length })
                : t('inquiries.countPlural', { count: filtered.length })}
            </p>

            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
              {filtered.map((i) => (
                <InquiryMobileRow
                  key={`${i._brand.id}:${i.id}`}
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
              className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-36">{t('inquiries.colReceived')}</TableHead>
                    <TableHead>{t('inquiries.colCustomer')}</TableHead>
                    <TableHead>{t('inquiries.colRequest')}</TableHead>
                    {isAllBrands ? <TableHead>{t('inquiries.colBrand')}</TableHead> : null}
                    <TableHead>{t('inquiries.colStatus')}</TableHead>
                    <TableHead className="text-right">{t('inquiries.colAmount')}</TableHead>
                    <TableHead>{t('inquiries.colCallback')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => (
                    <InquiryTableRow
                      key={`${i._brand.id}:${i.id}`}
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

function CallbackOwnerBadge({
  owner,
  t,
}: {
  owner: ServiceInquiry['callbackOwner'];
  t: ReturnType<typeof useT>;
}) {
  if (!owner) return null;
  return (
    <Badge variant={owner === 'human' ? 'warning' : 'secondary'}>
      <Phone aria-hidden="true" />
      {owner === 'human' ? t('inquiries.callbackOwner.human') : t('inquiries.callbackOwner.ai')}
    </Badge>
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

function InquiryTableRow({
  row: i,
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
  const isNew = i.status === 'new';
  const contact = [i.email, i.phone].filter(Boolean).join(' · ');
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
          title={t('inquiries.openDetail')}
          className={cn(
            'block truncate text-foreground hover:underline',
            isNew ? 'font-semibold' : 'font-medium',
            ROW_LINK,
          )}
        >
          {i.name}
        </Link>
        {contact ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{contact}</p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-[22rem] py-2">
        <p className="truncate">{i.service ?? i.message}</p>
        {i.service ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{i.message}</p>
        ) : null}
      </TableCell>
      {showBrand ? (
        <TableCell className="py-2">
          <BrandChip brand={i._brand} />
        </TableCell>
      ) : null}
      <TableCell className="py-2">
        <Badge variant={STATUS_VARIANT[i.status]}>{t(STATUS_KEY[i.status] as never)}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
        {i.quotedAmount ? `${i.quotedAmount} €` : null}
      </TableCell>
      <TableCell className="py-2">
        <CallbackOwnerBadge owner={i.callbackOwner} t={t} />
      </TableCell>
    </TableRow>
  );
}

function InquiryMobileRow({
  row: i,
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
  const isNew = i.status === 'new';
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
          {i.name}
        </Link>
        <time
          dateTime={i.createdAt}
          className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      </div>
      <p className="truncate pl-3.5 text-xs text-muted-foreground">
        {i.service ? `${i.service} · ` : ''}
        {i.message}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 pl-3.5 pt-0.5">
        {showBrand ? <BrandChip brand={i._brand} /> : null}
        <Badge variant={STATUS_VARIANT[i.status]}>{t(STATUS_KEY[i.status] as never)}</Badge>
        <CallbackOwnerBadge owner={i.callbackOwner} t={t} />
        {i.quotedAmount ? (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {i.quotedAmount} €
          </span>
        ) : null}
      </div>
    </li>
  );
}
