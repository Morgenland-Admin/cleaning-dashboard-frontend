import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  BellRing,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  History,
  Info,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { LineItemsEditor } from '@/components/line-items-editor';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  customersAdminApi,
  errMessage,
  invoicesAdminApi,
  type InvoiceCreateInput,
  type InvoiceLineItem,
  type InvoicePaymentMethod,
  type InvoiceRow,
  type InvoiceStatus,
  type InvoiceTaxRate,
  type InvoiceUpdateInput,
} from '@/lib/api';
import {
  computeSubtotalCents,
  emptyLine,
  lineNetCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';

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

type InvoiceAction = 'edit' | 'send' | 'resend' | 'markPaid' | 'dunning' | 'void';

const ACTION_META: Record<InvoiceAction, { labelKey: string; icon: LucideIcon }> = {
  edit: { labelKey: 'invoices.edit', icon: Pencil },
  send: { labelKey: 'invoices.send', icon: Send },
  resend: { labelKey: 'invoices.resend', icon: Send },
  markPaid: { labelKey: 'invoices.markPaid', icon: CheckCircle2 },
  dunning: { labelKey: 'invoices.dunning', icon: BellRing },
  void: { labelKey: 'invoices.voidAction', icon: Ban },
};

function actionsFor(status: InvoiceStatus): InvoiceAction[] {
  switch (status) {
    case 'draft':
      return ['edit', 'send', 'void'];
    case 'sent':
    case 'overdue':
      return ['resend', 'markPaid', 'dunning', 'void'];
    default:
      // paid / void: GoBD-immutable, read-only.
      return [];
  }
}

// Cent-precision money formatting (utils' formatCurrency rounds to whole euros;
// orders.tsx uses the same local-helper pattern for cent amounts).
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
  usePageTitle(t('invoices.title'));

  const slug = activeProject.companySlug;

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [formState, setFormState] = useState<
    { mode: 'create' } | { mode: 'edit'; invoice: InvoiceRow } | null
  >(null);
  const [confirmState, setConfirmState] = useState<{
    action: 'send' | 'void' | 'dunning';
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
  const detail = detailId != null ? (invoices.find((inv) => inv.id === detailId) ?? null) : null;

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
                        onClick={() => setDetailId(inv.id)}
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
                        onDetails={() => setDetailId(inv.id)}
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
                    onClick={() => setDetailId(inv.id)}
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
                    onDetails={() => setDetailId(inv.id)}
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

      {detail ? (
        <InvoiceDetailSheet
          slug={slug}
          invoice={detail}
          bcp47={bcp47}
          actionPending={actionPending}
          onClose={() => setDetailId(null)}
          onAction={runAction}
        />
      ) : null}

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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm">{children}</span>
    </div>
  );
}

function InvoiceDetailSheet({
  slug,
  invoice,
  bcp47,
  actionPending,
  onClose,
  onAction,
}: {
  slug: CompanySlug;
  invoice: InvoiceRow;
  bcp47: string;
  actionPending: boolean;
  onClose: () => void;
  onAction: (action: InvoiceAction, inv: InvoiceRow) => void;
}) {
  const t = useT();
  const statusLabel = (s: InvoiceStatus) => t(`invoices.status.${s}` as never);
  const actions = actionsFor(invoice.status);

  const logQuery = useQuery({
    queryKey: ['invoice-log', slug, invoice.id] as const,
    queryFn: ({ signal }) => invoicesAdminApi.log(slug, invoice.id, signal),
  });

  // Lazily fetched invoice PDF (blob object URL) for on-screen preview + download.
  // Fetched on first use, cached for the sheet's lifetime, revoked on unmount.
  const [pdf, setPdf] = useState<{
    url: string | null;
    loading: boolean;
    error: string | null;
    show: boolean;
  }>({ url: null, loading: false, error: null, show: false });

  useEffect(() => {
    return () => {
      if (pdf.url) URL.revokeObjectURL(pdf.url);
    };
  }, [pdf.url]);

  const ensurePdf = async (): Promise<string | null> => {
    if (pdf.url) return pdf.url;
    setPdf((p) => ({ ...p, loading: true, error: null }));
    try {
      const blob = await invoicesAdminApi.pdf(slug, invoice.id);
      const url = URL.createObjectURL(blob);
      setPdf((p) => ({ ...p, url, loading: false }));
      return url;
    } catch (e) {
      setPdf((p) => ({ ...p, loading: false, error: errMessage(e) }));
      return null;
    }
  };

  const togglePreview = async () => {
    if (pdf.show) {
      setPdf((p) => ({ ...p, show: false }));
      return;
    }
    const url = await ensurePdf();
    if (url) setPdf((p) => ({ ...p, show: true }));
  };

  const downloadPdf = async () => {
    const url = await ensurePdf();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rechnung-${invoice.number ?? invoice.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-5 overflow-y-auto bg-card p-5 text-foreground sm:max-w-md"
      >
        <div className="pr-8">
          <SheetTitle className="not-sr-only font-serif text-xl tracking-tight">
            {invoiceNumber(invoice)}
          </SheetTitle>
          <SheetDescription className="not-sr-only text-sm text-muted-foreground">
            {invoice.recipientName}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={STATUS_TONE[invoice.status]} label={statusLabel(invoice.status)} />
            {invoice.dunningLevel > 0 ? (
              <StatusBadge
                tone="warning"
                label={t('invoices.dunningLevel', { n: invoice.dunningLevel })}
              />
            ) : null}
          </div>
        </div>

        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const meta = ACTION_META[action];
              const Icon = meta.icon;
              return (
                <Button
                  key={action}
                  size="sm"
                  variant={action === 'send' || action === 'resend' ? 'default' : 'outline'}
                  className={cn(
                    'min-h-11 md:min-h-8',
                    action === 'void' && 'text-destructive hover:text-destructive',
                  )}
                  disabled={actionPending}
                  onClick={() => onAction(action, invoice)}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {t(meta.labelKey as never)}
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t('invoices.immutableHint')}
          </p>
        )}

        <section className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
          <DetailRow label={t('invoices.recipient')}>{invoice.recipientName}</DetailRow>
          <DetailRow label={t('invoices.form.recipientEmail')}>
            {invoice.recipientEmail ?? '—'}
          </DetailRow>
          <DetailRow label={t('invoices.form.addressLine1')}>
            {invoice.recipientAddressLine1 ? (
              <>
                {invoice.recipientAddressLine1}
                {invoice.recipientAddressLine2 ? <>, {invoice.recipientAddressLine2}</> : null}
                <br />
                {invoice.recipientPostalCode ?? ''} {invoice.recipientCity ?? ''}
              </>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label={t('invoices.form.serviceDate')}>
            {invoice.serviceDate ? (
              <>
                {formatShortDate(invoice.serviceDate, bcp47)}
                {invoice.serviceDateEnd ? (
                  <> – {formatShortDate(invoice.serviceDateEnd, bcp47)}</>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label={t('invoices.form.customerType')}>
            {invoice.customerType === 'b2b' ? 'B2B' : 'B2C'}
          </DetailRow>
          <DetailRow label={t('invoices.form.paymentMethod')}>
            {t(
              `invoices.form.payment${
                invoice.paymentMethod === 'card'
                  ? 'Card'
                  : invoice.paymentMethod === 'cash'
                    ? 'Cash'
                    : 'Transfer'
              }` as never,
            )}
          </DetailRow>
          {invoice.paymentMethod === 'transfer' ? (
            <DetailRow label={t('invoices.form.paymentTerms')}>
              {invoice.paymentTermsDays}
            </DetailRow>
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t('invoices.form.lineItems')}
          </h3>
          <ul className="divide-y rounded-md border">
            {invoice.lineItems.map((li, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className={cn('min-w-0 flex-1 truncate', li.isPackage && 'font-semibold')}>
                  {li.isPackage ? (
                    <Package className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                  ) : null}
                  {li.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {li.quantity} ×
                </span>
                <span className={cn('shrink-0 tabular-nums', li.isPackage && 'font-semibold')}>
                  {formatEur(li.unitPriceCents, bcp47, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-1 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t('invoices.form.subtotal')}</span>
              <span className="tabular-nums">
                {formatEur(invoice.subtotalCents, bcp47, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('invoices.form.tax')} ({invoice.taxRatePercent} %)
              </span>
              <span className="tabular-nums">
                {formatEur(invoice.taxCents, bcp47, invoice.currency)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold">
              <span className="text-xs uppercase tracking-wide">{t('invoices.form.total')}</span>
              <span className="tabular-nums">
                {formatEur(invoice.totalCents, bcp47, invoice.currency)}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <FileText className="size-3" aria-hidden="true" />
            {t('invoices.document')}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 md:min-h-8"
              disabled={pdf.loading}
              onClick={togglePreview}
            >
              {pdf.loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
              {pdf.show ? t('invoices.pdfHide') : t('invoices.pdfPreview')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 md:min-h-8"
              disabled={pdf.loading}
              onClick={downloadPdf}
            >
              <Download className="size-3.5" aria-hidden="true" />
              {t('invoices.pdfDownload')}
            </Button>
          </div>
          {pdf.error ? (
            <p className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {pdf.error}
            </p>
          ) : null}
          {pdf.show && pdf.url ? (
            <object
              data={pdf.url}
              type="application/pdf"
              className="mt-3 h-96 w-full rounded-md border bg-white"
              aria-label={t('invoices.document')}
            >
              <p className="p-3 text-xs text-muted-foreground">
                {t('invoices.pdfUnavailable')}{' '}
                <a
                  href={pdf.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  {t('invoices.pdfOpen')}
                </a>
              </p>
            </object>
          ) : null}
        </section>

        <section className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
          <DetailRow label={t('invoices.createdAt')}>
            {formatDateTime(invoice.createdAt, bcp47)}
          </DetailRow>
          <DetailRow label={t('invoices.sentAt')}>
            {invoice.sentAt ? formatDateTime(invoice.sentAt, bcp47) : '—'}
          </DetailRow>
          <DetailRow label={t('invoices.dueAt')}>
            {invoice.dueAt ? formatShortDate(invoice.dueAt, bcp47) : '—'}
          </DetailRow>
          <DetailRow label={t('invoices.paidAt')}>
            {invoice.paidAt ? formatDateTime(invoice.paidAt, bcp47) : '—'}
          </DetailRow>
        </section>

        {invoice.notes ? (
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t('invoices.form.notes')}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <History className="size-3" aria-hidden="true" />
            {t('invoices.history')}
          </h3>
          {logQuery.isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              <span>{t('common.loading')}</span>
            </div>
          ) : logQuery.error ? (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {logQuery.error instanceof ApiError
                ? logQuery.error.message
                : (logQuery.error as Error).message}
            </p>
          ) : (logQuery.data?.log ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <ol className="ml-1 space-y-3 border-l border-border pl-4">
              {logQuery.data!.log.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary"
                  />
                  <p className="text-sm font-medium">
                    {entry.fromStatus ? <>{statusLabel(entry.fromStatus)} → </> : null}
                    {statusLabel(entry.toStatus)}
                  </p>
                  {entry.reason ? (
                    <p className="text-xs text-muted-foreground">{entry.reason}</p>
                  ) : null}
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDateTime(entry.createdAt, bcp47)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

function InvoiceFormSheet({
  slug,
  invoice,
  onClose,
  onSaved,
}: {
  slug: CompanySlug;
  invoice: InvoiceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const isEdit = invoice != null;

  const [fields, setFields] = useState(() => ({
    recipientName: invoice?.recipientName ?? '',
    recipientEmail: invoice?.recipientEmail ?? '',
    addressLine1: invoice?.recipientAddressLine1 ?? '',
    addressLine2: invoice?.recipientAddressLine2 ?? '',
    postalCode: invoice?.recipientPostalCode ?? '',
    city: invoice?.recipientCity ?? '',
    serviceDate: invoice?.serviceDate ?? '',
    serviceDateEnd: invoice?.serviceDateEnd ?? '',
    // Show the Leistungsdatum on the invoice? On for new invoices; for existing
    // ones, on only if a date is already set.
    showServiceDate: invoice ? Boolean(invoice.serviceDate) : true,
    customerType: (invoice?.customerType ?? 'b2c') as 'b2c' | 'b2b',
    taxRatePercent: (invoice?.taxRatePercent ?? 19) as InvoiceTaxRate,
    paymentTermsDays: String(invoice?.paymentTermsDays ?? 7),
    paymentMethod: (invoice?.paymentMethod ?? 'transfer') as InvoicePaymentMethod,
    notes: invoice?.notes ?? '',
  }));
  // Line prices are stored net; the editor shows them net by default. Operators
  // can flip to gross entry (VAT-inclusive) and the net/VAT are backed out live.
  const [priceMode, setPriceMode] = useState<PriceMode>('net');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({
          label: li.label,
          quantity: String(li.quantity),
          unitPriceEur: (li.unitPriceCents / 100).toFixed(2),
          isPackage: li.isPackage ?? false,
        }))
      : [emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);
  // Whether the operator has manually touched the payment term (suppresses the
  // customer-default auto-fill once they've made a deliberate choice).
  const [termTouched, setTermTouched] = useState(false);

  function setField<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  /** Best-effort: pull the recipient customer's default payment term into a new
   *  invoice (unless the operator already picked one). */
  async function maybePrefillTermFromCustomer() {
    if (isEdit || termTouched) return;
    const email = fields.recipientEmail.trim().toLowerCase();
    if (!email) return;
    try {
      const res = await customersAdminApi.list(slug, { email, limit: 1 });
      const term = res.customers[0]?.defaultPaymentTermsDays;
      if (term != null && !termTouched) setField('paymentTermsDays', String(term));
    } catch {
      // ignore lookup failures — the field keeps its current value
    }
  }

  const totals = useMemo(() => {
    const subtotal = computeSubtotalCents(lines, priceMode, fields.taxRatePercent);
    const tax = Math.round((subtotal * fields.taxRatePercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, fields.taxRatePercent, priceMode]);

  const mutation = useMutation({
    mutationFn: () => {
      const lineItems: InvoiceLineItem[] = lines.map((l) => ({
        label: l.label.trim(),
        quantity: toQuantity(l.quantity) || 1,
        unitPriceCents: lineNetCents(l, priceMode, fields.taxRatePercent),
        ...(l.isPackage ? { isPackage: true } : {}),
      }));
      const paymentTermsDays = Number(fields.paymentTermsDays);
      // Leistungsdatum only when the toggle is on; otherwise it's not stored/shown.
      const svcDate = fields.showServiceDate ? fields.serviceDate || null : null;
      const svcDateEnd = fields.showServiceDate ? fields.serviceDateEnd || null : null;

      if (invoice) {
        const patch: InvoiceUpdateInput = {
          recipientName: fields.recipientName.trim(),
          recipientEmail: fields.recipientEmail.trim() || null,
          recipientAddressLine1: fields.addressLine1.trim() || null,
          recipientAddressLine2: fields.addressLine2.trim() || null,
          recipientPostalCode: fields.postalCode.trim() || null,
          recipientCity: fields.city.trim() || null,
          serviceDate: svcDate,
          serviceDateEnd: svcDateEnd,
          lineItems,
          taxRatePercent: fields.taxRatePercent,
          paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
          paymentMethod: fields.paymentMethod,
          notes: fields.notes.trim() || null,
        };
        return invoicesAdminApi.update(slug, invoice.id, patch);
      }

      const input: InvoiceCreateInput = {
        recipientName: fields.recipientName.trim(),
        customerType: fields.customerType,
        lineItems,
        taxRatePercent: fields.taxRatePercent,
        paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : 7,
        paymentMethod: fields.paymentMethod,
      };
      if (fields.recipientEmail.trim()) input.recipientEmail = fields.recipientEmail.trim();
      if (fields.addressLine1.trim()) input.recipientAddressLine1 = fields.addressLine1.trim();
      if (fields.addressLine2.trim()) input.recipientAddressLine2 = fields.addressLine2.trim();
      if (fields.postalCode.trim()) input.recipientPostalCode = fields.postalCode.trim();
      if (fields.city.trim()) input.recipientCity = fields.city.trim();
      if (svcDate) input.serviceDate = svcDate;
      if (svcDateEnd) input.serviceDateEnd = svcDateEnd;
      if (fields.notes.trim()) input.notes = fields.notes.trim();
      return invoicesAdminApi.create(slug, input);
    },
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-5 overflow-y-auto bg-card p-5 text-foreground sm:max-w-lg"
      >
        <div className="pr-8">
          <SheetTitle className="not-sr-only font-serif text-xl tracking-tight">
            {invoice
              ? `${t('invoices.edit')} — ${invoiceNumber(invoice)}`
              : t('invoices.newInvoice')}
          </SheetTitle>
          <SheetDescription className="not-sr-only text-sm text-muted-foreground">
            {t('invoices.subtitle')}
          </SheetDescription>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <FormField label={t('invoices.form.recipientName')} required>
            <Input
              className="h-11 md:h-9"
              value={fields.recipientName}
              onChange={(e) => setField('recipientName', e.target.value)}
            />
          </FormField>
          <FormField label={t('invoices.form.recipientEmail')}>
            <Input
              type="email"
              className="h-11 md:h-9"
              value={fields.recipientEmail}
              onChange={(e) => setField('recipientEmail', e.target.value)}
              onBlur={() => void maybePrefillTermFromCustomer()}
            />
          </FormField>
          <FormField
            label={t('invoices.form.addressLine1')}
            hint={t('invoices.form.requiredForIssue')}
          >
            <AddressAutocomplete
              className="h-11 md:h-9"
              value={fields.addressLine1}
              onChange={(v) => setField('addressLine1', v)}
              onPick={(a) => {
                if (a.postcode) setField('postalCode', a.postcode);
                if (a.city) setField('city', a.city);
              }}
            />
          </FormField>
          <FormField label={t('invoices.form.addressLine2')}>
            <Input
              className="h-11 md:h-9"
              value={fields.addressLine2}
              onChange={(e) => setField('addressLine2', e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label={t('invoices.form.postalCode')}
              hint={t('invoices.form.requiredForIssue')}
            >
              <Input
                className="h-11 md:h-9"
                inputMode="numeric"
                value={fields.postalCode}
                onChange={(e) => setField('postalCode', e.target.value)}
              />
            </FormField>
            <FormField label={t('invoices.form.city')} hint={t('invoices.form.requiredForIssue')}>
              <Input
                className="h-11 md:h-9"
                value={fields.city}
                onChange={(e) => setField('city', e.target.value)}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={fields.showServiceDate}
              onChange={(e) => setField('showServiceDate', e.target.checked)}
            />
            {t('invoices.form.showServiceDate')}
          </label>
          {fields.showServiceDate ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('invoices.form.serviceDate')}>
                <Input
                  type="date"
                  className="h-11 md:h-9"
                  value={fields.serviceDate}
                  onChange={(e) => setField('serviceDate', e.target.value)}
                />
              </FormField>
              <FormField
                label={t('invoices.form.serviceDateEnd')}
                hint={t('invoices.form.serviceDateEndHint')}
              >
                <Input
                  type="date"
                  className="h-11 md:h-9"
                  value={fields.serviceDateEnd}
                  onChange={(e) => setField('serviceDateEnd', e.target.value)}
                />
              </FormField>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('invoices.form.customerType')}>
              <Select
                value={fields.customerType}
                disabled={isEdit}
                onChange={(e) => setField('customerType', e.target.value as 'b2c' | 'b2b')}
              >
                <option value="b2c">B2C</option>
                <option value="b2b">B2B</option>
              </Select>
            </FormField>
            <FormField label={t('invoices.form.taxRate')}>
              <Select
                value={String(fields.taxRatePercent)}
                onChange={(e) =>
                  setField('taxRatePercent', Number(e.target.value) as InvoiceTaxRate)
                }
              >
                <option value="0">{t('invoices.form.taxRate0')}</option>
                <option value="7">{t('invoices.form.taxRate7')}</option>
                <option value="19">{t('invoices.form.taxRate19')}</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('invoices.form.paymentMethod')}>
              <Select
                value={fields.paymentMethod}
                onChange={(e) => setField('paymentMethod', e.target.value as InvoicePaymentMethod)}
              >
                <option value="transfer">{t('invoices.form.paymentTransfer')}</option>
                <option value="card">{t('invoices.form.paymentCard')}</option>
                <option value="cash">{t('invoices.form.paymentCash')}</option>
              </Select>
            </FormField>
            <FormField
              label={t('invoices.form.paymentTerms')}
              hint={
                fields.paymentMethod !== 'transfer' ? t('invoices.form.paidNoTerms') : undefined
              }
            >
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className="h-11 md:h-9"
                disabled={fields.paymentMethod !== 'transfer'}
                value={fields.paymentTermsDays}
                onChange={(e) => {
                  setTermTouched(true);
                  setField('paymentTermsDays', e.target.value);
                }}
              />
            </FormField>
          </div>

          <LineItemsEditor
            lines={lines}
            onLinesChange={setLines}
            priceMode={priceMode}
            onPriceModeChange={setPriceMode}
            taxRatePercent={fields.taxRatePercent}
          />

          <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t('invoices.form.subtotal')}</span>
              <span className="tabular-nums">{formatEur(totals.subtotal, bcp47)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('invoices.form.tax')} ({fields.taxRatePercent} %)
              </span>
              <span className="tabular-nums">{formatEur(totals.tax, bcp47)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t pt-2 font-semibold">
              <span className="text-xs uppercase tracking-wide">{t('invoices.form.total')}</span>
              <span className="tabular-nums">{formatEur(totals.total, bcp47)}</span>
            </div>
          </div>

          <FormField label={t('invoices.form.notes')}>
            <Textarea
              rows={3}
              value={fields.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </FormField>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 md:min-h-9"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="min-h-11 flex-1 md:min-h-9"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isEdit ? t('invoices.form.save') : t('invoices.form.create')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
