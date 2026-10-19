import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BellRing,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Package,
  Pencil,
  Printer,
  Send,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmailLogList } from '@/components/email-log-list';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { LineItemsTotals } from '@/components/line-items-editor';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
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
import { cn, formatCurrency, formatDateTime, formatShortDate } from '@/lib/utils';

const STATUS_TONE: Record<InvoiceStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

function invoiceNumber(inv: InvoiceRow): string {
  return inv.number ?? `#${inv.id}`;
}

/** "<number>-Rechnung-<Kundenname>.pdf", mirroring the backend's invoicePdfFilename(); drafts use "Entwurf-<id>". */
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
  const navigate = useNavigate();
  const id = Number(params.id);
  const slug = activeProject.companySlug;

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

  const [pdf, setPdf] = useState<{ url: string | null; loading: boolean; error: string | null }>({
    url: null,
    loading: false,
    error: null,
  });
  // Refs so handlers created before the last render see the current URL and request (printPdf runs right after resetPdf).
  const pdfUrlRef = useRef<string | null>(null);
  const pdfRequestRef = useRef<Promise<string | null> | null>(null);
  // Bumped by resetPdf so a request started before it cannot cache the superseded document.
  const pdfGenerationRef = useRef(0);
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    return () => {
      if (pdf.url) URL.revokeObjectURL(pdf.url);
    };
  }, [pdf.url]);
  function resetPdf() {
    pdfGenerationRef.current += 1;
    pdfRequestRef.current = null;
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = null;
    setPdf({ url: null, loading: false, error: null });
  }
  const ensurePdf = (): Promise<string | null> => {
    if (pdfUrlRef.current) return Promise.resolve(pdfUrlRef.current);
    if (pdfRequestRef.current) return pdfRequestRef.current;
    const generation = pdfGenerationRef.current;
    setPdf({ url: null, loading: true, error: null });
    const request = invoicesAdminApi
      .pdf(slug, id)
      .then(
        (blob) => {
          if (generation !== pdfGenerationRef.current) return null;
          const url = URL.createObjectURL(blob);
          pdfUrlRef.current = url;
          setPdf({ url, loading: false, error: null });
          return url;
        },
        (e: unknown) => {
          if (generation === pdfGenerationRef.current) {
            setPdf({ url: null, loading: false, error: errMessage(e) });
          }
          return null;
        },
      )
      .finally(() => {
        if (pdfRequestRef.current === request) pdfRequestRef.current = null;
      });
    pdfRequestRef.current = request;
    return request;
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
  // Hidden same-origin iframe (blob URLs are same-origin) so print() works without leaving the page.
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

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to="/rechnungen">{t('invoices.backToList')}</BackLink>
    </RecordNav>
  );

  if (isAllBrands) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('invoices.title')} />
        <EmptyState
          variant="dashed"
          icon={<FileText aria-hidden="true" />}
          message={t('invoices.selectBrandFirst')}
        />
      </PageContainer>
    );
  }
  if (query.isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }
  if (query.error || !invoice) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('invoices.title')} />
        <ErrorState
          error={query.error ?? new Error(t('invoices.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const statusLabel = (s: InvoiceStatus) => t(`invoices.status.${s}` as never);
  const money = (cents: number) => formatCurrency(cents / 100, invoice.currency, bcp47);
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
  ) : null;

  const log = logQuery.data?.log ?? [];

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={id} hrefFor={(next) => `/rechnungen/${next}`} />)}

      <PageHeading
        title={<span className="tabular-nums">{invoiceNumber(invoice)}</span>}
        subtitle={`${activeProject.name} · ${invoice.recipientName}`}
        meta={
          <>
            <StatusBadge tone={STATUS_TONE[invoice.status]} label={statusLabel(invoice.status)} />
            {invoice.dunningLevel > 0 ? (
              <StatusBadge
                tone="warning"
                label={t('invoices.dunningLevel', { n: invoice.dunningLevel })}
              />
            ) : null}
          </>
        }
        actions={
          <>
            {isImmutable ? null : (
              <>
                {isDraft ? (
                  <>
                    <Button size="sm" onClick={() => navigate(`/rechnungen/${id}/bearbeiten`)}>
                      <Pencil aria-hidden="true" />
                      {t('invoices.edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => setConfirmState('send')}
                    >
                      <Send aria-hidden="true" />
                      {t('invoices.send')}
                    </Button>
                  </>
                ) : null}
                {isIssuedOpen ? (
                  <>
                    <Button
                      size="sm"
                      disabled={actionPending}
                      loading={sendMutation.isPending}
                      onClick={() => sendMutation.mutate()}
                    >
                      <Send aria-hidden="true" />
                      {t('invoices.resend')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionPending}
                      loading={markPaidMutation.isPending}
                      onClick={() => markPaidMutation.mutate()}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      {t('invoices.markPaid')}
                    </Button>
                  </>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t('invoices.moreActions')}
                      title={t('invoices.moreActions')}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isDraft ? (
                      <DropdownMenuItem
                        disabled={actionPending}
                        onSelect={() => setConfirmState('issue')}
                      >
                        <Printer aria-hidden="true" />
                        {t('invoices.issuePrint')}
                      </DropdownMenuItem>
                    ) : null}
                    {isIssuedOpen ? (
                      <DropdownMenuItem
                        disabled={actionPending}
                        onSelect={() => setConfirmState('dunning')}
                      >
                        <BellRing aria-hidden="true" />
                        {t('invoices.dunning')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={actionPending}
                      onSelect={() => setConfirmState('void')}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban aria-hidden="true" />
                      {t('invoices.voidAction')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-5">
        {isDraft || isImmutable ? (
          <Alert tone="neutral">
            {isDraft ? t('invoices.draftEditableHint') : t('invoices.immutableHint')}
          </Alert>
        ) : null}

        {notice ? (
          <Alert
            tone={notice.tone === 'error' ? 'destructive' : 'success'}
            onDismiss={() => setNotice(null)}
          >
            {notice.text}
          </Alert>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <SectionCard title={t('invoices.details')}>
              <KeyValueList>
                <KeyValue label={t('invoices.recipient')} value={invoice.recipientName} />
                <KeyValue
                  label={t('invoices.form.recipientEmail')}
                  value={invoice.recipientEmail}
                  empty="—"
                />
                <KeyValue label={t('invoices.form.addressLine1')} value={fullAddress} empty="—" />
                <KeyValue label={t('invoices.form.subject')} value={invoice.subject} empty="—" />
                <KeyValue
                  label={t('invoices.form.serviceDate')}
                  value={
                    invoice.serviceDate ? (
                      <span className="tabular-nums">
                        {formatShortDate(invoice.serviceDate, bcp47)}
                        {invoice.serviceDateEnd ? (
                          <> – {formatShortDate(invoice.serviceDateEnd, bcp47)}</>
                        ) : null}
                      </span>
                    ) : null
                  }
                  empty="—"
                />
                <KeyValue
                  label={t('invoices.form.customerType')}
                  value={invoice.customerType === 'b2b' ? 'B2B' : 'B2C'}
                />
                <KeyValue
                  label={t('invoices.form.paymentMethod')}
                  value={t(
                    `invoices.form.payment${
                      invoice.paymentMethod === 'card'
                        ? 'Card'
                        : invoice.paymentMethod === 'cash'
                          ? 'Cash'
                          : 'Transfer'
                    }` as never,
                  )}
                />
                {invoice.paymentMethod === 'transfer' ? (
                  <KeyValue
                    label={t('invoices.form.paymentTerms')}
                    value={<span className="tabular-nums">{invoice.paymentTermsDays}</span>}
                  />
                ) : null}
              </KeyValueList>
              <KeyValueList className="mt-3 border-t border-border pt-3">
                <KeyValue
                  label={t('invoices.createdAt')}
                  value={<Num>{formatDateTime(invoice.createdAt, bcp47)}</Num>}
                />
                <KeyValue
                  label={t('invoices.sentAt')}
                  value={invoice.sentAt ? <Num>{formatDateTime(invoice.sentAt, bcp47)}</Num> : null}
                  empty="—"
                />
                <KeyValue
                  label={t('invoices.dueAt')}
                  value={invoice.dueAt ? <Num>{formatShortDate(invoice.dueAt, bcp47)}</Num> : null}
                  empty="—"
                />
                <KeyValue
                  label={t('invoices.paidAt')}
                  value={invoice.paidAt ? <Num>{formatDateTime(invoice.paidAt, bcp47)}</Num> : null}
                  empty="—"
                />
              </KeyValueList>
            </SectionCard>

            <SectionCard
              title={t('invoices.form.lineItems')}
              description={invoice.packageMode ? t('invoices.packageModeNote') : undefined}
            >
              <ul className="divide-y divide-border rounded-md border border-border">
                {invoice.lineItems.map((li, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-2sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', li.isPackage && 'font-semibold')}>
                        {li.isPackage ? (
                          <Package
                            className="mr-1 inline size-3.5 align-[-2px]"
                            aria-hidden="true"
                          />
                        ) : null}
                        {li.label}
                      </span>
                      {li.note ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {li.note}
                        </span>
                      ) : null}
                    </span>
                    {/* Package invoice: a per-position 0,00 € would read as "free". */}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {invoice.packageMode ? li.quantity : `${li.quantity} ×`}
                    </span>
                    {invoice.packageMode ? null : (
                      <span
                        className={cn('shrink-0 tabular-nums', li.isPackage && 'font-semibold')}
                      >
                        {money(li.unitPriceCents)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <LineItemsTotals
                className="mt-2"
                subtotalCents={invoice.subtotalCents}
                taxCents={invoice.taxCents}
                totalCents={invoice.totalCents}
                taxRatePercent={invoice.taxRatePercent}
                currency={invoice.currency}
              />
            </SectionCard>

            {invoice.craftsmanService ? (
              <SectionCard title={t('invoices.form.craftsman')}>
                <KeyValueList>
                  <KeyValue
                    label={t('invoices.form.laborGross')}
                    value={
                      invoice.laborGrossCents != null ? (
                        <Num>{money(invoice.laborGrossCents)}</Num>
                      ) : null
                    }
                    empty="—"
                  />
                  <KeyValue
                    label={t('invoices.form.laborVat')}
                    value={
                      invoice.laborVatCents != null ? (
                        <Num>{money(invoice.laborVatCents)}</Num>
                      ) : null
                    }
                    empty="—"
                  />
                </KeyValueList>
                {/* §35a sentence exactly as printed/sent. */}
                {invoice.craftsmanNote ? (
                  <p className="mt-3 rounded-md bg-muted p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {invoice.craftsmanNote}
                  </p>
                ) : null}
              </SectionCard>
            ) : null}

            {invoice.notes ? (
              <SectionCard title={t('invoices.form.notes')}>
                <p className="whitespace-pre-wrap text-2sm text-muted-foreground">
                  {invoice.notes}
                </p>
              </SectionCard>
            ) : null}

            <SectionCard title={t('invoices.history')}>
              {logQuery.isLoading ? (
                <LoadingState inline />
              ) : logQuery.error ? (
                <ErrorState
                  error={logQuery.error}
                  onRetry={() => void logQuery.refetch()}
                  retrying={logQuery.isFetching}
                />
              ) : log.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ol className="ml-1 space-y-3 border-l border-border pl-4">
                  {log.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-muted-foreground"
                      />
                      <p className="text-2sm font-medium">
                        {entry.fromStatus ? <>{statusLabel(entry.fromStatus)} → </> : null}
                        {statusLabel(entry.toStatus)}
                      </p>
                      {entry.reason ? (
                        <p className="text-xs text-muted-foreground">{entry.reason}</p>
                      ) : null}
                      <p className="text-2xs tabular-nums text-muted-foreground">
                        {formatDateTime(entry.createdAt, bcp47)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            <SectionCard title={t('emails.record.title')}>
              <EmailLogList
                parentKey={['invoice', slug, id]}
                brand={slug}
                filter={{ refType: 'invoice', refId: id }}
              />
            </SectionCard>
          </div>

          <div className="min-w-0 xl:sticky xl:top-[4.5rem] xl:self-start">
            <SectionCard title={t('invoices.document')}>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" loading={pdf.loading} onClick={printPdf}>
                  <Printer aria-hidden="true" />
                  {t('invoices.print')}
                </Button>
                <Button size="sm" variant="outline" disabled={pdf.loading} onClick={downloadPdf}>
                  <Download aria-hidden="true" />
                  {t('invoices.pdfDownload')}
                </Button>
                <Button size="sm" variant="outline" disabled={pdf.loading} onClick={openPdf}>
                  <ExternalLink aria-hidden="true" />
                  {t('invoices.openInNewTab')}
                </Button>
              </div>
              <PdfPreview
                url={pdf.url}
                loading={pdf.loading}
                error={pdf.error}
                ensure={ensurePdf}
              />
            </SectionCard>
          </div>
        </div>
      </div>

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
    </PageContainer>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}

function PdfPreview({
  url,
  loading,
  error,
  ensure,
}: {
  url: string | null;
  loading: boolean;
  error: string | null;
  ensure: () => Promise<string | null>;
}) {
  const t = useT();
  // Auto-load on mount and after the blob is dropped; a failed load stays failed until retry
  // (re-fetching on every loading flip looped forever against a failing PDF endpoint).
  useEffect(() => {
    if (!url && !loading && !error) void ensure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, loading, error]);

  if (url) {
    return (
      <object
        data={`${url}#toolbar=0`}
        type="application/pdf"
        className="h-[68vh] w-full rounded-md border border-border bg-white"
        aria-label={t('invoices.document')}
      >
        <p className="p-3 text-xs text-muted-foreground">
          {t('invoices.pdfUnavailable')}{' '}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('invoices.pdfOpen')}
          </a>
        </p>
      </object>
    );
  }
  if (error && !loading) {
    return (
      <ErrorState
        title={t('invoices.pdfUnavailable')}
        error={new Error(error)}
        onRetry={() => void ensure()}
      />
    );
  }
  return (
    <div className="flex h-[68vh] w-full items-center justify-center rounded-md border border-border bg-muted">
      <LoadingState />
    </div>
  );
}
