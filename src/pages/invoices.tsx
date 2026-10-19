import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BellRing,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
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
import { useLocale, useT } from '@/i18n';
import { ApiError, invoicesAdminApi, type InvoiceRow, type InvoiceStatus } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';

import type { ListNavState } from '@/lib/list-nav';

const PAGE_SIZE = 50;

const STATUS_FILTERS: Array<InvoiceStatus | 'all'> = [
  'all',
  'draft',
  'sent',
  'paid',
  'overdue',
  'void',
];

const STATUS_TONE: Record<InvoiceStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

type InvoiceAction = 'edit' | 'send' | 'issuePrint' | 'resend' | 'markPaid' | 'dunning' | 'void';

const ACTION_META: Record<InvoiceAction, { labelKey: string; icon: LucideIcon }> = {
  edit: { labelKey: 'invoices.edit', icon: Pencil },
  send: { labelKey: 'invoices.send', icon: Send },
  issuePrint: { labelKey: 'invoices.issuePrint', icon: Printer },
  resend: { labelKey: 'invoices.resend', icon: Send },
  markPaid: { labelKey: 'invoices.markPaid', icon: CheckCircle2 },
  dunning: { labelKey: 'invoices.dunning', icon: BellRing },
  void: { labelKey: 'invoices.voidAction', icon: Ban },
};

function actionsFor(status: InvoiceStatus): InvoiceAction[] {
  switch (status) {
    case 'draft':
      return ['edit', 'send', 'issuePrint', 'void'];
    case 'sent':
    case 'overdue':
      return ['resend', 'markPaid', 'dunning', 'void'];
    default:
      // paid / void: GoBD-immutable, read-only.
      return [];
  }
}

/** Invoice amounts are stored in cents; formatCurrency takes the major unit. */
function formatAmount(inv: InvoiceRow, bcp47: string): string {
  return formatCurrency(inv.totalCents / 100, inv.currency, bcp47);
}

/** Stretched row link (one real link per row); row actions sit above it (z-[1]), below the sticky header (z-10). */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function invoiceNumber(inv: InvoiceRow): string {
  return inv.number ?? `#${inv.id}`;
}

export function InvoicesPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  usePageTitle(t('invoices.title'));

  const slug = activeProject.companySlug;

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    action: 'send' | 'issuePrint' | 'void' | 'dunning';
    id: number;
  } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const list = useInfiniteQuery({
    queryKey: ['invoices', slug, statusFilter, overdueOnly] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      invoicesAdminApi.list(
        slug,
        {
          limit: PAGE_SIZE,
          cursor: pageParam ?? undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          overdue: overdueOnly ? true : undefined,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invoices = useMemo(() => list.data?.pages.flatMap((p) => p.invoices) ?? [], [list.data]);
  const navState: ListNavState = useMemo(() => ({ ids: invoices.map((i) => i.id) }), [invoices]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [statusFilter, overdueOnly, slug]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
    void queryClient.invalidateQueries({ queryKey: ['invoice-log'], exact: false });
  }

  function openDetail(id: number) {
    navigate(`/rechnungen/${id}`);
  }

  function surfaceError(err: unknown) {
    setNotice({
      tone: 'error',
      text: err instanceof ApiError ? err.message : (err as Error).message,
    });
  }

  const sendMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.send(slug, id),
    onSuccess: (res) => {
      invalidate();
      setConfirmState(null);
      setNotice({
        tone: 'success',
        text: res.emailSent ? t('invoices.emailSent') : t('invoices.emailSkipped'),
      });
    },
    onError: (err) => {
      setConfirmState(null);
      surfaceError(err);
    },
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.issue(slug, id),
    onSuccess: (res) => {
      invalidate();
      setConfirmState(null);
      openDetail(res.invoice.id);
    },
    onError: (err) => {
      setConfirmState(null);
      surfaceError(err);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.markPaid(slug, id),
    onSuccess: () => invalidate(),
    onError: surfaceError,
  });

  const dunningMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.dunning(slug, id),
    onSuccess: () => {
      invalidate();
      setConfirmState(null);
    },
    onError: (err) => {
      setConfirmState(null);
      surfaceError(err);
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: number) => invoicesAdminApi.update(slug, id, { status: 'void' }),
    onSuccess: () => {
      invalidate();
      setConfirmState(null);
    },
    onError: (err) => {
      setConfirmState(null);
      surfaceError(err);
    },
  });

  const actionPending =
    sendMutation.isPending ||
    issueMutation.isPending ||
    markPaidMutation.isPending ||
    dunningMutation.isPending ||
    voidMutation.isPending;

  function runAction(action: InvoiceAction, inv: InvoiceRow) {
    switch (action) {
      case 'edit':
        navigate(`/rechnungen/${inv.id}/bearbeiten`);
        break;
      case 'send':
        setConfirmState({ action: 'send', id: inv.id });
        break;
      case 'issuePrint':
        setConfirmState({ action: 'issuePrint', id: inv.id });
        break;
      case 'resend':
        sendMutation.mutate(inv.id);
        break;
      case 'markPaid':
        markPaidMutation.mutate(inv.id);
        break;
      case 'dunning':
        setConfirmState({ action: 'dunning', id: inv.id });
        break;
      case 'void':
        setConfirmState({ action: 'void', id: inv.id });
        break;
    }
  }

  const statusLabel = (s: InvoiceStatus) => t(`invoices.status.${s}` as never);

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

  const confirmMeta =
    confirmState == null
      ? null
      : {
          send: {
            title: t('invoices.send'),
            description: t('invoices.confirmSend'),
            confirmLabel: t('invoices.send'),
            isDangerous: false,
            isPending: sendMutation.isPending,
            run: () => sendMutation.mutate(confirmState.id),
          },
          issuePrint: {
            title: t('invoices.issuePrint'),
            description: t('invoices.confirmIssue'),
            confirmLabel: t('invoices.issuePrint'),
            isDangerous: false,
            isPending: issueMutation.isPending,
            run: () => issueMutation.mutate(confirmState.id),
          },
          void: {
            title: t('invoices.voidAction'),
            description: t('invoices.confirmVoid'),
            confirmLabel: t('invoices.voidAction'),
            isDangerous: true,
            isPending: voidMutation.isPending,
            run: () => voidMutation.mutate(confirmState.id),
          },
          dunning: {
            title: t('invoices.dunning'),
            description: t('invoices.confirmDunning'),
            confirmLabel: t('invoices.dunning'),
            isDangerous: false,
            isPending: dunningMutation.isPending,
            run: () => dunningMutation.mutate(confirmState.id),
          },
        }[confirmState.action];

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

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        breadcrumb={[{ label: activeProject.name }, { label: t('invoices.title') }]}
        actions={
          <>
            <RefreshButton onClick={() => void list.refetch()} fetching={list.isFetching} />
            <Button size="sm" onClick={() => navigate('/rechnungen/neu')}>
              <Plus aria-hidden="true" />
              {t('invoices.newInvoice')}
            </Button>
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            label={t('invoices.filterStatus')}
            value={statusFilter}
            onValueChange={setStatusFilter}
            overflow="scroll"
            className="min-w-0"
            options={STATUS_FILTERS.map((s) => ({
              value: s,
              label: s === 'all' ? t('invoices.filterAll') : statusLabel(s),
            }))}
          />
          <FilterChip
            pressed={overdueOnly}
            onPressedChange={setOverdueOnly}
            icon={<BellRing aria-hidden="true" />}
            className="self-start sm:self-auto"
          >
            {t('invoices.onlyOverdue')}
          </FilterChip>
        </div>

        {list.isLoading ? (
          <div role="status">
            <span className="sr-only">{t('common.loading')}</span>
            <ListSkeleton rows={5} avatar={false} />
          </div>
        ) : list.error ? (
          <ErrorState
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : invoices.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<FileText aria-hidden="true" />}
            title={t('invoices.empty')}
            message={t('invoices.emptyHint')}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate('/rechnungen/neu')}>
                <Plus aria-hidden="true" />
                {t('invoices.newInvoice')}
              </Button>
            }
          />
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
                        className={cn(
                          'text-2sm font-medium tabular-nums text-foreground',
                          ROW_LINK,
                        )}
                      >
                        {invoiceNumber(inv)}
                      </Link>
                      <StatusBadge tone={STATUS_TONE[inv.status]} label={statusLabel(inv.status)} />
                      {inv.dunningLevel > 0 ? (
                        <StatusBadge
                          tone="warning"
                          label={t('invoices.dunningLevel', { n: inv.dunningLevel })}
                        />
                      ) : null}
                      <span className="ml-auto text-2sm font-medium tabular-nums text-foreground">
                        {formatAmount(inv, bcp47)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">{inv.recipientName}</span>
                      <span className="shrink-0 tabular-nums">
                        {t('invoices.dueAt')}: {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                      </span>
                    </div>
                  </div>
                  <RowMenu
                    invoice={inv}
                    disabled={actionPending}
                    onDetails={() => openDetail(inv.id)}
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
                    <TableHead>
                      <span className="sr-only">{t('invoices.details')}</span>
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
                          className={cn(
                            'font-medium tabular-nums text-foreground underline-offset-2 hover:underline',
                            ROW_LINK,
                          )}
                        >
                          {invoiceNumber(inv)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate py-2">
                        {inv.recipientName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
                        {formatAmount(inv, bcp47)}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <StatusBadge
                            tone={STATUS_TONE[inv.status]}
                            label={statusLabel(inv.status)}
                          />
                          {inv.dunningLevel > 0 ? (
                            <StatusBadge
                              tone="warning"
                              label={t('invoices.dunningLevel', { n: inv.dunningLevel })}
                            />
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
                        {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <RowMenu
                          invoice={inv}
                          disabled={actionPending}
                          onDetails={() => openDetail(inv.id)}
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
          </>
        )}
      </div>

      {confirmState && confirmMeta ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setConfirmState(null);
          }}
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.confirmLabel}
          cancelLabel={t('common.cancel')}
          isDangerous={confirmMeta.isDangerous}
          isPending={confirmMeta.isPending}
          onConfirm={confirmMeta.run}
        />
      ) : null}
    </PageContainer>
  );
}

function RowMenu({
  invoice,
  disabled,
  onDetails,
  onAction,
}: {
  invoice: InvoiceRow;
  disabled: boolean;
  onDetails: () => void;
  onAction: (action: InvoiceAction, inv: InvoiceRow) => void;
}) {
  const t = useT();
  const actions = actionsFor(invoice.status);
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
          const meta = ACTION_META[action];
          const Icon = meta.icon;
          return (
            <DropdownMenuItem
              key={action}
              disabled={disabled}
              onSelect={() => onAction(action, invoice)}
              className={cn(action === 'void' && 'text-destructive focus:text-destructive')}
            >
              <Icon aria-hidden="true" />
              {t(meta.labelKey as never)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
