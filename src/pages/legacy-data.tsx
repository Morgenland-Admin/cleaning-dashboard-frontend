import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Archive, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { SectionCard } from '@/components/section';
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
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  legacyRecordsAdminApi,
  type LegacyRecordRow,
  type LegacyTableSummary,
} from '@/lib/api';
import {
  groupLegacyTables,
  isKnownLegacySource,
  legacyRecordPath,
  legacyTablePath,
  type LegacySourceGroup,
} from '@/lib/legacy-records';
import { usePageTitle } from '@/lib/use-page-title';
import { formatNumber } from '@/lib/utils';
import { legacyDateTime, legacyRange, legacySourceLabel } from '@/pages/legacy-shared';

import type { ListNavState } from '@/lib/list-nav';

type T = ReturnType<typeof useT>;

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';
const SEARCH_PAGE = 50;
const MIN_SEARCH = 2;

export function LegacyDataPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands, projects, setBrandView } = useProject();
  const slug = activeProject.companySlug;
  usePageTitle(t('legacy.title'));

  // The submitted term lives in the URL (⌘K links here, the record page links back).
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
  }

  const summary = useQuery({
    queryKey: ['legacy-summary', slug] as const,
    queryFn: ({ signal }) => legacyRecordsAdminApi.summary(slug, signal),
    enabled: !isAllBrands,
  });
  const groups = useMemo(() => groupLegacyTables(summary.data?.tables ?? []), [summary.data]);
  const total = groups.reduce((n, g) => n + g.total, 0);

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const error = summary.error
    ? summary.error instanceof ApiError
      ? summary.error
      : new Error(t('legacy.loadFailed'))
    : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = draft.trim();
    if (term.length > 0 && term.length < MIN_SEARCH) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (term) next.set('q', term);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  function clear() {
    setDraft('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <PageContainer width="full" className="gap-5">
      <PageHeading
        className="mb-0"
        breadcrumb={[{ label: brandLabel }, { label: t('legacy.title') }]}
        title={t('legacy.title')}
        meta={
          summary.data && total > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {t('legacy.entries', { n: formatNumber(total, bcp47) })}
            </Badge>
          ) : null
        }
        subtitle={t('legacy.subtitle', { brand: brandLabel })}
        actions={
          isAllBrands ? null : (
            <RefreshButton fetching={summary.isFetching} onClick={() => void summary.refetch()} />
          )
        }
      />

      {isAllBrands ? (
        <EmptyState
          variant="dashed"
          icon={<Archive aria-hidden="true" />}
          message={t('legacy.selectBrandFirst')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {projects.map((p) => (
                <Button
                  key={p.companySlug}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBrandView(p.companySlug)}
                >
                  <BrandMark brand={p} size="xs" />
                  {p.name}
                </Button>
              ))}
            </div>
          }
        />
      ) : summary.isLoading ? (
        <LoadingState label={t('legacy.loading')} className="min-h-48" />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Archive aria-hidden="true" />}
          message={t('legacy.empty', { brand: brandLabel })}
        />
      ) : (
        <>
          <form
            role="search"
            aria-label={t('legacy.search.label')}
            onSubmit={submit}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <SearchInput
              value={draft}
              onValueChange={(v) => (v === '' ? clear() : setDraft(v))}
              placeholder={t('legacy.search.placeholder')}
              label={t('legacy.search.label')}
              containerClassName="sm:max-w-md"
              enterKeyHint="search"
            />
            <Button type="submit" variant="outline" disabled={draft.trim().length < MIN_SEARCH}>
              <Search aria-hidden="true" />
              {t('legacy.search.submit')}
            </Button>
          </form>

          {q.length >= MIN_SEARCH ? <SearchResults slug={slug} q={q} t={t} bcp47={bcp47} /> : null}

          {groups.map((group) => (
            <SourceSection key={group.source} group={group} t={t} bcp47={bcp47} />
          ))}
        </>
      )}
    </PageContainer>
  );
}

function SearchResults({ slug, q, t, bcp47 }: { slug: string; q: string; t: T; bcp47: string }) {
  const location = useLocation();
  const search = useInfiniteQuery({
    queryKey: ['legacy-search', slug, q] as const,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      legacyRecordsAdminApi.search(slug, { q, limit: SEARCH_PAGE, offset: pageParam }, signal),
    getNextPageParam: (last, all) => (last.hasMore ? all.length * SEARCH_PAGE : undefined),
  });
  const rows = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);
  const state: ListNavState = {
    from: `${location.pathname}${location.search}`,
    ids: rows.map((r) => r.id),
  };

  return (
    <SectionCard
      title={t('legacy.search.resultsTitle', { q })}
      description={search.isLoading ? undefined : t('legacy.search.resultsHint')}
      actions={
        rows.length > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            {search.hasNextPage
              ? t('legacy.search.countMore', { n: formatNumber(rows.length, bcp47) })
              : formatNumber(rows.length, bcp47)}
          </Badge>
        ) : null
      }
      className="overflow-clip"
      bodyClassName="p-0 sm:p-0"
    >
      {search.isLoading ? (
        <LoadingState label={t('legacy.search.searching')} />
      ) : search.error ? (
        <div className="p-4">
          <ErrorState
            error={search.error}
            onRetry={() => void search.refetch()}
            retrying={search.isFetching}
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState size="sm" message={t('legacy.search.empty')} />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id}>
                <SearchHitRow row={row} state={state} t={t} bcp47={bcp47} />
              </li>
            ))}
          </ul>
          <InfiniteScrollSentinel
            hasMore={!!search.hasNextPage}
            isLoading={search.isFetchingNextPage}
            onIntersect={() => {
              if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
            }}
          />
        </>
      )}
    </SectionCard>
  );
}

function SearchHitRow({
  row,
  state,
  t,
  bcp47,
}: {
  row: LegacyRecordRow;
  state: ListNavState;
  t: T;
  bcp47: string;
}) {
  return (
    <Link
      to={legacyRecordPath(row.id)}
      state={state}
      className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
    >
      <span className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-2sm font-medium text-foreground">{row.legacyTable}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">#{row.legacyId}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {row.legacyCreatedAt ? legacyDateTime(row.legacyCreatedAt, bcp47) : t('legacy.noDate')}
        </span>
      </span>
      <span className="line-clamp-2 break-words text-xs text-muted-foreground">
        {row.preview || t('legacy.list.noPreview')}
      </span>
    </Link>
  );
}

function SourceSection({ group, t, bcp47 }: { group: LegacySourceGroup; t: T; bcp47: string }) {
  return (
    <SectionCard
      title={legacySourceLabel(group.source, t)}
      description={
        isKnownLegacySource(group.source) ? t(`legacy.sourceHint.${group.source}`) : undefined
      }
      actions={
        <Badge variant="secondary" className="tabular-nums">
          {t('legacy.entries', { n: formatNumber(group.total, bcp47) })}
        </Badge>
      }
      className="overflow-clip"
      bodyClassName="p-0 sm:p-0"
    >
      <ul className="divide-y divide-border md:hidden">
        {group.tables.map((row) => (
          <li key={row.table}>
            <Link
              to={legacyTablePath(row.source, row.table)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-2sm font-medium text-foreground">{row.table}</span>
                  <span className="shrink-0 text-2sm tabular-nums text-foreground">
                    {formatNumber(Number(row.count), bcp47)}
                  </span>
                </span>
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {legacyRange(row.firstAt, row.lastAt, bcp47, t)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <Table containerClassName="hidden w-full md:block">
        <TableHeader>
          <TableRow>
            <TableHead>{t('legacy.col.table')}</TableHead>
            <TableHead className="text-right">{t('legacy.col.count')}</TableHead>
            <TableHead>{t('legacy.col.range')}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{t('legacy.col.open')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.tables.map((row) => (
            <SummaryRow key={row.table} row={row} t={t} bcp47={bcp47} />
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function SummaryRow({ row, t, bcp47 }: { row: LegacyTableSummary; t: T; bcp47: string }) {
  return (
    // Stretched link: the row is one click target and one tab stop.
    <TableRow className="relative">
      <TableCell className="w-full max-w-0">
        <Link
          to={legacyTablePath(row.source, row.table)}
          className={`block truncate font-medium text-foreground ${ROW_LINK}`}
        >
          {row.table}
        </Link>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {formatNumber(Number(row.count), bcp47)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {legacyRange(row.firstAt, row.lastAt, bcp47, t)}
      </TableCell>
      <TableCell className="w-10 text-right">
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </TableCell>
    </TableRow>
  );
}
