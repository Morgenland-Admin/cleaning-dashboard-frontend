import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  Mail,
  RefreshCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject, type Project, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  exportsAdminApi,
  newsletterAdminApi,
  type NewsletterSubscriber,
  type NewsletterImportSummary,
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
            <ImportNewsletterButton onImported={refreshAll} />
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border/70 bg-muted/30 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold sm:px-6">
                      {t('newsletter.colEmail')}
                    </th>
                    <th className="hidden px-5 py-2.5 text-left font-semibold sm:table-cell">
                      {t('brandFilter.title')}
                    </th>
                    <th className="hidden px-5 py-2.5 text-left font-semibold md:table-cell">
                      {t('newsletter.colName')}
                    </th>
                    <th className="hidden px-5 py-2.5 text-left font-semibold lg:table-cell">
                      {t('newsletter.colSource')}
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold sm:px-5">
                      {t('newsletter.colStatus')}
                    </th>
                    <th className="hidden px-5 py-2.5 text-right font-semibold sm:table-cell">
                      {t('newsletter.colCreated')}
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold sm:px-5">
                      <span className="sr-only">{t('newsletter.colActions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const status = statusOf(s);
                    const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || null;
                    const isThisDeleting =
                      deleteMutation.isPending &&
                      deleteMutation.variables?.id === s.id &&
                      deleteMutation.variables?.companySlug === s._brand.companySlug;
                    return (
                      <tr
                        key={`${s._brand.id}:${s.id}`}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 align-middle sm:px-6">
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
                        </td>
                        <td className="hidden px-5 py-3 align-middle sm:table-cell">
                          <BrandChip brand={s._brand} />
                        </td>
                        <td className="hidden px-5 py-3 text-sm md:table-cell">
                          {fullName ?? '—'}
                        </td>
                        <td className="hidden px-5 py-3 text-xs text-muted-foreground lg:table-cell">
                          {s.source ?? '—'}
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <Badge variant={STATUS_VARIANT[status]}>
                            {t(STATUS_KEY[status] as never)}
                          </Badge>
                        </td>
                        <td className="hidden px-5 py-3 text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                          {formatDateTime(s.createdAt, bcp47, {
                            dateStyle: 'short',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right sm:px-5">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
      alert((err as Error).message);
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
      <Button variant="outline" size="sm" asChild className="text-emerald-700">
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

function ImportNewsletterButton({ onImported }: { onImported: () => void }) {
  const t = useT();
  const { activeProject, isAllBrands } = useProject();
  const [open, setOpen] = useState(false);
  const [fileText, setFileText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<NewsletterImportSummary | null>(null);
  const [busy, setBusy] = useState<false | 'preview' | 'apply'>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<NewsletterImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFileText('');
    setFileName('');
    setPreview(null);
    setDone(null);
    setError(null);
    setDragOver(false);
  }

  async function readFile(f: File) {
    reset();
    setFileName(f.name);
    const text = await f.text();
    setFileText(text);
  }

  async function runPreview() {
    if (!fileText) return;
    setBusy('preview');
    setError(null);
    try {
      const res = await newsletterAdminApi.import(activeProject.companySlug, {
        csv: fileText,
        dryRun: true,
      });
      setPreview(res.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!fileText) return;
    setBusy('apply');
    setError(null);
    try {
      const res = await newsletterAdminApi.import(activeProject.companySlug, {
        csv: fileText,
      });
      setDone(res.summary);
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isAllBrands) {
    return (
      <Button variant="outline" size="sm" disabled title={t('newsletter.importPickBrand')}>
        <Upload className="size-3.5" />
        {t('newsletter.import')}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" />
        {t('newsletter.import')}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-6 sm:max-w-lg">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <BrandMark brand={activeProject} size="xs" />
              <span>{activeProject.shortName}</span>
              <span aria-hidden="true">·</span>
              <span>{t('newsletter.import')}</span>
            </div>
            <SheetTitle className="font-serif text-xl tracking-tight">
              {t('newsletter.importTitle')}
            </SheetTitle>
            <SheetDescription>
              {t('newsletter.importSubtitle', { brand: activeProject.name })}
            </SheetDescription>
          </div>

          {!fileName ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card/50 px-6 py-10 text-center transition-colors',
                dragOver
                  ? 'border-rust bg-rust-soft/30'
                  : 'border-border hover:border-foreground/30 hover:bg-card',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-12 items-center justify-center rounded-full ring-1 transition-colors',
                  dragOver
                    ? 'bg-rust text-primary-foreground ring-rust'
                    : 'bg-rust-soft/60 text-rust ring-rust/20',
                )}
                aria-hidden="true"
              >
                <Upload className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('newsletter.dropzoneTitle')}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('newsletter.dropzoneHint')}
                </p>
              </div>
              <a
                href="/admin/newsletter/import/sample"
                download
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-rust underline-offset-2 hover:underline"
              >
                {t('newsletter.importSampleLink')}
              </a>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                }}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="inline-flex size-10 items-center justify-center rounded-md bg-rust-soft/60 text-rust ring-1 ring-rust/15">
                <Upload className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fileName}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {(fileText.length / 1024).toLocaleString('de-DE', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                {t('common.cancel')}
              </Button>
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {(preview || done) && (
            <ImportSummaryCard summary={done ?? preview!} isFinal={Boolean(done)} t={t} />
          )}

          <div className="mt-auto flex flex-col gap-2">
            {done ? (
              <SheetClose asChild>
                <Button>
                  <Check className="size-4" />
                  {t('common.close')}
                </Button>
              </SheetClose>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!fileText || busy !== false}
                  onClick={runPreview}
                >
                  {busy === 'preview' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('newsletter.importPreview')}
                </Button>
                <Button className="flex-1" disabled={!preview || busy !== false} onClick={apply}>
                  {busy === 'apply' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('newsletter.importApply', {
                    n: preview ? preview.parsedRows - preview.skipped : 0,
                  })}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ImportSummaryCard({
  summary,
  isFinal,
  t,
}: {
  summary: NewsletterImportSummary;
  isFinal: boolean;
  t: ReturnType<typeof useT>;
}) {
  const REASONS: Array<keyof typeof summary.byReason> = [
    'invalid_email',
    'duplicate',
    'own_domain',
    'system_address',
    'disposable_domain',
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {isFinal ? t('newsletter.importDone') : t('newsletter.importDryRun')}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3 border-b border-border pb-3">
        <Stat label={t('newsletter.importStat.parsed')} value={summary.parsedRows} />
        <Stat label={t('newsletter.importStat.imported')} value={summary.imported} tone="good" />
        <Stat label={t('newsletter.importStat.skipped')} value={summary.skipped} tone="warn" />
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-[12px]">
        {REASONS.filter((r) => summary.byReason[r] > 0).map((r) => (
          <li key={r} className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>{t(`newsletter.importReason.${r}` as never)}</span>
            <span className="font-mono tabular-nums text-foreground">{summary.byReason[r]}</span>
          </li>
        ))}
      </ul>
      {summary.sampleRejects.length > 0 ? (
        <details className="mt-3 text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t('newsletter.importShowRejects', {
              n: summary.sampleRejects.length,
            })}
          </summary>
          <ul className="mt-2 flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
            {summary.sampleRejects.map((r, i) => (
              <li key={i} className="truncate">
                <span className="text-foreground/70">L{r.line}:</span> {r.email}{' '}
                <span className="text-rust">[{r.reject}]</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const cls =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-rust'
        : 'text-foreground';
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-lg font-medium tabular-nums', cls)}>{value}</span>
    </div>
  );
}
