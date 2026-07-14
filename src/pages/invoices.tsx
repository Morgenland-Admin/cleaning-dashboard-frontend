import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  BellRing,
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { InvoiceFormSheet } from '@/components/invoice-form-sheet';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatShortDate } from '@/lib/utils';

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

// Quick actions available from the list. `edit` opens the form sheet in place;
// everything richer (preview, issue & print, history) lives on the detail page.
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

// Cent-precision money formatting (utils' formatCurrency rounds to whole euros).
function formatEur(cents: number, bcp47: string, currency = 'EUR'): string {
  return (cents / 100).toLocaleString(bcp47, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

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
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [formState, setFormState] = useState<
    { mode: 'create' } | { mode: 'edit'; invoice: InvoiceRow } | null
  >(null);
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

  // Issue without email, then jump to the detail page so the operator can print.
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
        setFormState({ mode: 'edit', invoice: inv });
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
      <div className="mx-auto w-full max-w-6xl">
        <PageHeading title={t('invoices.title')} subtitle={t('invoices.subtitle')} />
        <EmptyState
          icon={<FileText className="size-6" aria-hidden="true" />}
          message={t('invoices.selectBrandFirst')}
        />
      </div>
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeading
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{t('invoices.title')}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-8"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
              aria-busy={list.isFetching || undefined}
            >
              <RefreshCcw
                className={cn('size-3.5', list.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              className="min-h-11 md:min-h-8"
              onClick={() => setFormState({ mode: 'create' })}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t('invoices.newInvoice')}
            </Button>
          </>
        }
      />

      {notice ? (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn(
            'flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm',
            notice.tone === 'error'
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-success/30 bg-success-soft text-success',
          )}
        >
          <span className="flex items-start gap-2">
            {notice.tone === 'error' ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{notice.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.close')}
            className="rounded-md p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={t('invoices.filterStatus')}
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-2.5 text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-7',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {s === 'all' ? t('invoices.filterAll') : statusLabel(s)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9',
            overdueOnly
              ? 'border-warning/50 bg-warning-soft text-warning'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <BellRing className="size-3.5" aria-hidden="true" />
          {t('invoices.onlyOverdue')}
        </button>
      </div>

      {list.isLoading ? (
        <ListSkeleton />
      ) : list.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {list.error instanceof ApiError ? list.error.message : (list.error as Error).message}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-8"
            onClick={() => void list.refetch()}
          >
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-6">
          <EmptyState
            icon={<FileText className="size-6" aria-hidden="true" />}
            title={t('invoices.empty')}
            message={t('invoices.emptyHint')}
            action={
              <Button size="sm" onClick={() => setFormState({ mode: 'create' })}>
                <Plus className="size-3.5" aria-hidden="true" />
                {t('invoices.newInvoice')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b text-[11px] uppercase tracking-wider hover:bg-transparent">
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
                  <TableRow key={inv.id}>
                    <TableCell className="py-2.5">
                      <button
                        type="button"
                        onClick={() => openDetail(inv.id)}
                        className="rounded font-mono text-[13px] font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {invoiceNumber(inv)}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-[18rem] truncate py-2.5">
                      {inv.recipientName}
                    </TableCell>
                    <TableCell className="py-2.5 text-right tabular-nums">
                      {formatEur(inv.totalCents, bcp47, inv.currency)}
                    </TableCell>
                    <TableCell className="py-2.5">
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
                    <TableCell className="py-2.5 tabular-nums text-muted-foreground">
                      {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
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
          </div>

          {/* Mobile: stacked cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {invoices.map((inv) => (
              <li key={inv.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(inv.id)}
                    className="min-h-11 min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[13px] font-medium">
                        {invoiceNumber(inv)}
                      </span>
                      <StatusBadge tone={STATUS_TONE[inv.status]} label={statusLabel(inv.status)} />
                      {inv.dunningLevel > 0 ? (
                        <StatusBadge
                          tone="warning"
                          label={t('invoices.dunningLevel', { n: inv.dunningLevel })}
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-foreground">{inv.recipientName}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium tabular-nums text-foreground">
                        {formatEur(inv.totalCents, bcp47, inv.currency)}
                      </span>
                      <span className="tabular-nums">
                        {t('invoices.dueAt')}: {inv.dueAt ? formatShortDate(inv.dueAt, bcp47) : '—'}
                      </span>
                    </div>
                  </button>
                  <RowMenu
                    invoice={inv}
                    disabled={actionPending}
                    onDetails={() => openDetail(inv.id)}
                    onAction={runAction}
                  />
                </div>
              </li>
            ))}
          </ul>

          <InfiniteScrollSentinel
            hasMore={!!list.hasNextPage}
            isLoading={list.isFetchingNextPage}
            onIntersect={() => {
              void list.fetchNextPage();
            }}
          />
        </>
      )}

      {formState ? (
        <InvoiceFormSheet
          slug={slug}
          invoice={formState.mode === 'edit' ? formState.invoice : null}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null);
            invalidate();
          }}
        />
      ) : null}

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
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
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
          size="icon"
          className="h-11 w-11 shrink-0 md:h-9 md:w-9"
          aria-label={`${t('invoices.details')} ${invoiceNumber(invoice)}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails}>
          <FileText className="size-3.5" aria-hidden="true" />
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
              <Icon className="size-3.5" aria-hidden="true" />
              {t(meta.labelKey as never)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
