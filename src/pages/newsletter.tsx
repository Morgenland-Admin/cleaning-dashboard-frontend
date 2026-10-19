import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Inbox, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CsvImportSheet } from '@/components/csv-import-sheet';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject, type Project, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  errMessage,
  exportsAdminApi,
  newsletterAdminApi,
  type NewsletterCounts,
  type NewsletterStatus,
  type NewsletterSubscriber,
} from '@/lib/api';
import { contactEmail } from '@/lib/customer-display';
import { useDebounced } from '@/lib/use-debounced';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime, formatNumber } from '@/lib/utils';

type Tab = NewsletterStatus | 'all';
type Row = NewsletterSubscriber & { _brand: Project };
type T = ReturnType<typeof useT>;

const PAGE_SIZE = 50;

function statusOf(row: NewsletterSubscriber): NewsletterStatus {
  if (row.unsubscribedAt) return 'unsubscribed';
  if (row.confirmed) return 'confirmed';
  return 'pending';
}

const STATUS_KEY = {
  confirmed: 'newsletter.statusConfirmed',
  pending: 'newsletter.statusPending',
  unsubscribed: 'newsletter.statusUnsubscribed',
} as const;

const STATUS_TONE: Record<NewsletterStatus, 'success' | 'warning' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  unsubscribed: 'neutral',
};

const TABS = [
  { value: 'all', labelKey: 'newsletter.tabAll' },
  { value: 'confirmed', labelKey: 'newsletter.tabConfirmed' },
  { value: 'pending', labelKey: 'newsletter.tabPending' },
  { value: 'unsubscribed', labelKey: 'newsletter.tabUnsubscribed' },
] as const;

function sourceLabel(t: T, source: string | null): string | null {
  if (!source) return null;
  const key = `newsletter.sourceLabel.${source}`;
  const label = t(key as never);
  return label && label !== key ? label : source;
}

function sumCounts(list: Array<NewsletterCounts | null | undefined>): NewsletterCounts | null {
  const present = list.filter((c): c is NewsletterCounts => !!c);
  if (present.length === 0) return null;
  return present.reduce(
    (acc, c) => ({
      all: acc.all + c.all,
      confirmed: acc.confirmed + c.confirmed,
      pending: acc.pending + c.pending,
      unsubscribed: acc.unsubscribed + c.unsubscribed,
    }),
    { all: 0, confirmed: 0, pending: 0, unsubscribed: 0 },
  );
}

export function NewsletterPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('newsletter.title'));
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const q = search.trim() === '' ? '' : debounced;
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [confirming, setConfirming] = useState<{
    companySlug: CompanySlug;
    id: number;
    email: string;
  } | null>(null);

  const status = tab === 'all' ? undefined : tab;

  const single = useInfiniteQuery({
    queryKey: ['newsletter-infinite', activeProject.companySlug, tab, q] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      newsletterAdminApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam, status, q: q || undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['newsletter', p.companySlug, tab, q] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        newsletterAdminApi.list(
          p.companySlug,
          { limit: PAGE_SIZE, status, q: q || undefined },
          signal,
        ),
    })),
  });

  const isLoading = isAllBrands ? multi.some((m) => m.isLoading) : single.isLoading;
  const isFetching = isAllBrands ? multi.some((m) => m.isFetching) : single.isFetching;
  const firstError = isAllBrands ? multi.find((m) => m.error)?.error : single.error;
  const allBrandsHasMore = isAllBrands && multi.some((m) => m.data?.nextCursor);

  const counts = isAllBrands
    ? sumCounts(multi.map((m) => m.data?.counts))
    : (single.data?.pages[0]?.counts ?? null);

  const rows = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((m, i) => {
        const brand = projects[i];
        if (!brand) return;
        (m.data?.subscribers ?? []).forEach((s) => out.push({ ...s, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    return (single.data?.pages ?? []).flatMap((p) =>
      p.subscribers.map((s) => ({ ...s, _brand: activeProject })),
    );
  }, [isAllBrands, multi, projects, single.data, activeProject]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, q, activeProject.companySlug, isAllBrands]);

  const deleteMutation = useMutation({
    mutationFn: ({ companySlug, id }: { companySlug: CompanySlug; id: number }) =>
      newsletterAdminApi.delete(companySlug, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['newsletter-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['newsletter'] });
      setConfirming(null);
      toast.success(t('newsletter.deleted'));
    },
    onError: (err) => {
      setConfirming(null);
      toast.error(errMessage(err), t('common.error'));
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.forEach((m) => void m.refetch());
    else void single.refetch();
  }

  const errorMessage =
    firstError instanceof ApiError
      ? firstError.status === 401
        ? t('newsletter.errUnauthorized')
        : firstError.status === 403
          ? t('newsletter.errForbidden')
          : firstError.message
      : firstError
        ? t('newsletter.errGeneric')
        : null;

  const rowProps = (s: Row): SubscriberRowProps => ({
    row: s,
    status: statusOf(s),
    fullName: [s.firstName, s.lastName].filter(Boolean).join(' ') || null,
    created: formatDateTime(s.createdAt, bcp47, { dateStyle: 'short' }),
    source: sourceLabel(t, s.source),
    showBrand: isAllBrands,
    deleting:
      deleteMutation.isPending &&
      deleteMutation.variables?.id === s.id &&
      deleteMutation.variables?.companySlug === s._brand.companySlug,
    onDelete: canWrite
      ? () => setConfirming({ companySlug: s._brand.companySlug, id: s.id, email: s.email })
      : undefined,
  });

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const errorState = errorMessage ? (
    <ErrorState error={new Error(errorMessage)} onRetry={refreshAll} retrying={isFetching} />
  ) : null;
  const shownTotal = counts?.[tab];

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        breadcrumb={[{ label: brandLabel }, { label: t('newsletter.title') }]}
        title={t('newsletter.title')}
        subtitle={t('newsletter.subtitleFor', { brand: brandLabel })}
        actions={
          <>
            {canWrite ? <ExportNewsletterButton /> : null}
            {canWrite ? (
              <CsvImportSheet
                companySlug={activeProject.companySlug}
                brandName={activeProject.name}
                i18nPrefix="newsletter"
                sampleFileName="newsletter-import-sample.csv"
                importFn={(cs, body) => newsletterAdminApi.import(cs, body)}
                onImported={refreshAll}
                requireConsentAttestation
                disabled={isAllBrands}
                disabledTitle={t('newsletter.importPickBrand')}
                headerChip={<BrandChip brand={activeProject} />}
              />
            ) : null}
            <RefreshButton fetching={isFetching} onClick={refreshAll} />
          </>
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          label={t('newsletter.colStatus')}
          value={tab}
          onValueChange={setTab}
          overflow="scroll"
          className="lg:w-auto"
          options={TABS.map((item) => ({
            value: item.value,
            label: t(item.labelKey),
            count: counts?.[item.value],
          }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {shownTotal !== undefined ? (
            <p className="order-last shrink-0 text-2sm tabular-nums text-muted-foreground sm:order-first">
              {shownTotal === 1
                ? t('newsletter.countSingular', { count: formatNumber(shownTotal, bcp47) })
                : t('newsletter.countPlural', { count: formatNumber(shownTotal, bcp47) })}
            </p>
          ) : null}
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('newsletter.searchPlaceholder')}
            label={t('newsletter.searchLabel')}
            searching={search.trim() !== q || (isFetching && !single.isFetchingNextPage && !!q)}
            containerClassName="sm:w-72"
          />
        </div>
      </div>

      {errorState && rows.length > 0 ? errorState : null}

      {isLoading ? (
        <LoadingState label={t('newsletter.loading')} className="min-h-48" />
      ) : errorState && rows.length === 0 ? (
        errorState
      ) : rows.length === 0 ? (
        q ? (
          <EmptyState
            variant="dashed"
            icon={<Search aria-hidden="true" />}
            message={t('newsletter.searchEmpty', { query: q })}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                <X aria-hidden="true" />
                {t('common.clearSearch')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            variant="dashed"
            icon={<Inbox aria-hidden="true" />}
            message={tab === 'all' ? t('newsletter.empty') : t('newsletter.emptyFiltered')}
          />
        )
      ) : (
        // overflow-clip rounds the corners without becoming a scroll container, so the sticky header pins to the list box.
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div
            ref={listScrollRef}
            className="relative lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <ul className="divide-y divide-border md:hidden">
              {rows.map((s) => (
                <SubscriberListItem key={`${s._brand.id}:${s.id}`} {...rowProps(s)} />
              ))}
            </ul>

            <Table containerClassName="hidden w-full md:block">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('newsletter.colEmail')}</TableHead>
                  {isAllBrands ? <TableHead>{t('common.brand')}</TableHead> : null}
                  <TableHead>{t('newsletter.colName')}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t('newsletter.colSource')}
                  </TableHead>
                  <TableHead>{t('newsletter.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('newsletter.colCreated')}</TableHead>
                  {canWrite ? (
                    <TableHead className="w-0">
                      <span className="sr-only">{t('newsletter.colActions')}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const p = rowProps(s);
                  return (
                    <TableRow key={`${s._brand.id}:${s.id}`}>
                      <TableCell className="max-w-[22rem]">
                        <MailtoLink email={s.email} />
                      </TableCell>
                      {isAllBrands ? (
                        <TableCell>
                          <BrandChip brand={s._brand} />
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <SubscriberName {...p} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {p.source ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={t(STATUS_KEY[p.status])} tone={STATUS_TONE[p.status]} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {p.created}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="py-1.5 text-right">
                          <DeleteAction {...p} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {!isAllBrands ? (
              <InfiniteScrollSentinel
                hasMore={!!single.hasNextPage}
                isLoading={single.isFetchingNextPage}
                onIntersect={() => {
                  if (single.hasNextPage && !single.isFetchingNextPage) {
                    void single.fetchNextPage();
                  }
                }}
                // Root only where the box scrolls (lg+); otherwise the sentinel is always visible and loads every page.
                rootRef={isDesktop ? listScrollRef : undefined}
              />
            ) : null}
            {allBrandsHasMore ? (
              <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">
                {t('common.allBrandsHasMore')}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={t('newsletter.confirmDeleteTitle')}
        description={
          confirming ? t('newsletter.confirmDeleteBody', { email: confirming.email }) : ''
        }
        confirmLabel={t('newsletter.confirmDeleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (!confirming) return;
          deleteMutation.mutate({
            companySlug: confirming.companySlug,
            id: confirming.id,
          });
        }}
      />
    </PageContainer>
  );
}

interface SubscriberRowProps {
  row: Row;
  status: NewsletterStatus;
  fullName: string | null;
  created: string;
  source: string | null;
  showBrand: boolean;
  deleting: boolean;
  /** Omitted for read-only users. */
  onDelete?: () => void;
}

function MailtoLink({ email }: { email: string }) {
  const t = useT();
  const real = contactEmail(email);
  if (!real) {
    return <span className="text-muted-foreground">{t('emails.placeholderRecipient')}</span>;
  }
  return (
    <a
      href={`mailto:${real}`}
      className="block truncate rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {real}
    </a>
  );
}

/** Links to the customer record when the subscriber is linked and its brand is in view. */
function SubscriberName({ row, fullName, showBrand }: SubscriberRowProps) {
  const t = useT();
  if (row.customerId != null && !showBrand) {
    return (
      <Link
        to={`/customers/${row.customerId}`}
        className="rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={t('newsletter.openCustomer')}
      >
        {fullName ?? t('newsletter.openCustomer')}
      </Link>
    );
  }
  return <>{fullName ?? '—'}</>;
}

function DeleteAction({ row, deleting, onDelete }: SubscriberRowProps) {
  const t = useT();
  if (!onDelete) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={t('newsletter.deleteAria', { email: row.email })}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          loading={deleting}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('newsletter.delete')}</TooltipContent>
    </Tooltip>
  );
}

function SubscriberListItem(props: SubscriberRowProps) {
  const t = useT();
  const { row, status, fullName, created, source, showBrand } = props;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-2sm">
            <MailtoLink email={row.email} />
          </div>
          <StatusBadge label={t(STATUS_KEY[status])} tone={STATUS_TONE[status]} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showBrand ? <BrandChip brand={row._brand} /> : null}
          {fullName || row.customerId != null ? <SubscriberName {...props} /> : null}
          {source ? <span>· {source}</span> : null}
          <span className="tabular-nums">· {created}</span>
        </div>
      </div>
      <DeleteAction {...props} />
    </li>
  );
}

function ExportNewsletterButton() {
  const t = useT();
  const { activeProject, isAllBrands } = useProject();
  const [state, setState] = useState<'idle' | 'loading' | 'queued'>('idle');

  async function createExport() {
    if (isAllBrands || state === 'loading') return;
    setState('loading');
    try {
      await exportsAdminApi.create({
        companySlug: activeProject.companySlug,
        kind: 'newsletter',
      });
      setState('queued');
      setTimeout(() => setState('idle'), 4000);
    } catch (err) {
      toast.error(errMessage(err), t('common.error'));
      setState('idle');
    }
  }

  if (isAllBrands) {
    return (
      <Button variant="outline" size="sm" disabled title={t('newsletter.exportPickBrand')}>
        <Download aria-hidden="true" />
        {t('newsletter.export')}
      </Button>
    );
  }

  if (state === 'queued') {
    return (
      <Button variant="outline" size="sm" asChild className="text-success">
        <Link to="/exports">
          <CheckCircle2 aria-hidden="true" />
          {t('newsletter.exportQueued')}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={createExport} loading={state === 'loading'}>
      <Download aria-hidden="true" />
      {t('newsletter.export')}
    </Button>
  );
}
