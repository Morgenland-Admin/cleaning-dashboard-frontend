import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, Inbox, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CsvImportSheet } from '@/components/csv-import-sheet';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ListSkeleton } from '@/components/ui/skeleton';
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
import { useCanWrite } from '@/lib/access';
import {
  customersAdminApi,
  errMessage,
  exportsAdminApi,
  type Customer,
  type LoyaltyTier,
} from '@/lib/api';
import { contactEmail, customerTitle, tierBadge } from '@/lib/customer-display';
import { useDebounced } from '@/lib/use-debounced';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';

import type { ListNavState } from '@/lib/list-nav';

type TierFilter = LoyaltyTier | 'all';

const TIER_FILTERS: TierFilter[] = ['all', 'neukunde', 'stammkunde', 'premium'];

export function CustomersPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  usePageTitle(t('customers.title'));

  const slug = activeProject.companySlug;
  const [tier, setTier] = useState<TierFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const debouncedSearch = search.trim() === '' ? '' : debounced;
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [confirming, setConfirming] = useState<Customer | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function clearSearch() {
    setSearch('');
  }

  const listQuery = useInfiniteQuery({
    queryKey: ['customers', slug, tier, debouncedSearch] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      customersAdminApi.list(
        slug,
        {
          limit: 50,
          cursor: pageParam ?? undefined,
          tier: tier === 'all' ? undefined : tier,
          q: debouncedSearch || undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.customers),
    [listQuery.data],
  );
  const navState: ListNavState = useMemo(() => ({ ids: rows.map((c) => c.id) }), [rows]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [tier, debouncedSearch, slug]);

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
      <PageContainer width="full">
        <PageHeading title={t('customers.title')} subtitle={t('customers.subtitle')} />
        <EmptyState
          variant="dashed"
          icon={<Users aria-hidden="true" />}
          message={t('customers.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const searching =
    search.trim() !== debouncedSearch ||
    (!!debouncedSearch && listQuery.isFetching && !listQuery.isFetchingNextPage);

  const sentinel = (
    <InfiniteScrollSentinel
      hasMore={listQuery.hasNextPage}
      isLoading={listQuery.isFetchingNextPage}
      onIntersect={() => {
        if (!listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
      }}
      // Root only where the box scrolls (lg+); otherwise the sentinel is always visible and loads every page.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  );

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        breadcrumb={[{ label: activeProject.name }, { label: t('customers.title') }]}
        actions={
          <>
            {canWrite ? <ExportCustomersButton /> : null}
            {canWrite ? (
              <CsvImportSheet
                companySlug={slug}
                brandName={activeProject.name}
                i18nPrefix="customers"
                sampleFileName="customers-import-sample.csv"
                importFn={(cs, body) => customersAdminApi.import(cs, body)}
                onImported={() =>
                  void queryClient.invalidateQueries({ queryKey: ['customers', slug] })
                }
              />
            ) : null}
            <RefreshButton
              onClick={() => void listQuery.refetch()}
              fetching={listQuery.isFetching}
            />
            {canWrite ? (
              <Button size="sm" asChild>
                <Link to="/customers/new">
                  <Plus aria-hidden="true" />
                  {t('customers.newCustomer')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            label={t('customers.filterTier')}
            value={tier}
            onValueChange={setTier}
            overflow="scroll"
            className="min-w-0"
            options={TIER_FILTERS.map((value) => ({
              value,
              label:
                value === 'all' ? t('customers.filterAll') : t(`customers.tier.${value}` as never),
            }))}
          />
          <SearchInput
            value={search}
            onValueChange={setSearch}
            searching={searching}
            placeholder={t('customers.searchPlaceholder')}
            containerClassName="sm:w-72 sm:shrink-0"
          />
        </div>

        {actionError ? (
          <Alert tone="destructive" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        ) : null}

        {listQuery.isLoading ? (
          <div role="status">
            <span className="sr-only">{t('common.loading')}</span>
            <ListSkeleton rows={4} avatar={false} />
          </div>
        ) : listQuery.error ? (
          <ErrorState
            error={listQuery.error}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : rows.length === 0 ? (
          debouncedSearch ? (
            <EmptyState
              variant="dashed"
              icon={<Search aria-hidden="true" />}
              title={t('customers.searchEmpty')}
              message={t('customers.searchEmptyHint', { query: debouncedSearch })}
              action={
                <Button variant="outline" size="sm" onClick={clearSearch}>
                  <X aria-hidden="true" />
                  {t('customers.clearSearch')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              variant="dashed"
              icon={<Inbox aria-hidden="true" />}
              title={t('customers.empty')}
              message={t('customers.emptyHint')}
              action={
                canWrite ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/customers/new">
                      <Plus aria-hidden="true" />
                      {t('customers.newCustomer')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
              {rows.map((c) => (
                <CustomerMobileRow
                  key={c.id}
                  customer={c}
                  navState={navState}
                  bcp47={bcp47}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables?.id === c.id}
                  onDelete={canWrite ? () => setConfirming(c) : undefined}
                />
              ))}
            </ul>

            {/* Card is the scroll container (sticky header anchors to it), so the Table's own wrapper must not scroll. */}
            <div
              ref={listScrollRef}
              className="relative hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-16 text-right">{t('customers.colId')}</TableHead>
                    <TableHead>{t('customers.colCustomer')}</TableHead>
                    <TableHead>{t('customers.colEmail')}</TableHead>
                    <TableHead>{t('customers.colPhone')}</TableHead>
                    <TableHead className="text-right">{t('customers.colOrders')}</TableHead>
                    <TableHead className="text-right">{t('customers.colSpent')}</TableHead>
                    <TableHead>{t('customers.colTier')}</TableHead>
                    <TableHead>{t('customers.colCreated')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('customers.colActions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <CustomerTableRow
                      key={c.id}
                      customer={c}
                      navState={navState}
                      bcp47={bcp47}
                      isDeleting={deleteMutation.isPending && deleteMutation.variables?.id === c.id}
                      onDelete={canWrite ? () => setConfirming(c) : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
              {isDesktop ? sentinel : null}
            </div>

            {isDesktop ? null : sentinel}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={t('customers.confirmDeleteTitle')}
        description={
          confirming
            ? t('customers.confirmDeleteBody', { email: customerTitle(confirming, t) })
            : ''
        }
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (confirming) deleteMutation.mutate(confirming);
        }}
      />
    </PageContainer>
  );
}

/** Stretched row link (one real link per row); row actions sit above it (z-[1]), below the sticky header (z-10). */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function IdChip({ id }: { id: number }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
      #{id}
    </span>
  );
}

function TierBadges({ customer }: { customer: Customer }) {
  const t = useT();
  const tier = tierBadge(customer.loyaltyTier, t);
  return (
    <>
      <StatusBadge label={tier.label} tone={tier.tone} />
      {contactEmail(customer.email) ? null : (
        <StatusBadge label={t('customers.nonContactable')} tone="warning" />
      )}
    </>
  );
}

function DeleteButton({
  customer,
  isDeleting,
  onDelete,
}: {
  customer: Customer;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      loading={isDeleting}
      onClick={onDelete}
      className="relative z-[1] text-destructive hover:bg-destructive-soft hover:text-destructive"
      aria-label={`${t('customers.delete')}: ${customerTitle(customer, t)}`}
      title={t('customers.delete')}
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

interface RowProps {
  customer: Customer;
  bcp47: string;
  isDeleting: boolean;
  /** Omitted for read-only users. */
  onDelete?: () => void;
  navState: ListNavState;
}

function CustomerMobileRow({ customer, bcp47, isDeleting, onDelete, navState }: RowProps) {
  const t = useT();
  const title = customerTitle(customer, t);
  const email = contactEmail(customer.email);
  const contact = [email, customer.phone !== title ? customer.phone : null].filter(Boolean);
  return (
    <li className="relative flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/customers/${customer.id}`}
            state={navState}
            className={`min-w-0 truncate text-2sm font-medium text-foreground ${ROW_LINK}`}
          >
            {title}
          </Link>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            #{customer.id}
          </span>
        </div>
        {contact.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">{contact.join(' · ')}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <TierBadges customer={customer} />
          <span className="tabular-nums">
            {t('customers.colOrders')}: {formatNumber(customer.totalOrders, bcp47)}
          </span>
          <span className="tabular-nums">
            {formatCurrency(customer.totalSpentCents / 100, 'EUR', bcp47)}
          </span>
        </div>
      </div>
      {onDelete ? (
        <DeleteButton customer={customer} isDeleting={isDeleting} onDelete={onDelete} />
      ) : null}
    </li>
  );
}

function CustomerTableRow({ customer, bcp47, isDeleting, onDelete, navState }: RowProps) {
  const t = useT();
  const title = customerTitle(customer, t);
  const email = contactEmail(customer.email);
  return (
    <TableRow className="relative">
      <TableCell className="whitespace-nowrap py-2 text-right">
        <IdChip id={customer.id} />
      </TableCell>
      <TableCell className="max-w-[16rem] py-2">
        <Link
          to={`/customers/${customer.id}`}
          state={navState}
          className={`block truncate font-medium text-foreground hover:underline ${ROW_LINK}`}
        >
          {title}
        </Link>
      </TableCell>
      <TableCell className="max-w-[18rem] truncate py-2 text-muted-foreground">
        {email ?? '—'}
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-muted-foreground">
        {customer.phone ?? '—'}
      </TableCell>
      <TableCell className="py-2 text-right tabular-nums">
        {formatNumber(customer.totalOrders, bcp47)}
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
        {formatCurrency(customer.totalSpentCents / 100, 'EUR', bcp47)}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1">
          <TierBadges customer={customer} />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
        {formatDateTime(customer.createdAt, bcp47, { dateStyle: 'medium' })}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            className="relative z-[1]"
            aria-label={`${t('customers.viewProfile')}: ${title}`}
            title={t('customers.viewProfile')}
          >
            <Link to={`/customers/${customer.id}`} state={navState}>
              <Eye aria-hidden="true" />
            </Link>
          </Button>
          {onDelete ? (
            <DeleteButton customer={customer} isDeleting={isDeleting} onDelete={onDelete} />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

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
      toast.error(errMessage(err));
      setState('idle');
    }
  }

  if (state === 'queued') {
    return (
      <Button variant="outline" size="sm" asChild className="text-success">
        <Link to="/exports">
          <CheckCircle2 aria-hidden="true" />
          {t('customers.exportQueued')}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={createExport} loading={state === 'loading'}>
      <Download aria-hidden="true" />
      {t('customers.export')}
    </Button>
  );
}
