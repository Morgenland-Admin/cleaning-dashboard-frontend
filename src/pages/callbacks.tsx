import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { ClipboardEdit, MapPin, Phone, PhoneCall, Trophy, Wrench, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SectionCard } from '@/components/section';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { errMessage, inquiriesApi, type HumanCallbackEntry, type InquiryStatus } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';
import {
  INBOX_PAGE_SIZE,
  TEXT_LINK,
  displayName,
  inquiryPath,
  inquiryStatusMeta,
  loadError,
  usableEmail,
  withParam,
  type BrandListState,
  type Translate,
} from '@/pages/inbox-shared';

type Row = HumanCallbackEntry & { _brand: Project };
type View = 'open' | 'all';
type QueuePage = Awaited<ReturnType<typeof inquiriesApi.humanCallbackQueue>>;

// Module-level so useQueries can memoise the combined result between renders.
function combineFirstPages(results: UseQueryResult<QueuePage>[]) {
  return {
    data: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    error: results.find((r) => r.error)?.error ?? null,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

function rowKey(companySlug: CompanySlug, id: number): string {
  return `${companySlug}:${id}`;
}

export function CallbacksPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('callbacks.title'));
  const now = useNow(60_000);
  const canWrite = useCanWrite();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get('view') === 'all' ? 'all' : 'open';
  const includeClosed = view === 'all';
  const slug = activeProject.companySlug;

  const single = useInfiniteQuery({
    queryKey: ['human-callbacks', slug, view] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      inquiriesApi.humanCallbackQueue(
        slug,
        { limit: INBOX_PAGE_SIZE, cursor: pageParam ?? undefined, includeClosed },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Never across a brand switch: rows are tagged with the brand in view.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === slug ? prev : undefined),
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['human-callbacks', p.companySlug, view, 'first'] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        inquiriesApi.humanCallbackQueue(
          p.companySlug,
          { limit: INBOX_PAGE_SIZE, includeClosed },
          signal,
        ),
    })),
    combine: combineFirstPages,
  });

  const isLoading = isAllBrands ? multi.isLoading : single.isLoading;
  const isFetching = isAllBrands ? multi.isFetching : single.isFetching;
  const firstError = isAllBrands ? multi.error : single.error;
  const allBrandsHasMore = isAllBrands && multi.data.some((d) => d?.nextCursor);
  const nextPageFailed = !isAllBrands && single.isFetchNextPageError;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (isAllBrands) {
      multi.data.forEach((data, i) => {
        const brand = projects[i];
        if (brand) data?.inquiries.forEach((c) => out.push({ ...c, _brand: brand }));
      });
      // Longest waiting first, across brands.
      return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    for (const page of single.data?.pages ?? []) {
      page.inquiries.forEach((c) => out.push({ ...c, _brand: activeProject }));
    }
    return out;
  }, [isAllBrands, multi.data, projects, single.data, activeProject]);

  const total = isAllBrands
    ? multi.data.every(Boolean)
      ? multi.data.reduce((sum, d) => sum + (d?.total ?? 0), 0)
      : undefined
    : (single.data?.pages[0]?.total ?? undefined);

  const [pending, setPending] = useState<Record<string, InquiryStatus>>({});

  const updateMutation = useMutation({
    mutationFn: (vars: { companySlug: CompanySlug; id: number; status: InquiryStatus }) =>
      inquiriesApi.update(vars.companySlug, vars.id, { status: vars.status }),
    onMutate: (vars) => {
      setPending((p) => ({ ...p, [rowKey(vars.companySlug, vars.id)]: vars.status }));
    },
    onSuccess: () => {
      for (const key of [
        'human-callbacks',
        'inquiries-infinite',
        'inquiries',
        'inquiries-counts',
        'inquiry-detail',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('callbacks.updateFailed'),
        description: errMessage(err),
      });
    },
    onSettled: (_data, _err, vars) => {
      setPending((p) => {
        const next = { ...p };
        delete next[rowKey(vars.companySlug, vars.id)];
        return next;
      });
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.refetch();
    else void single.refetch();
  }

  const error = loadError(firstError, t, 'inquiries');
  const linkState: BrandListState = {
    from: `${location.pathname}${location.search}`,
    ids: rows.map((r) => ({ slug: r._brand.companySlug, id: r.id })),
  };
  const rowProps = (c: Row): RowProps => {
    const key = rowKey(c._brand.companySlug, c.id);
    return {
      row: c,
      now,
      t,
      bcp47,
      showBrand: isAllBrands,
      showStatus: includeClosed,
      linkState,
      canWrite,
      pendingStatus: pending[key] ?? null,
      onStatusChange: (status) =>
        updateMutation.mutate({ companySlug: c._brand.companySlug, id: c.id, status }),
    };
  };

  const sentinel = isAllBrands ? null : (
    <InfiniteScrollSentinel
      hasMore={!!single.hasNextPage}
      isLoading={single.isFetchingNextPage}
      onIntersect={() => {
        if (!single.isFetchingNextPage) void single.fetchNextPage();
      }}
    />
  );

  return (
    <PageContainer>
      <PageHeading
        breadcrumb={[
          { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
          { label: t('callbacks.title') },
        ]}
        title={t('callbacks.title')}
        subtitle={t('callbacks.subtitle')}
        actions={<RefreshButton onClick={refreshAll} fetching={isFetching} />}
      />

      <div className="flex flex-col gap-4">
        <SegmentedControl
          label={t('callbacks.filterLabel')}
          value={view}
          onValueChange={(next) =>
            setSearchParams((prev) => withParam(prev, 'view', next === 'all' ? 'all' : null), {
              replace: true,
            })
          }
          className="w-fit"
          options={[
            { value: 'open', label: t('callbacks.tabOpen') },
            { value: 'all', label: t('callbacks.tabAll') },
          ]}
        />

        {error && rows.length > 0 && !nextPageFailed ? (
          <ErrorState error={error} onRetry={refreshAll} retrying={isFetching} />
        ) : null}

        <SectionCard
          title={includeClosed ? t('callbacks.listTitleAll') : t('callbacks.listTitle')}
          icon={<PhoneCall />}
          description={
            total === undefined
              ? undefined
              : total === 1
                ? t('callbacks.countSingular', { count: total })
                : t('callbacks.countPlural', { count: total })
          }
          actions={
            <Badge variant="warning">
              <Phone aria-hidden="true" />
              {t('callbacks.flag')}
            </Badge>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {isLoading ? (
            <LoadingState label={t('callbacks.loading')} />
          ) : error && rows.length === 0 ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={refreshAll} retrying={isFetching} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<PhoneCall />}
              message={includeClosed ? t('callbacks.emptyAll') : t('callbacks.empty')}
            />
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {rows.map((c) => (
                  <CallbackMobileRow key={rowKey(c._brand.companySlug, c.id)} {...rowProps(c)} />
                ))}
              </ul>
              <Table containerClassName="hidden w-full overflow-x-auto md:block">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('callbacks.colName')}</TableHead>
                    <TableHead>{t('callbacks.colContact')}</TableHead>
                    <TableHead>{t('callbacks.colReason')}</TableHead>
                    {includeClosed ? <TableHead>{t('callbacks.colStatus')}</TableHead> : null}
                    <TableHead className="text-right">{t('callbacks.colWaiting')}</TableHead>
                    {canWrite ? (
                      <TableHead className="text-right">{t('callbacks.colActions')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <CallbackTableRow key={rowKey(c._brand.companySlug, c.id)} {...rowProps(c)} />
                  ))}
                </TableBody>
              </Table>
              {sentinel}
            </>
          )}
        </SectionCard>

        {allBrandsHasMore ? (
          <p className="text-center text-xs text-muted-foreground">
            {t('common.allBrandsHasMore')}
          </p>
        ) : null}
        {nextPageFailed && error ? (
          <ErrorState
            error={error}
            onRetry={() => void single.fetchNextPage()}
            retrying={single.isFetchingNextPage}
          />
        ) : null}
      </div>
    </PageContainer>
  );
}

type RowProps = {
  row: Row;
  now: number;
  t: Translate;
  bcp47: string;
  showBrand: boolean;
  showStatus: boolean;
  linkState: BrandListState;
  canWrite: boolean;
  onStatusChange: (status: InquiryStatus) => void;
  pendingStatus: InquiryStatus | null;
};

function NameLink({ row, t, linkState }: Pick<RowProps, 'row' | 't' | 'linkState'>) {
  return (
    <Link
      to={inquiryPath(row._brand.companySlug, row.id)}
      state={linkState}
      title={t('callbacks.openInquiry')}
      className="truncate rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {displayName(t, row)}
    </Link>
  );
}

function ContactLinks({ row, t }: { row: Row; t: Translate }) {
  const email = usableEmail(row.email);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {row.phone ? (
        <a
          href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}
          className={cn(
            TEXT_LINK,
            'inline-flex min-h-10 items-center gap-1 font-medium md:min-h-6',
          )}
        >
          <Phone className="size-3" aria-hidden="true" />
          <span className="tabular-nums">{row.phone}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Phone className="size-3" aria-hidden="true" />
          {t('callbacks.noPhone')}
        </span>
      )}
      {email ? (
        <a href={`mailto:${email}`} className={cn(TEXT_LINK, 'truncate text-xs')}>
          {email}
        </a>
      ) : null}
    </div>
  );
}

function Reason({ row }: { row: Row }) {
  return (
    <div className="min-w-0">
      <p className={cn('line-clamp-2 break-words', row.callReason && 'font-medium')}>
        {row.callReason || row.message}
      </p>
      {row.plz || row.service ? (
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {row.plz ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MapPin className="size-3" aria-hidden="true" />
              {row.plz}
            </span>
          ) : null}
          {row.service ? (
            <span className="inline-flex items-center gap-1">
              <Wrench className="size-3" aria-hidden="true" />
              {row.service}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Waiting({ row, now, t, bcp47 }: Pick<RowProps, 'row' | 'now' | 't' | 'bcp47'>) {
  return (
    <time
      dateTime={row.createdAt}
      title={formatDateTime(row.createdAt, bcp47)}
      className="whitespace-nowrap tabular-nums text-muted-foreground"
    >
      {formatWaiting(row.createdAt, now, t, bcp47)}
    </time>
  );
}

function StatusCell({ row, t }: Pick<RowProps, 'row' | 't'>) {
  const status = inquiryStatusMeta(t, row.status);
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

function RowActions({
  row,
  t,
  onStatusChange,
  pendingStatus,
  size = 'xs',
}: Pick<RowProps, 'row' | 't' | 'onStatusChange' | 'pendingStatus'> & {
  size?: 'xs' | 'default';
}) {
  const isUpdating = pendingStatus !== null;
  const closed = row.status === 'won' || row.status === 'lost';
  return (
    <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
      <Button
        size={size}
        variant="outline"
        disabled={isUpdating || row.status === 'in_review' || closed}
        aria-pressed={row.status === 'in_review'}
        loading={pendingStatus === 'in_review'}
        onClick={() => onStatusChange('in_review')}
        className={cn(
          row.status === 'in_review' &&
            'border-primary/40 bg-primary-soft text-primary disabled:opacity-100',
        )}
      >
        <ClipboardEdit aria-hidden="true" />
        {t('callbacks.actions.reached')}
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={isUpdating || row.status === 'won'}
        loading={pendingStatus === 'won'}
        onClick={() => onStatusChange('won')}
      >
        <Trophy aria-hidden="true" />
        {t('inquiries.actions.won')}
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={isUpdating || row.status === 'lost'}
        loading={pendingStatus === 'lost'}
        onClick={() => onStatusChange('lost')}
      >
        <XCircle aria-hidden="true" />
        {t('inquiries.actions.lost')}
      </Button>
    </div>
  );
}

function CallbackTableRow(props: RowProps) {
  const { row, t, showBrand, showStatus, canWrite } = props;
  return (
    <TableRow>
      <TableCell className="max-w-[14rem] py-2">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <NameLink {...props} />
          {showBrand ? <BrandChip brand={row._brand} /> : null}
        </div>
      </TableCell>
      <TableCell className="max-w-[14rem] py-2">
        <ContactLinks row={row} t={t} />
      </TableCell>
      <TableCell className="max-w-[24rem] py-2">
        <Reason row={row} />
      </TableCell>
      {showStatus ? (
        <TableCell className="py-2">
          <StatusCell row={row} t={t} />
        </TableCell>
      ) : null}
      <TableCell className="py-2 text-right">
        <Waiting {...props} />
      </TableCell>
      {canWrite ? (
        <TableCell className="py-2">
          <RowActions {...props} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function CallbackMobileRow(props: RowProps) {
  const { row, t, showBrand, showStatus, canWrite } = props;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <NameLink {...props} />
        {showBrand ? <BrandChip brand={row._brand} /> : null}
        {showStatus ? <StatusCell row={row} t={t} /> : null}
        <span className="ml-auto shrink-0 text-xs">
          <Waiting {...props} />
        </span>
      </div>
      <ContactLinks row={row} t={t} />
      <div className="text-2sm">
        <Reason row={row} />
      </div>
      {canWrite ? <RowActions {...props} size="default" /> : null}
    </li>
  );
}

function formatWaiting(iso: string, now: number, t: Translate, bcp47: string) {
  const date = new Date(iso);
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return t('contacts.timeNow');
  if (minutes < 60) return t('contacts.timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('contacts.timeHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('contacts.timeDays', { n: days });
  return formatShortDate(date, bcp47);
}
