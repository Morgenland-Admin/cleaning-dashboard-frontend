import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useUrlSearch as useSharedUrlSearch } from '@/lib/use-url-search';
import { INBOX_PAGE_SIZE } from '@/pages/inbox-shared';

import type { InboxCounts, InboxListFilters } from '@/lib/api';

type Page<R> = { rows: R[]; nextCursor: string | null };
type PageOpts = InboxListFilters & { limit: number; cursor?: string };

export type BrandRow<R> = R & { _brand: Project };

// Module-level so useQueries can memoise the combined result between renders.
function combinePages<R>(results: UseQueryResult<Page<R>>[]) {
  return {
    data: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    isPlaceholderData: results.some((r) => r.isPlaceholderData),
    error: results.find((r) => r.error)?.error ?? null,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

function sumCounts(results: UseQueryResult<InboxCounts>[]): InboxCounts | null {
  if (results.length === 0) return null;
  const sum: InboxCounts = { byStatus: {}, bySource: {} };
  for (const r of results) {
    if (!r.data) return null;
    for (const [k, n] of Object.entries(r.data.byStatus))
      sum.byStatus[k] = (sum.byStatus[k] ?? 0) + n;
    for (const [k, n] of Object.entries(r.data.bySource))
      sum.bySource[k] = (sum.bySource[k] ?? 0) + n;
  }
  return sum;
}

/**
 * One brand: infinite pages + server counts. All brands: the first page of each brand merged
 * newest first, counts summed (the page says when a brand has more).
 */
export function useInboxList<R extends { id: number; createdAt: string }>({
  key,
  filters,
  fetchPage,
  fetchCounts,
}: {
  key: string;
  filters: { status: string; q: string; source: string };
  fetchPage: (slug: CompanySlug, opts: PageOpts, signal?: AbortSignal) => Promise<Page<R>>;
  fetchCounts: (
    slug: CompanySlug,
    opts: InboxListFilters,
    signal?: AbortSignal,
  ) => Promise<InboxCounts>;
}) {
  const { activeProject, projects, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  const f: InboxListFilters = {
    status: filters.status === 'all' ? undefined : filters.status,
    q: filters.q || undefined,
    source: filters.source || undefined,
  };
  const fKey = [f.status ?? 'all', f.q ?? '', f.source ?? ''] as const;

  const single = useInfiniteQuery({
    queryKey: [`${key}-infinite`, slug, ...fKey] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchPage(slug, { ...f, limit: INBOX_PAGE_SIZE, cursor: pageParam ?? undefined }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Keep the old rows while a filter changes, never across a brand switch (links would point at the wrong brand).
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === slug ? prev : undefined),
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: [key, p.companySlug, ...fKey] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchPage(p.companySlug, { ...f, limit: INBOX_PAGE_SIZE }, signal),
      placeholderData: keepPreviousData,
    })),
    combine: combinePages<R>,
  });

  const countBrands = isAllBrands ? projects : [activeProject];
  const counts = useQueries({
    queries: countBrands.map((p) => ({
      queryKey: [`${key}-counts`, p.companySlug, ...fKey] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchCounts(p.companySlug, f, signal),
      placeholderData: keepPreviousData,
    })),
    combine: sumCounts,
  });

  const rows = useMemo<BrandRow<R>[]>(() => {
    if (!isAllBrands) {
      return (single.data?.pages ?? []).flatMap((p) =>
        p.rows.map((r) => ({ ...r, _brand: activeProject })),
      );
    }
    const out: BrandRow<R>[] = [];
    multi.data.forEach((page, i) => {
      const brand = projects[i];
      if (brand) page?.rows.forEach((r) => out.push({ ...r, _brand: brand }));
    });
    return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [isAllBrands, single.data, multi.data, projects, activeProject]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = single;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refetchSingle = single.refetch;
  const refetchMulti = multi.refetch;
  const refetch = useCallback(() => {
    if (isAllBrands) refetchMulti();
    else void refetchSingle();
  }, [isAllBrands, refetchMulti, refetchSingle]);

  return {
    rows,
    counts,
    isAllBrands,
    isLoading: isAllBrands ? multi.isLoading : single.isLoading,
    isFetching: isAllBrands ? multi.isFetching : single.isFetching,
    isPlaceholderData: isAllBrands ? multi.isPlaceholderData : single.isPlaceholderData,
    error: isAllBrands ? multi.error : single.error,
    nextPageFailed: !isAllBrands && single.isFetchNextPageError,
    hasMore: !isAllBrands && !!hasNextPage,
    isFetchingNextPage,
    loadMore,
    refetch,
    allBrandsHasMore: isAllBrands && multi.data.some((p) => !!p?.nextCursor),
  };
}

/** Sum of the given statuses, or undefined while counts load. */
export function countOf(
  counts: InboxCounts | null,
  statuses: readonly string[] | 'all',
): number | undefined {
  if (!counts) return undefined;
  const entries = Object.entries(counts.byStatus);
  return entries
    .filter(([k]) => statuses === 'all' || statuses.includes(k))
    .reduce((sum, [, n]) => sum + n, 0);
}

/** Search box state, debounced into `?q=` so back from a record restores it. */
export function useUrlSearch() {
  const { input, setInput, query, searching } = useSharedUrlSearch('q');
  return { search: input, setSearch: setInput, q: query, searching };
}
