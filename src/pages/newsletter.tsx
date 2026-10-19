import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Inbox, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CsvImportSheet } from '@/components/csv-import-sheet';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
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
import {
  errMessage,
  exportsAdminApi,
  newsletterAdminApi,
  type NewsletterSubscriber,
  ApiError,
} from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';

type SubscriberStatus = 'confirmed' | 'pending' | 'unsubscribed';

type Row = NewsletterSubscriber & { _brand: Project };

function statusOf(row: NewsletterSubscriber): SubscriberStatus {
  if (row.unsubscribedAt) return 'unsubscribed';
  if (row.confirmed) return 'confirmed';
  return 'pending';
}

const STATUS_KEY: Record<SubscriberStatus, string> = {
  confirmed: 'newsletter.statusConfirmed',
  pending: 'newsletter.statusPending',
  unsubscribed: 'newsletter.statusUnsubscribed',
};

const STATUS_TONE: Record<SubscriberStatus, 'success' | 'warning' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  unsubscribed: 'neutral',
};

export function NewsletterPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('newsletter.title'));
  const [tab, setTab] = useState<SubscriberStatus | 'all'>('all');
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [confirming, setConfirming] = useState<{
    companySlug: CompanySlug;
    id: number;
    email: string;
  } | null>(null);

  const PAGE_SIZE = 50;

  const singleInfinite = useInfiniteQuery({
    queryKey: ['newsletter-infinite', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      newsletterAdminApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['newsletter', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        newsletterAdminApi.list(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : singleInfinite.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : singleInfinite.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : singleInfinite.error;
  const allBrandsHasMore = isAllBrands && multi.some((q) => q.data?.nextCursor);

  const rows = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.subscribers ?? []).forEach((s) => out.push({ ...s, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    const pages = singleInfinite.data?.pages ?? [];
    return pages.flatMap((p) => p.subscribers.map((s) => ({ ...s, _brand: activeProject })));
  }, [isAllBrands, multi, projects, singleInfinite.data, activeProject]);

  const loadMore = useCallback(() => {
    if (!isAllBrands && singleInfinite.hasNextPage && !singleInfinite.isFetchingNextPage) {
      void singleInfinite.fetchNextPage();
    }
  }, [isAllBrands, singleInfinite]);

  const filtered = useMemo(
    () => (tab === 'all' ? rows : rows.filter((s) => statusOf(s) === tab)),
    [rows, tab],
  );

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tab, activeProject.companySlug, isAllBrands]);

  const counts = useMemo(() => {
    const c: Record<SubscriberStatus | 'all', number> = {
      all: rows.length,
      confirmed: 0,
      pending: 0,
      unsubscribed: 0,
    };
    for (const s of rows) c[statusOf(s)]++;
    return c;
  }, [rows]);

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
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void singleInfinite.refetch();
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

  const tabs: { value: SubscriberStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('newsletter.tabAll') },
    { value: 'confirmed', label: t('newsletter.tabConfirmed') },
    { value: 'pending', label: t('newsletter.tabPending') },
    { value: 'unsubscribed', label: t('newsletter.tabUnsubscribed') },
  ];

  const rowProps = (s: Row): SubscriberRowProps => ({
    row: s,
    status: statusOf(s),
    fullName: [s.firstName, s.lastName].filter(Boolean).join(' ') || null,
    created: formatDateTime(s.createdAt, bcp47, { dateStyle: 'short' }),
    showBrand: isAllBrands,
    deleting:
      deleteMutation.isPending &&
      deleteMutation.variables?.id === s.id &&
      deleteMutation.variables?.companySlug === s._brand.companySlug,
    onDelete: () => setConfirming({ companySlug: s._brand.companySlug, id: s.id, email: s.email }),
  });

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const errorState = errorMessage ? (
    <ErrorState error={new Error(errorMessage)} onRetry={refreshAll} retrying={isFetching} />
  ) : null;

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        breadcrumb={[{ label: brandLabel }, { label: t('newsletter.title') }]}
        title={t('newsletter.title')}
        subtitle={t('newsletter.subtitleFor', { brand: brandLabel })}
        actions={
          <>
            <ExportNewsletterButton />
            <CsvImportSheet
              companySlug={activeProject.companySlug}
              brandName={activeProject.name}
              i18nPrefix="newsletter"
              sampleHref="/admin/newsletter/import/sample"
              importFn={(cs, body) => newsletterAdminApi.import(cs, body)}
              onImported={refreshAll}
              requireConsentAttestation
              disabled={isAllBrands}
              disabledTitle={t('newsletter.importPickBrand')}
              headerChip={<BrandChip brand={activeProject} />}
            />
            <RefreshButton fetching={isFetching} onClick={refreshAll} />
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          label={t('newsletter.colStatus')}
          value={tab}
          onValueChange={setTab}
          overflow="scroll"
          className="sm:w-auto"
          options={tabs.map((tabItem) => ({
            value: tabItem.value,
            label: tabItem.label,
            count: counts[tabItem.value],
          }))}
        />
        {!isLoading ? (
          <p className="shrink-0 text-2sm tabular-nums text-muted-foreground">
            {filtered.length === 1
              ? t('newsletter.countSingular', { count: filtered.length })
              : t('newsletter.countPlural', { count: filtered.length })}
          </p>
        ) : null}
      </div>

      {errorState && rows.length > 0 ? errorState : null}

      {isLoading ? (
        <LoadingState label={t('newsletter.loading')} className="min-h-48" />
      ) : errorState && rows.length === 0 ? (
        errorState
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Inbox aria-hidden="true" />}
          message={rows.length > 0 ? t('newsletter.emptyFiltered') : t('newsletter.empty')}
        />
      ) : (
        // overflow-clip rounds the corners without becoming a scroll container, so the sticky header pins to the list box.
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div
            ref={listScrollRef}
            className="lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain"
          >
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((s) => (
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
                  <TableHead className="w-0">
                    <span className="sr-only">{t('newsletter.colActions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
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
                      <TableCell>{p.fullName ?? '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {s.source ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={t(STATUS_KEY[p.status] as never)}
                          tone={STATUS_TONE[p.status]}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {p.created}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <DeleteAction {...p} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {!isAllBrands ? (
              <InfiniteScrollSentinel
                hasMore={!!singleInfinite.hasNextPage}
                isLoading={singleInfinite.isFetchingNextPage}
                onIntersect={loadMore}
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
  status: SubscriberStatus;
  fullName: string | null;
  created: string;
  showBrand: boolean;
  deleting: boolean;
  onDelete: () => void;
}

function MailtoLink({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="block truncate rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {email}
    </a>
  );
}

function DeleteAction({ row, deleting, onDelete }: SubscriberRowProps) {
  const t = useT();
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
  const { row, status, fullName, created, showBrand } = props;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-2sm">
            <MailtoLink email={row.email} />
          </div>
          <StatusBadge label={t(STATUS_KEY[status] as never)} tone={STATUS_TONE[status]} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showBrand ? <BrandChip brand={row._brand} /> : null}
          {fullName ? <span>{fullName}</span> : null}
          {row.source ? <span>· {row.source}</span> : null}
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
