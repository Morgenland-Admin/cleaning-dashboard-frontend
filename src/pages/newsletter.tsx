import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  Mail,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CsvImportSheet } from '@/components/csv-import-sheet';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject, type Project, type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  exportsAdminApi,
  newsletterAdminApi,
  type NewsletterSubscriber,
  ApiError,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

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

const STATUS_VARIANT: Record<SubscriberStatus, 'default' | 'success' | 'warning' | 'secondary'> = {
  confirmed: 'success',
  pending: 'warning',
  unsubscribed: 'secondary',
};

export function NewsletterPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('newsletter.title'));
  const [tab, setTab] = useState<SubscriberStatus | 'all'>('all');
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
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['newsletter-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['newsletter'] });
      void id;
      setConfirming(null);
    },
    onError: () => setConfirming(null),
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span>/</span>
          <span className="text-foreground">{t('newsletter.title')}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('newsletter.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('newsletter.subtitleFor', {
                brand: isAllBrands ? t('brandFilter.allBrands') : activeProject.name,
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportNewsletterButton />
            <CsvImportSheet
              companySlug={activeProject.companySlug}
              brandName={activeProject.name}
              i18nPrefix="newsletter"
              sampleHref="/admin/newsletter/import/sample"
              importFn={(cs, body) => newsletterAdminApi.import(cs, body)}
              onImported={refreshAll}
              disabled={isAllBrands}
              disabledTitle={t('newsletter.importPickBrand')}
              headerChip={
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <BrandMark brand={activeProject} size="xs" />
                  <span>{activeProject.shortName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('newsletter.import')}</span>
                </div>
              }
            />
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
              <RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />
              {t('newsletter.refresh')}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SubscriberStatus | 'all')}>
        <TabsList className="flex-wrap">
          {tabs.map((tabItem) => {
            const active = tab === tabItem.value;
            return (
              <TabsTrigger key={tabItem.value} value={tabItem.value} className="gap-1.5">
                {tabItem.label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    active
                      ? 'bg-rust/15 text-rust'
                      : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {counts[tabItem.value]}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('newsletter.title')}</CardTitle>
          <CardDescription>
            {filtered.length === 1
              ? t('newsletter.countSingular', { count: filtered.length })
              : t('newsletter.countPlural', { count: filtered.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('newsletter.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Inbox className="size-6 opacity-50" />
              <span>{t('newsletter.empty')}</span>
            </div>
          ) : (
            <Table>
              <TableHeader className="border-y border-border/70 bg-muted/30 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <TableRow>
                  <TableHead className="py-2.5 sm:px-6">{t('newsletter.colEmail')}</TableHead>
                  <TableHead className="hidden px-5 py-2.5 sm:table-cell">
                    {t('brandFilter.title')}
                  </TableHead>
                  <TableHead className="hidden px-5 py-2.5 md:table-cell">
                    {t('newsletter.colName')}
                  </TableHead>
                  <TableHead className="hidden px-5 py-2.5 lg:table-cell">
                    {t('newsletter.colSource')}
                  </TableHead>
                  <TableHead className="py-2.5 sm:px-5">{t('newsletter.colStatus')}</TableHead>
                  <TableHead className="hidden px-5 py-2.5 text-right sm:table-cell">
                    {t('newsletter.colCreated')}
                  </TableHead>
                  <TableHead className="py-2.5 text-right sm:px-5">
                    <span className="sr-only">{t('newsletter.colActions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const status = statusOf(s);
                  const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || null;
                  const isThisDeleting =
                    deleteMutation.isPending &&
                    deleteMutation.variables?.id === s.id &&
                    deleteMutation.variables?.companySlug === s._brand.companySlug;
                  return (
                    <TableRow key={`${s._brand.id}:${s.id}`}>
                      <TableCell className="sm:px-6">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rust/10 text-rust">
                            <Mail className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <a
                              href={`mailto:${s.email}`}
                              className="truncate font-medium text-primary hover:underline"
                            >
                              {s.email}
                            </a>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                              <BrandChip brand={s._brand} />
                              {fullName ? <span>{fullName}</span> : null}
                              {s.source ? <span>· {s.source}</span> : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-5 sm:table-cell">
                        <BrandChip brand={s._brand} />
                      </TableCell>
                      <TableCell className="hidden px-5 text-sm md:table-cell">
                        {fullName ?? '—'}
                      </TableCell>
                      <TableCell className="hidden px-5 text-xs text-muted-foreground lg:table-cell">
                        {s.source ?? '—'}
                      </TableCell>
                      <TableCell className="sm:px-5">
                        <Badge variant={STATUS_VARIANT[status]}>
                          {t(STATUS_KEY[status] as never)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden px-5 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                        {formatDateTime(s.createdAt, bcp47, {
                          dateStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell className="text-right sm:px-5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setConfirming({
                              companySlug: s._brand.companySlug,
                              id: s.id,
                              email: s.email,
                            })
                          }
                          aria-label={t('newsletter.delete')}
                          className="text-destructive hover:text-destructive"
                          disabled={isThisDeleting}
                        >
                          {isThisDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!isAllBrands ? (
            <InfiniteScrollSentinel
              hasMore={!!singleInfinite.hasNextPage}
              isLoading={singleInfinite.isFetchingNextPage}
              onIntersect={loadMore}
            />
          ) : null}
          {allBrandsHasMore ? (
            <div className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
              {t('common.allBrandsHasMore')}
            </div>
          ) : null}
        </CardContent>
      </Card>

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
    </div>
  );
}

function BrandChip({ brand }: { brand: Project }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <BrandMark brand={brand} size="sm" />
      <span className="text-xs">{brand.shortName}</span>
    </span>
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
      toast.error((err as Error).message);
      setState('idle');
    }
  }

  if (isAllBrands) {
    return (
      <Button variant="outline" size="sm" disabled title={t('newsletter.exportPickBrand')}>
        <Download className="size-3.5" />
        {t('newsletter.export')}
      </Button>
    );
  }

  if (state === 'queued') {
    return (
      <Button variant="outline" size="sm" asChild className="text-success">
        <Link to="/exports">
          <CheckCircle2 className="size-3.5" />
          {t('newsletter.exportQueued')}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={createExport} disabled={state === 'loading'}>
      {state === 'loading' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5" />
      )}
      {t('newsletter.export')}
    </Button>
  );
}
