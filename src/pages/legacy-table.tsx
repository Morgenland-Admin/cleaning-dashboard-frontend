import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
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
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, errMessage, legacyRecordsAdminApi, type LegacyRecordRow } from '@/lib/api';
import { legacyRecordPath, pageCount } from '@/lib/legacy-records';
import { useDebounced } from '@/lib/use-debounced';
import { usePageTitle } from '@/lib/use-page-title';
import { formatNumber } from '@/lib/utils';
import { legacyDateTime, legacyRange, legacySourceLabel } from '@/pages/legacy-shared';

import type { ListNavState } from '@/lib/list-nav';

type T = ReturnType<typeof useT>;

const PAGE_SIZE = 50;

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export function LegacyTablePage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  const routeParams = useParams();
  const source = routeParams.source ?? '';
  const table = routeParams.table ?? '';
  usePageTitle(table || t('legacy.title'));

  // Search and page live in the URL so the record page's back link returns to the same view.
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : 1;
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function goToPage(n: number, replace = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (n > 1) next.set('page', String(n));
        else next.delete('page');
        return next;
      },
      { replace },
    );
    window.scrollTo({ top: 0 });
  }

  const enabled = !isAllBrands && source !== '' && table !== '';
  const summary = useQuery({
    queryKey: ['legacy-summary', slug] as const,
    queryFn: ({ signal }) => legacyRecordsAdminApi.summary(slug, signal),
    enabled,
  });
  const list = useQuery({
    queryKey: ['legacy-records', slug, source, table, q, page] as const,
    queryFn: ({ signal }) =>
      legacyRecordsAdminApi.list(
        slug,
        {
          source,
          table,
          q: q || undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
        signal,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

  const info = summary.data?.tables.find((r) => r.source === source && r.table === table);
  const tableTotal = info ? Number(info.count) : q === '' ? list.data?.total : undefined;
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);

  // A page past the end (rows deleted meanwhile) jumps to the last real page.
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && rows.length === 0 && total > 0 && page > pages) {
      goToPage(pages, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, list.isPlaceholderData, page, pages]);

  // Cache is dropped on unmount: removing still-observed pages would refetch the emptied table.
  const emptied = useRef(false);
  useEffect(() => {
    const flag = emptied;
    return () => {
      if (flag.current)
        queryClient.removeQueries({ queryKey: ['legacy-records', slug, source, table] });
    };
  }, [queryClient, slug, source, table]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const removeTable = useMutation({
    mutationFn: () => legacyRecordsAdminApi.removeTable(slug, source, table),
    onSuccess: ({ deleted }) => {
      toast.success(t('legacy.list.deletedAll', { table, n: formatNumber(deleted, bcp47) }));
      void queryClient.invalidateQueries({ queryKey: ['legacy-summary', slug] });
      emptied.current = true;
      navigate('/altdaten', { replace: true });
    },
    onError: (err) => {
      setConfirmOpen(false);
      toast.error(errMessage(err));
    },
  });

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const sourceLabel = legacySourceLabel(source, t);
  const listError = list.error
    ? list.error instanceof ApiError
      ? list.error
      : new Error(t('legacy.loadFailed'))
    : null;
  const linkState: ListNavState = {
    from: `${location.pathname}${location.search}`,
    ids: rows.map((r) => r.id),
  };
  const firstShown = (page - 1) * PAGE_SIZE + 1;
  const lastShown = (page - 1) * PAGE_SIZE + rows.length;

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        breadcrumb={[
          { label: brandLabel },
          { label: t('legacy.title'), to: '/altdaten' },
          { label: sourceLabel },
          { label: table },
        ]}
        title={<span className="[overflow-wrap:anywhere]">{table}</span>}
        meta={
          tableTotal !== undefined ? (
            <Badge variant="secondary" className="tabular-nums">
              {t('legacy.entries', { n: formatNumber(tableTotal, bcp47) })}
            </Badge>
          ) : null
        }
        subtitle={
          info
            ? `${sourceLabel} · ${legacyRange(info.firstAt, info.lastAt, bcp47, t)}`
            : sourceLabel
        }
        actions={
          isAllBrands ? null : (
            <>
              <RefreshButton
                fetching={list.isFetching}
                onClick={() => {
                  void list.refetch();
                  void summary.refetch();
                }}
              />
              <Button
                variant="outline-destructive"
                size="sm"
                disabled={!tableTotal}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 aria-hidden="true" />
                {t('legacy.list.deleteAll')}
              </Button>
            </>
          )
        }
      />

      {isAllBrands ? (
        <EmptyState
          variant="dashed"
          icon={<Archive aria-hidden="true" />}
          message={t('legacy.selectBrandFirst')}
        />
      ) : (
        <>
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('legacy.list.searchPlaceholder')}
            label={t('legacy.list.searchLabel')}
            searching={list.isFetching && q !== ''}
            containerClassName="sm:max-w-sm"
          />

          {list.isLoading ? (
            <LoadingState label={t('legacy.loading')} className="min-h-48" />
          ) : listError ? (
            <ErrorState
              error={listError}
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          ) : rows.length === 0 ? (
            q !== '' ? (
              <EmptyState
                variant="dashed"
                icon={<Archive aria-hidden="true" />}
                message={t('legacy.list.emptyFiltered')}
                action={
                  <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                    {t('legacy.list.resetSearch')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="dashed"
                icon={<Archive aria-hidden="true" />}
                message={t('legacy.list.empty')}
              />
            )
          ) : (
            <div className="overflow-clip rounded-lg border border-border bg-card">
              <ul className="divide-y divide-border md:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <RecordListItem row={row} state={linkState} t={t} bcp47={bcp47} />
                  </li>
                ))}
              </ul>

              <Table containerClassName="hidden w-full md:block">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('legacy.col.legacyId')}</TableHead>
                    <TableHead>{t('legacy.col.date')}</TableHead>
                    <TableHead>{t('legacy.col.preview')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <RecordTableRow key={row.id} row={row} state={linkState} t={t} bcp47={bcp47} />
                  ))}
                </TableBody>
              </Table>

              <nav
                aria-label={t('legacy.list.pageLabel')}
                className="flex items-center justify-between gap-3 border-t border-border px-4 py-2"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('legacy.list.range', {
                    from: formatNumber(firstShown, bcp47),
                    to: formatNumber(lastShown, bcp47),
                    total: formatNumber(total, bcp47),
                  })}
                </span>
                {pages > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="sm:size-8"
                      aria-label={t('legacy.list.prevPage')}
                      disabled={page <= 1}
                      onClick={() => goToPage(page - 1)}
                    >
                      <ChevronLeft aria-hidden="true" />
                    </Button>
                    <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
                      {t('legacy.list.pageOf', {
                        page: formatNumber(page, bcp47),
                        pages: formatNumber(pages, bcp47),
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="sm:size-8"
                      aria-label={t('legacy.list.nextPage')}
                      disabled={page >= pages || list.isPlaceholderData}
                      onClick={() => goToPage(page + 1)}
                    >
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </nav>
            </div>
          )}
        </>
      )}

      {confirmOpen ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !removeTable.isPending) setConfirmOpen(false);
          }}
          title={t('legacy.list.deleteAllTitle', { table })}
          description={t('legacy.list.deleteAllDescription', {
            n: formatNumber(tableTotal ?? 0, bcp47),
          })}
          confirmLabel={t('legacy.list.deleteAllConfirm')}
          isDangerous
          isPending={removeTable.isPending}
          requireText={{ value: table, label: t('legacy.list.typeToConfirm', { table }) }}
          onConfirm={() => removeTable.mutate()}
        />
      ) : null}
    </PageContainer>
  );
}

interface RowProps {
  row: LegacyRecordRow;
  state: ListNavState;
  t: T;
  bcp47: string;
}

function Preview({ row, t }: { row: LegacyRecordRow; t: T }) {
  return row.preview ? (
    <span title={row.preview}>{row.preview}</span>
  ) : (
    <span className="text-muted-foreground">{t('legacy.list.noPreview')}</span>
  );
}

function RecordTableRow({ row, state, t, bcp47 }: RowProps) {
  return (
    // Stretched link: the row is one click target and one tab stop.
    <TableRow className="relative">
      <TableCell className="max-w-[16rem]">
        <Link
          to={legacyRecordPath(row.id)}
          state={state}
          className={`block truncate font-mono text-xs font-medium text-foreground ${ROW_LINK}`}
        >
          {row.legacyId}
        </Link>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {row.legacyCreatedAt ? legacyDateTime(row.legacyCreatedAt, bcp47) : '—'}
      </TableCell>
      <TableCell className="w-full max-w-0">
        <span className="block truncate">
          <Preview row={row} t={t} />
        </span>
      </TableCell>
    </TableRow>
  );
}

function RecordListItem({ row, state, t, bcp47 }: RowProps) {
  return (
    <Link
      to={legacyRecordPath(row.id)}
      state={state}
      className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {row.legacyId}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {row.legacyCreatedAt ? legacyDateTime(row.legacyCreatedAt, bcp47) : '—'}
        </span>
      </span>
      <span className="line-clamp-2 break-words text-2sm text-foreground">
        <Preview row={row} t={t} />
      </span>
    </Link>
  );
}
