import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CsvImportSheet } from '@/components/csv-import-sheet';
import { CustomerSheet } from '@/components/customer-sheet';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  exportsAdminApi,
  type Customer,
  type LoyaltyTier,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';

type TierFilter = LoyaltyTier | 'all';

const TIER_FILTERS: TierFilter[] = ['all', 'neukunde', 'stammkunde', 'premium'];

const TIER_TONE: Record<LoyaltyTier, 'neutral' | 'info' | 'success'> = {
  neukunde: 'neutral',
  stammkunde: 'info',
  premium: 'success',
};

export function CustomersPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  usePageTitle(t('customers.title'));

  const slug = activeProject.companySlug;
  const [tier, setTier] = useState<TierFilter>('all');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ mode: 'create' } | null>(null);
  const [confirming, setConfirming] = useState<Customer | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useInfiniteQuery({
    queryKey: ['customers', slug, tier] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      customersAdminApi.list(
        slug,
        { limit: 50, cursor: pageParam ?? undefined, tier: tier === 'all' ? undefined : tier },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.customers),
    [listQuery.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) => c.email.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const deleteMutation = useMutation({
    mutationFn: (customer: Customer) => customersAdminApi.delete(slug, customer.id),
    onSuccess: () => {
      setConfirming(null);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
    },
    onError: (err) => {
      setConfirming(null);
      setActionError(errMessage(err));
    },
  });

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <PageHeading title={t('customers.title')} subtitle={t('customers.subtitle')} />
        <EmptyState
          icon={<Users className="size-6" aria-hidden="true" />}
          message={t('customers.selectBrandFirst')}
        />
      </div>
    );
  }

  const queryErrorMessage = listQuery.error ? errMessage(listQuery.error) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeading
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{t('customers.title')}</span>
          </>
        }
        actions={
          <>
            <ExportCustomersButton />
            <CsvImportSheet
              companySlug={slug}
              brandName={activeProject.name}
              i18nPrefix="customers"
              sampleHref="/admin/customers/import/sample"
              importFn={(cs, body) => customersAdminApi.import(cs, body)}
              triggerClassName="h-11 sm:h-9"
              onImported={() =>
                void queryClient.invalidateQueries({ queryKey: ['customers', slug] })
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-busy={listQuery.isFetching || undefined}
            >
              <RefreshCcw
                className={cn('size-3.5', listQuery.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              {t('common.refresh')}
            </Button>
            <Button size="sm" className="h-11 sm:h-9" onClick={() => setSheet({ mode: 'create' })}>
              <Plus className="size-3.5" aria-hidden="true" />
              {t('customers.newCustomer')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t('customers.filterTier')}
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {TIER_FILTERS.map((value) => {
            const active = tier === value;
            return (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTier(value)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:px-2.5 sm:text-[11px] sm:uppercase sm:tracking-wide',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {value === 'all' ? t('customers.filterAll') : t(`customers.tier.${value}` as never)}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('customers.searchPlaceholder')}
            aria-label={t('customers.searchPlaceholder')}
            className="h-11 pl-9 sm:h-9"
          />
        </div>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t('common.close')}
            className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <ListSkeleton />
      ) : queryErrorMessage ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{queryErrorMessage}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => void listQuery.refetch()}
          >
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden="true" />}
          title={t('customers.empty')}
          message={t('customers.emptyHint')}
          action={
            <Button size="sm" className="h-11 sm:h-9" onClick={() => setSheet({ mode: 'create' })}>
              <Plus className="size-3.5" aria-hidden="true" />
              {t('customers.newCustomer')}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                bcp47={bcp47}
                onDelete={() => setConfirming(c)}
              />
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('customers.colCustomer')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('customers.colPhone')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('customers.colOrders')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('customers.colSpent')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('customers.colTier')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('customers.colCreated')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('customers.colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <CustomerTableRow
                    key={c.id}
                    customer={c}
                    bcp47={bcp47}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables?.id === c.id}
                    onDelete={() => setConfirming(c)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <InfiniteScrollSentinel
            hasMore={listQuery.hasNextPage}
            isLoading={listQuery.isFetchingNextPage}
            onIntersect={() => {
              if (!listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirming(null);
        }}
        title={t('customers.confirmDeleteTitle')}
        description={
          confirming ? t('customers.confirmDeleteBody', { email: confirming.email }) : ''
        }
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (confirming) deleteMutation.mutate(confirming);
        }}
      />

      {sheet ? (
        <CustomerSheet
          slug={slug}
          editing={null}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
          }}
        />
      ) : null}
    </div>
  );
}

// --- Row presentation --------------------------------------------------------

function CustomerCard({
  customer,
  bcp47,
  onDelete,
}: {
  customer: Customer;
  bcp47: string;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/customers/${customer.id}`} className="min-w-0 hover:underline">
          <p className="truncate font-medium text-foreground">{customer.name ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
        </Link>
        <StatusBadge
          label={t(`customers.tier.${customer.loyaltyTier}` as never)}
          tone={TIER_TONE[customer.loyaltyTier]}
          className="shrink-0"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {customer.phone ? <span>{customer.phone}</span> : null}
        <span>
          {t('customers.colOrders')}: {formatNumber(customer.totalOrders, bcp47)}
        </span>
        <span>
          {t('customers.colSpent')}: {formatCurrency(customer.totalSpentCents / 100, 'EUR', bcp47)}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-11 flex-1" asChild>
          <Link to={`/customers/${customer.id}`}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {t('customers.viewProfile')}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {t('customers.delete')}
        </Button>
      </div>
    </li>
  );
}

function CustomerTableRow({
  customer,
  bcp47,
  isDeleting,
  onDelete,
}: {
  customer: Customer;
  bcp47: string;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="max-w-[18rem] px-4 py-3">
        <Link to={`/customers/${customer.id}`} className="group flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rust/10 text-rust">
            <User className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground group-hover:underline">
              {customer.name ?? '—'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
          </div>
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{customer.phone ?? '—'}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatNumber(customer.totalOrders, bcp47)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatCurrency(customer.totalSpentCents / 100, 'EUR', bcp47)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          label={t(`customers.tier.${customer.loyaltyTier}` as never)}
          tone={TIER_TONE[customer.loyaltyTier]}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {formatDateTime(customer.createdAt, bcp47, { dateStyle: 'medium' })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label={`${t('customers.viewProfile')}: ${customer.email}`}
            title={t('customers.viewProfile')}
          >
            <Link to={`/customers/${customer.id}`}>
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isDeleting}
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${t('customers.delete')}: ${customer.email}`}
            title={t('customers.delete')}
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// --- Export ------------------------------------------------------------------

function ExportCustomersButton() {
  const t = useT();
  const { activeProject } = useProject();
  const [state, setState] = useState<'idle' | 'loading' | 'queued'>('idle');

  async function createExport() {
    if (state === 'loading') return;
    setState('loading');
    try {
      await exportsAdminApi.create({ companySlug: activeProject.companySlug, kind: 'customers' });
      setState('queued');
      setTimeout(() => setState('idle'), 4000);
    } catch (err) {
      alert(errMessage(err));
      setState('idle');
    }
  }

  if (state === 'queued') {
    return (
      <Button
        variant="outline"
        size="sm"
        asChild
        className="h-11 text-emerald-700 dark:text-emerald-300 sm:h-9"
      >
        <Link to="/exports">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {t('customers.exportQueued')}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 sm:h-9"
      onClick={createExport}
      disabled={state === 'loading'}
    >
      {state === 'loading' ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-3.5" aria-hidden="true" />
      )}
      {t('customers.export')}
    </Button>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-muted" />
        </li>
      ))}
    </ul>
  );
}
