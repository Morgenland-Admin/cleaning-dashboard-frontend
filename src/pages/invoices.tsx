import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, FileText, MoreHorizontal, Plus, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { ApiError, invoicesAdminApi, type InvoiceRow } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { useUrlSearch } from '@/lib/use-url-search';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import {
  INVOICE_ACTION_META,
  INVOICE_FILTERS,
  invoiceActionsFor,
  invoiceConfirmCopy,
  invoiceFilterCount,
  invoiceFilterQuery,
  invoiceNumber,
  invoiceRecipient,
  invoiceStatusLabel,
  invoiceStatusTone,
  parseInvoiceFilter,
  type InvoiceAction,
  type InvoiceConfirmAction,
  type InvoiceFilter,
} from '@/pages/invoices-shared';

import type { ListNavState } from '@/lib/list-nav';

const PAGE_SIZE = 50;

const FILTER_LABEL: Record<'open' | 'all', DictKey> = {
  open: 'invoices.filterOpen',
  all: 'invoices.filterAll',
};

/** Invoice amounts are stored in cents; formatCurrency takes the major unit. */
function formatAmount(inv: InvoiceRow, bcp47: string): string {
  return formatCurrency(inv.totalCents / 100, inv.currency || 'EUR', bcp47);
}

/** Stretched row link (one real link per row); row actions sit above it (z-[1]), below the sticky header (z-10). */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export function InvoicesPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useUrlSearch();
  usePageTitle(t('invoices.title'));

  const slug = activeProject.companySlug;

  const statusFilter = parseInvoiceFilter(searchParams.get('status'));
  const overdueOnly = searchParams.get('overdue') === '1';
  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }
  const setStatusFilter = (next: InvoiceFilter) =>
    setParam('status', next === 'open' ? null : next);
  const setOverdueOnly = (on: boolean) => setParam('overdue', on ? '1' : null);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [confirmState, setConfirmState] = useState<{
    action: InvoiceConfirmAction;
    invoice: InvoiceRow;
  } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const list = useInfiniteQuery({
    queryKey: ['invoices', slug, statusFilter, overdueOnly, search.query] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      invoicesAdminApi.list(
        slug,
        {
          ...invoiceFilterQuery(statusFilter),
          q: search.query || undefined,
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
          overdue: overdueOnly ? true : undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Under the list prefix on purpose: every invalidation of the list refreshes the tab counts too.
  const counts = useQuery({
    queryKey: ['invoices', slug, 'counts', search.query, overdueOnly] as const,
    enabled: !isAllBrands,
    queryFn: ({ signal }) =>
      invoicesAdminApi.counts(
        slug,
        { q: search.query || undefined, overdue: overdueOnly || undefined },
        signal,
      ),
    placeholderData: (prev) => prev,
  });

  const invoices = useMemo(() => list.data?.pages.flatMap((p) => p.invoices) ?? [], [list.data]);
  const navState: ListNavState = useMemo(
    () => ({ from: location.search, ids: invoices.map((i) => i.id) }),
    [location.search, invoices],
  );

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [statusFilter, overdueOnly, search.query, slug]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
    void queryClient.invalidateQueries({ queryKey: ['invoice-log'], exact: false });
  }

  function surfaceError(err: unknown) {
    setNotice({
      tone: 'error',
      text: err instanceof ApiError ? err.message : (err as Error).message,
    });
  }

  function done(text?: string) {
    invalidate();
    setConfirmState(null);
    if (text) setNotice({ tone: 'success', text });
  }
  function failed(err: unknown) {
    setConfirmState(null);
    surfaceError(err);
  }

  const sendMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.send(slug, id),
    onSuccess: (res) => done(res.emailSent ? t('invoices.emailSent') : t('invoices.emailSkipped')),
    onError: failed,
  });
  const issueMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.issue(slug, id),
    onSuccess: (res) => {
      done();
      navigate(`/rechnungen/${res.invoice.id}`, { state: navState });
    },
    onError: failed,
  });
  const markPaidMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.markPaid(slug, id),
    onSuccess: () => done(t('invoices.markedPaid')),
    onError: failed,
  });
  const dunningMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.dunning(slug, id),
    onSuccess: () => done(t('invoices.dunningDone')),
    onError: failed,
  });
  const voidMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.update(slug, id, { status: 'void' }),
    onSuccess: () => done(t('invoices.voided')),
    onError: failed,
  });

  const actionPending =
    sendMutation.isPending ||
    issueMutation.isPending ||
    markPaidMutation.isPending ||
    dunningMutation.isPending ||
    voidMutation.isPending;

  function runAction(action: InvoiceAction, inv: InvoiceRow) {
    if (action === 'edit') navigate(`/rechnungen/${inv.id}/bearbeiten`);
    // Every other action mails the customer or freezes the invoice (GoBD): always confirm.
    else setConfirmState({ action, invoice: inv });
  }

  if (isAllBrands) {
    return (
      <PageContainer width="full">
        <PageHeading title={t('invoices.title')} subtitle={t('invoices.subtitle')} />
        <EmptyState
          variant="dashed"
          icon={<FileText aria-hidden="true" />}
          message={t('invoices.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const confirmMeta = confirmState
    ? invoiceConfirmCopy(t, confirmState.action, confirmState.invoice)
    : null;
  const runConfirmed = () => {
    if (!confirmState) return;
    const id = confirmState.invoice.id;
    ({
      send: () => sendMutation.mutate(id),
      resend: () => sendMutation.mutate(id),
      issuePrint: () => issueMutation.mutate(id),
      markPaid: () => markPaidMutation.mutate(id),
      dunning: () => dunningMutation.mutate(id),
      void: () => voidMutation.mutate(id),
    })[confirmState.action]();
  };

  const sentinel = (
    <InfiniteScrollSentinel
      hasMore={!!list.hasNextPage}
      isLoading={list.isFetchingNextPage}
      onIntersect={() => {
        void list.fetchNextPage();
      }}
      // Root only where the box scrolls (lg+); otherwise the sentinel is always visible and loads every page.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  );

  const newButton = canWrite ? (
    <Button size="sm" asChild>
      <Link to="/rechnungen/neu">
        <Plus aria-hidden="true" />
        {t('invoices.newInvoice')}
      </Link>
    </Button>
  ) : null;

  const filtered = statusFilter !== 'open' || overdueOnly;
  const empty = search.query ? (
    <EmptyState
      variant="dashed"
      icon={<SearchX aria-hidden="true" />}
      title={t('invoices.emptySearch', { q: search.query })}
      message={t('invoices.emptySearchHint')}
      action={
        statusFilter === 'all' && !overdueOnly ? undefined : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setOverdueOnly(false);
            }}
          >
            {t('invoices.searchAll')}
          </Button>
        )
      }
    />
  ) : (
    <EmptyState
      variant="dashed"
      icon={<FileText aria-hidden="true" />}
      title={
        statusFilter === 'open' && !overdueOnly
          ? t('invoices.emptyOpen')
          : filtered
            ? t('invoices.emptyFilter')
            : t('invoices.empty')
      }
      message={
        statusFilter === 'open' && !overdueOnly
          ? t('invoices.emptyOpenHint')
          : t('invoices.emptyHint')
      }
      action={statusFilter === 'all' ? newButton : undefined}
    />
  );

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        breadcrumb={[{ label: activeProject.name }, { label: t('invoices.title') }]}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void list.refetch();
                void counts.refetch();
              }}
              fetching={list.isFetching}
            />
            {newButton}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {notice ? (
          <Alert
            tone={notice.tone === 'error' ? 'destructive' : 'success'}
            onDismiss={() => setNotice(null)}
          >
            {notice.text}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SegmentedControl
            label={t('invoices.filterStatus')}
            value={statusFilter}
            onValueChange={setStatusFilter}
            overflow="scroll"
            className="w-fit min-w-0"
            options={INVOICE_FILTERS.map((s) => ({
              value: s,
              label: s === 'open' || s === 'all' ? t(FILTER_LABEL[s]) : invoiceStatusLabel(t, s),
              count: invoiceFilterCount(s, counts.data?.counts),
            }))}
          />
          <FilterChip
            pressed={overdueOnly}
            onPressedChange={setOverdueOnly}
            icon={<BellRing aria-hidden="true" />}
            className="self-start lg:self-auto"
          >
            {t('invoices.onlyOverdue')}
          </FilterChip>
          <SearchInput
            value={search.input}
            onValueChange={search.setInput}
            searching={search.searching || (list.isFetching && !!search.query)}
            placeholder={t('invoices.searchPlaceholder')}
            containerClassName="lg:ml-auto lg:w-72 lg:shrink-0"
          />
        </div>

        {list.isLoading ? (
          <div role="status">
            <span className="sr-only">{t('common.loading')}</span>
            <ListSkeleton rows={5} avatar={false} />
          </div>
        ) : list.error && invoices.length === 0 ? (
          <ErrorState
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : invoices.length === 0 ? (
          empty
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="relative flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-accent/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/rechnungen/${inv.id}`}
                        state={navState}
                        aria-label={t('invoices.openInvoice', { number: invoiceNumber(inv) })}
                        className={cn(
                          'text-2sm font-medium tabular-nums text-foreground',
                          ROW_LINK,
                        )}
                      >
                        {invoiceNumber(inv)}
                      </Link>
                      <InvoiceBadges invoice={inv} />
                      <span className="ml-auto text-2sm font-medium tabular-nums text-foreground">
                        {formatAmount(inv, bcp47)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">{invoiceRecipient(t, inv)}</span>
                      <span className="shrink-0 tabular-nums">
                        {t('invoices.dueAt')}: {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                      </span>
                    </div>
                  </div>
                  <RowMenu
                    invoice={inv}
                    canWrite={canWrite}
                    disabled={actionPending}
                    onDetails={() => navigate(`/rechnungen/${inv.id}`, { state: navState })}
                    onAction={runAction}
                  />
                </li>
              ))}
            </ul>

            {/* Card is the scroll container (sticky header anchors to it), so the Table's own wrapper must not scroll. */}
            <div
              ref={listScrollRef}
              className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain"
            >
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t('invoices.number')}</TableHead>
                    <TableHead>{t('invoices.recipient')}</TableHead>
                    <TableHead className="text-right">{t('invoices.amount')}</TableHead>
                    <TableHead>{t('invoices.filterStatus')}</TableHead>
                    <TableHead>{t('invoices.dueAt')}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t('invoices.moreActions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="relative">
                      <TableCell className="whitespace-nowrap py-2">
                        <Link
                          to={`/rechnungen/${inv.id}`}
                          state={navState}
                          aria-label={t('invoices.openInvoice', { number: invoiceNumber(inv) })}
                          className={cn(
                            'font-medium tabular-nums text-foreground underline-offset-2 hover:underline',
                            ROW_LINK,
                          )}
                        >
                          {invoiceNumber(inv)}
                        </Link>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatShortDate(inv.sentAt ?? inv.createdAt, bcp47)}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[18rem] py-2">
                        <p className="truncate text-foreground">{invoiceRecipient(t, inv)}</p>
                        {inv.recipientCompany && inv.recipientName ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {inv.recipientCompany}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right font-medium tabular-nums">
                        {formatAmount(inv, bcp47)}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <InvoiceBadges invoice={inv} />
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
                        {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                      </TableCell>
                      <TableCell className="w-12 py-2 text-right">
                        <RowMenu
                          invoice={inv}
                          canWrite={canWrite}
                          disabled={actionPending}
                          onDetails={() => navigate(`/rechnungen/${inv.id}`, { state: navState })}
                          onAction={runAction}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isDesktop ? sentinel : null}
            </div>

            {isDesktop ? null : sentinel}
            {list.isFetchNextPageError && list.error ? (
              <ErrorState
                error={list.error}
                onRetry={() => void list.fetchNextPage()}
                retrying={list.isFetchingNextPage}
              />
            ) : null}
          </>
        )}
      </div>

      {confirmState && confirmMeta ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o && !actionPending) setConfirmState(null);
          }}
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.confirmLabel}
          cancelLabel={t('common.cancel')}
          isDangerous={confirmMeta.isDangerous}
          isPending={actionPending}
          onConfirm={runConfirmed}
        />
      ) : null}
    </PageContainer>
  );
}

function InvoiceBadges({ invoice }: { invoice: InvoiceRow }) {
  const t = useT();
  return (
    <>
      <StatusBadge
        tone={invoiceStatusTone(invoice.status)}
        label={invoiceStatusLabel(t, invoice.status)}
      />
      {invoice.dunningLevel > 0 ? (
        <StatusBadge
          tone="warning"
          label={t('invoices.dunningLevel', { n: invoice.dunningLevel })}
        />
      ) : null}
    </>
  );
}

function RowMenu({
  invoice,
  canWrite,
  disabled,
  onDetails,
  onAction,
}: {
  invoice: InvoiceRow;
  canWrite: boolean;
  disabled: boolean;
  onDetails: () => void;
  onAction: (action: InvoiceAction, inv: InvoiceRow) => void;
}) {
  const t = useT();
  const actions = canWrite ? invoiceActionsFor(invoice.status) : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative z-[1] shrink-0"
          aria-label={`${t('invoices.moreActions')}: ${invoiceNumber(invoice)}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails}>
          <FileText aria-hidden="true" />
          {t('invoices.details')}
        </DropdownMenuItem>
        {actions.length > 0 ? <DropdownMenuSeparator /> : null}
        {actions.map((action) => {
          const meta = INVOICE_ACTION_META[action];
          const Icon = meta.icon;
          return (
            <DropdownMenuItem
              key={action}
              disabled={disabled}
              onSelect={() => onAction(action, invoice)}
              className={cn(action === 'void' && 'text-destructive focus:text-destructive')}
            >
              <Icon aria-hidden="true" />
              {t(meta.labelKey)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
