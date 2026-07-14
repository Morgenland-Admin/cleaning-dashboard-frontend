import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  BellRing,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Info,
  Loader2,
  Package,
  Pencil,
  Printer,
  RefreshCcw,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { InvoiceFormSheet } from '@/components/invoice-form-sheet';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  errMessage,
  invoicesAdminApi,
  type InvoiceRow,
  type InvoiceStatus,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';

const STATUS_TONE: Record<InvoiceStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

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

/**
 * Download filename for an invoice PDF: "<number>-Rechnung-<Kundenname>.pdf".
 * Mirrors the backend's invoicePdfFilename() so the on-screen download matches
 * the emailed attachment. Drafts (no number) fall back to "Entwurf-<id>".
 */
function invoicePdfFilename(inv: InvoiceRow): string {
  const namePart = inv.recipientName
    .trim()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const numberOrRef = inv.number ?? `Entwurf-${inv.id}`;
  const base = [numberOrRef, 'Rechnung', namePart].filter(Boolean).join('-');
  return `${base.replace(/[^\w.-]+/g, '_')}.pdf`;
}

export function InvoiceDetailPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const slug = activeProject.companySlug;

  const [editing, setEditing] = useState(false);
  const [confirmState, setConfirmState] = useState<'send' | 'issue' | 'void' | 'dunning' | null>(
    null,
  );
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const query = useQuery({
    queryKey: ['invoice', slug, id] as const,
    enabled: !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => invoicesAdminApi.get(slug, id, signal),
  });
  const invoice = query.data?.invoice ?? null;

  const logQuery = useQuery({
    queryKey: ['invoice-log', slug, id] as const,
    enabled: !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => invoicesAdminApi.log(slug, id, signal),
  });

  usePageTitle(invoice ? invoiceNumber(invoice) : t('invoices.title'));

  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const h = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(h);
  }, [notice]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['invoice', slug, id] });
    void queryClient.invalidateQueries({ queryKey: ['invoice-log', slug, id] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
  }
  function surfaceError(err: unknown) {
    setNotice({
      tone: 'error',
      text: err instanceof ApiError ? err.message : (err as Error).message,
    });
  }

  // --- PDF (blob object URL) — fetched on demand, cached, revoked on unmount ---
  const [pdf, setPdf] = useState<{ url: string | null; loading: boolean; error: string | null }>({
    url: null,
    loading: false,
    error: null,
  });
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    return () => {
      if (pdf.url) URL.revokeObjectURL(pdf.url);
    };
  }, [pdf.url]);
  // A fresh issue changes the document (number stamped) — drop the cached blob.
  function resetPdf() {
    setPdf((p) => {
      if (p.url) URL.revokeObjectURL(p.url);
      return { url: null, loading: false, error: null };
    });
  }
  const ensurePdf = async (): Promise<string | null> => {
    if (pdf.url) return pdf.url;
    setPdf((p) => ({ ...p, loading: true, error: null }));
    try {
      const blob = await invoicesAdminApi.pdf(slug, id);
      const url = URL.createObjectURL(blob);
      setPdf({ url, loading: false, error: null });
      return url;
    } catch (e) {
      setPdf({ url: null, loading: false, error: errMessage(e) });
      return null;
    }
  };
  const downloadPdf = async () => {
    const url = await ensurePdf();
    if (!url || !invoice) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = invoicePdfFilename(invoice);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const openPdf = async () => {
    const url = await ensurePdf();
    if (url) window.open(url, '_blank', 'noopener');
  };
  // Print via a hidden same-origin iframe so the browser's print dialog opens
  // without leaving the page. Blob URLs are same-origin, so print() is allowed.
  const printPdf = async () => {
    const url = await ensurePdf();
    if (!url) return;
    if (printFrame.current) printFrame.current.remove();
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    document.body.appendChild(frame);
    printFrame.current = frame;
  };
  useEffect(() => {
    return () => {
      if (printFrame.current) printFrame.current.remove();
    };
  }, []);

  // --- Mutations -------------------------------------------------------------
  const sendMutation = useMutation({
    mutationFn: () => invoicesAdminApi.send(slug, id),
    onSuccess: (res) => {
      resetPdf();
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
    mutationFn: () => invoicesAdminApi.issue(slug, id),
    onSuccess: () => {
      resetPdf();
      invalidate();
      setConfirmState(null);
      setNotice({ tone: 'success', text: t('invoices.issued') });
      void printPdf();
    },
    onError: (err) => {
      setConfirmState(null);
      surfaceError(err);
    },
  });
  const markPaidMutation = useMutation({
    mutationFn: () => invoicesAdminApi.markPaid(slug, id),
    onSuccess: () => invalidate(),
    onError: surfaceError,
  });
  const dunningMutation = useMutation({
    mutationFn: () => invoicesAdminApi.dunning(slug, id),
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
    mutationFn: () => invoicesAdminApi.update(slug, id, { status: 'void' }),
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

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <BackLink t={t} />
        <EmptyState message={t('invoices.selectBrandFirst')} />
      </div>
    );
  }
  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <BackLink t={t} />
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }
  if (query.error || !invoice) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <BackLink t={t} />
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{query.error ? errMessage(query.error) : t('invoices.notFound')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
      </div>
    );
  }

  const statusLabel = (s: InvoiceStatus) => t(`invoices.status.${s}` as never);
  const isDraft = invoice.status === 'draft';
  const isIssuedOpen = invoice.status === 'sent' || invoice.status === 'overdue';
  const isImmutable = invoice.status === 'paid' || invoice.status === 'void';

  const confirmMeta = {
    send: {
      title: t('invoices.send'),
      description: t('invoices.confirmSend'),
      confirmLabel: t('invoices.send'),
      isDangerous: false,
      isPending: sendMutation.isPending,
      run: () => sendMutation.mutate(),
    },
    issue: {
      title: t('invoices.issuePrint'),
      description: t('invoices.confirmIssue'),
      confirmLabel: t('invoices.issuePrint'),
      isDangerous: false,
      isPending: issueMutation.isPending,
      run: () => issueMutation.mutate(),
    },
    void: {
      title: t('invoices.voidAction'),
      description: t('invoices.confirmVoid'),
      confirmLabel: t('invoices.voidAction'),
      isDangerous: true,
      isPending: voidMutation.isPending,
      run: () => voidMutation.mutate(),
    },
    dunning: {
      title: t('invoices.dunning'),
      description: t('invoices.confirmDunning'),
      confirmLabel: t('invoices.dunning'),
      isDangerous: false,
      isPending: dunningMutation.isPending,
      run: () => dunningMutation.mutate(),
    },
  }[confirmState ?? 'send'];

  const fullAddress = invoice.recipientAddressLine1 ? (
    <>
      {invoice.recipientAddressLine1}
      {invoice.recipientAddressLine2 ? <>, {invoice.recipientAddressLine2}</> : null}
      <br />
      {invoice.recipientPostalCode ?? ''} {invoice.recipientCity ?? ''}
    </>
  ) : (
    '—'
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <BackLink t={t} />

      {/* Header: number + recipient + status + primary actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">
              {invoiceNumber(invoice)}
            </h1>
            <StatusBadge tone={STATUS_TONE[invoice.status]} label={statusLabel(invoice.status)} />
            {invoice.dunningLevel > 0 ? (
              <StatusBadge
                tone="warning"
                label={t('invoices.dunningLevel', { n: invoice.dunningLevel })}
              />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeProject.name} · {invoice.recipientName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <Button size="sm" className="h-11 sm:h-9" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                {t('invoices.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={actionPending}
                onClick={() => setConfirmState('send')}
              >
                <Send className="size-3.5" aria-hidden="true" />
                {t('invoices.send')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={actionPending}
                onClick={() => setConfirmState('issue')}
              >
                <Printer className="size-3.5" aria-hidden="true" />
                {t('invoices.issuePrint')}
              </Button>
            </>
          ) : null}
          {isIssuedOpen ? (
            <>
              <Button
                size="sm"
                className="h-11 sm:h-9"
                disabled={actionPending}
                onClick={() => sendMutation.mutate()}
              >
                <Send className="size-3.5" aria-hidden="true" />
                {t('invoices.resend')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={actionPending}
                onClick={() => markPaidMutation.mutate()}
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {t('invoices.markPaid')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={actionPending}
                onClick={() => setConfirmState('dunning')}
              >
                <BellRing className="size-3.5" aria-hidden="true" />
                {t('invoices.dunning')}
              </Button>
            </>
          ) : null}
          {!isImmutable ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
              disabled={actionPending}
              onClick={() => setConfirmState('void')}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {t('invoices.voidAction')}
            </Button>
          ) : null}
        </div>
      </div>

      {isDraft ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t('invoices.draftEditableHint')}
        </p>
      ) : isImmutable ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t('invoices.immutableHint')}
        </p>
      ) : null}

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
            className="rounded-md p-1 transition-colors hover:bg-muted/60"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Two columns: details/line-items/history on the left, big PDF on the right */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('invoices.details')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <DetailRow label={t('invoices.recipient')}>{invoice.recipientName}</DetailRow>
              <DetailRow label={t('invoices.form.recipientEmail')}>
                {invoice.recipientEmail ?? '—'}
              </DetailRow>
              <DetailRow label={t('invoices.form.addressLine1')}>{fullAddress}</DetailRow>
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
              <div className="mt-1 grid gap-2 border-t border-border pt-3">
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('invoices.form.lineItems')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-md border">
                {invoice.lineItems.map((li, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span
                      className={cn('min-w-0 flex-1 truncate', li.isPackage && 'font-semibold')}
                    >
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
                  <span className="text-xs text-muted-foreground">
                    {t('invoices.form.subtotal')}
                  </span>
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
                  <span className="text-xs uppercase tracking-wide">
                    {t('invoices.form.total')}
                  </span>
                  <span className="tabular-nums">
                    {formatEur(invoice.totalCents, bcp47, invoice.currency)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('invoices.form.notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-base">
                <History className="size-4" aria-hidden="true" />
                {t('invoices.history')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  <span>{t('common.loading')}</span>
                </div>
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
            </CardContent>
          </Card>
        </div>

        {/* Right: big PDF preview + document actions (sticky on wide screens) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t('invoices.document')}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={pdf.loading}
                  onClick={printPdf}
                >
                  {pdf.loading ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Printer className="size-3.5" aria-hidden="true" />
                  )}
                  {t('invoices.print')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={pdf.loading}
                  onClick={downloadPdf}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  {t('invoices.pdfDownload')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={pdf.loading}
                  onClick={openPdf}
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  {t('invoices.openInNewTab')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pdf.error ? (
                <p className="mb-2 flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {pdf.error}
                </p>
              ) : null}
              <PdfPreview url={pdf.url} loading={pdf.loading} ensure={ensurePdf} t={t} />
            </CardContent>
          </Card>
        </div>
      </div>

      {editing ? (
        <InvoiceFormSheet
          slug={slug}
          invoice={invoice}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            resetPdf();
            invalidate();
          }}
        />
      ) : null}

      {confirmState ? (
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

function PdfPreview({
  url,
  loading,
  ensure,
  t,
}: {
  url: string | null;
  loading: boolean;
  ensure: () => Promise<string | null>;
  t: ReturnType<typeof useT>;
}) {
  // Load the preview automatically — on mount, and again whenever the cached
  // blob is dropped (e.g. after issuing/sending re-stamps the document).
  useEffect(() => {
    if (!url && !loading) void ensure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, loading]);

  if (url) {
    return (
      <object
        data={`${url}#toolbar=0`}
        type="application/pdf"
        className="h-[68vh] w-full rounded-md border bg-white"
        aria-label={t('invoices.document')}
      >
        <p className="p-3 text-xs text-muted-foreground">
          {t('invoices.pdfUnavailable')}{' '}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {t('invoices.pdfOpen')}
          </a>
        </p>
      </object>
    );
  }
  return (
    <div className="flex h-[68vh] w-full items-center justify-center rounded-md border bg-muted/20 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
    </div>
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

function BackLink({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <Link
      to="/rechnungen"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('invoices.backToList')}
    </Link>
  );
}
