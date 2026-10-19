import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardEdit,
  Inbox,
  ListPlus,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Send,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { LineItemsEditor } from '@/components/line-items-editor';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard, SectionLabel } from '@/components/section';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  aiApi,
  errMessage,
  inquiriesApi,
  type InquiryEmail,
  type InquiryEmailStatus,
  type InquiryStatus,
  type ServiceInquiry,
  ApiError,
} from '@/lib/api';
import {
  emptyLine,
  grossFromNetCents,
  netFromGrossCents,
  toCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime, formatShortDate } from '@/lib/utils';

const STATUS_VARIANT: Record<
  InquiryStatus,
  'default' | 'info' | 'warning' | 'success' | 'secondary'
> = {
  new: 'info',
  in_review: 'warning',
  quoted: 'default',
  won: 'success',
  lost: 'secondary',
};

const STATUS_KEY: Record<InquiryStatus, string> = {
  new: 'inquiries.status.new',
  in_review: 'inquiries.status.in_review',
  quoted: 'inquiries.status.quoted',
  won: 'inquiries.status.won',
  lost: 'inquiries.status.lost',
};

type PanelTab = 'request' | 'offer' | 'emails' | 'notes';

type ListState = { from?: string; ids?: { slug: CompanySlug; id: number }[] } | null;

// Default VAT (%) used to gross up net-entered offer lines.
const OFFER_VAT = 19;
const OFFER_ITEMS_MARKER = '\n\n— Positionen —\n';

function offerEur(cents: number, bcp47: string): string {
  return formatCurrency(cents / 100, 'EUR', bcp47);
}

function offerLineGrossCents(l: LineDraft, priceMode: PriceMode): number {
  const unit = toCents(l.unitPriceEur);
  const grossUnit = priceMode === 'gross' ? unit : grossFromNetCents(unit, OFFER_VAT);
  return Math.round(toQuantity(l.quantity) * grossUnit);
}

function inquiryPath(slug: CompanySlug, id: number): string {
  return `/inquiries/${encodeURIComponent(slug)}/${id}`;
}

function loadError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('inquiries.errUnauthorized'));
    if (error.status === 403) return new Error(t('inquiries.errForbidden'));
    return error;
  }
  return new Error(t('inquiries.errGeneric'));
}

// The brand comes from the URL, so links stay valid when the brand switcher changes.
export function InquiryDetailPage() {
  const t = useT();
  const location = useLocation();
  const { slug, id: idParam } = useParams();
  const { projects } = useProject();

  const brand = projects.find((p) => p.companySlug === slug) ?? null;
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const query = useQuery({
    queryKey: ['inquiry-detail', brand?.companySlug ?? 'none', id ?? 0] as const,
    queryFn: ({ signal }) => inquiriesApi.get(brand!.companySlug, id!, signal),
    enabled: !!brand && id !== null,
  });

  const inquiry = query.data?.inquiry ?? null;
  usePageTitle(inquiry?.name ?? t('inquiries.title'));

  const state = location.state as ListState;
  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={`/inquiries${state?.from ?? ''}`}>{t('inquiries.title')}</BackLink>
    </RecordNav>
  );

  if (brand && id !== null && query.isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" label={t('inquiries.loading')} />
      </PageContainer>
    );
  }

  if (!brand || id === null || !inquiry) {
    const error = loadError(query.error, t);
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('inquiries.title')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" icon={<Inbox />} message={t('inquiries.notFound')} />
        )}
      </PageContainer>
    );
  }

  return (
    <InquiryRecord
      key={`${brand.companySlug}:${inquiry.id}`}
      inquiry={inquiry}
      brand={brand}
      state={state}
      backRow={backRow}
    />
  );
}

function InquiryRecord({
  inquiry,
  brand,
  state,
  backRow,
}: {
  inquiry: ServiceInquiry;
  brand: Project;
  state: ListState;
  backRow: (pager?: ReactNode) => ReactNode;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companySlug = brand.companySlug;
  const detailKey = ['inquiry-detail', companySlug, inquiry.id] as const;

  function applyUpdate(updated: ServiceInquiry | undefined) {
    if (updated) queryClient.setQueryData(detailKey, { inquiry: updated });
    else void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
    void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    void queryClient.invalidateQueries({ queryKey: ['human-callbacks'] });
  }

  const updateMutation = useMutation({
    mutationFn: (vars: { status?: InquiryStatus; internalNotes?: string | null }) =>
      inquiriesApi.update(companySlug, inquiry.id, {
        status: vars.status,
        internalNotes: vars.internalNotes,
      }),
    onSuccess: (res) => applyUpdate(res.inquiry),
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('inquiries.updateFailed'),
        description: errMessage(err),
      });
    },
  });
  const pendingStatus = updateMutation.isPending
    ? (updateMutation.variables?.status ?? null)
    : null;
  const savingNotes =
    updateMutation.isPending && updateMutation.variables?.internalNotes !== undefined;

  const [notes, setNotes] = useState(inquiry.internalNotes ?? '');
  const notesDirty = notes !== (inquiry.internalNotes ?? '');

  const notesAssist = useClaudeAssist({
    kind: 'inquiry_note',
    companySlug,
    refId: inquiry.id,
    getCurrent: () => notes,
    apply: setNotes,
    updatedLabel: t('ai.updated'),
  });

  const [offerBody, setOfferBody] = useState('');
  const [offerAmount, setOfferAmount] = useState(inquiry.quotedAmount ?? '');
  const [showOfferItems, setShowOfferItems] = useState(false);
  const [offerLines, setOfferLines] = useState<LineDraft[]>(() => [emptyLine()]);
  // Offers quote the customer a gross price, so the editor defaults to gross.
  const [offerPriceMode, setOfferPriceMode] = useState<PriceMode>('gross');
  const offerItemsGrossCents = useMemo(
    () => offerLines.reduce((sum, l) => sum + offerLineGrossCents(l, offerPriceMode), 0),
    [offerLines, offerPriceMode],
  );

  // Idempotent: an existing positions block (below the marker) is rebuilt, never stacked.
  function applyOfferItems() {
    const items = offerLines.filter((l) => l.label.trim() && toCents(l.unitPriceEur) !== 0);
    if (items.length === 0) return;
    const rows = items.map((l) => {
      const q = toQuantity(l.quantity) || 1;
      const bullet = l.isPackage ? '★ ' : '• ';
      return `${bullet}${l.label.trim()}: ${q} × ${offerEur(
        offerLineGrossCents({ ...l, quantity: '1' }, offerPriceMode),
        bcp47,
      )} = ${offerEur(offerLineGrossCents(l, offerPriceMode), bcp47)}`;
    });
    const block = `${OFFER_ITEMS_MARKER}${rows.join('\n')}\n${t(
      'inquiries.offerItemsTotal',
    )}: ${offerEur(offerItemsGrossCents, bcp47)}`;
    const base = offerBody.split(OFFER_ITEMS_MARKER)[0]!.trimEnd();
    setOfferBody(base + block);
    setOfferAmount((offerItemsGrossCents / 100).toFixed(2));
  }

  const offerAssist = useClaudeAssist({
    kind: 'inquiry_quote',
    companySlug,
    refId: inquiry.id,
    getCurrent: () => offerBody,
    apply: setOfferBody,
    updatedLabel: t('ai.updated'),
  });

  // Prices are set only when the text names one; missing prices stay blank for the operator.
  const extractItemsMutation = useMutation({
    mutationFn: () =>
      aiApi.extractOfferItems(companySlug, inquiry.id, offerBody.trim() || undefined),
    onSuccess: ({ items }) => {
      if (items.length === 0) {
        toast({ title: t('inquiries.extractItemsEmpty') });
        return;
      }
      const drafts: LineDraft[] = items.map((it) => {
        // Extracted prices are gross; convert to the editor's active mode.
        const grossCents = it.unitPriceGross == null ? null : Math.round(it.unitPriceGross * 100);
        const unitPriceEur =
          grossCents == null
            ? ''
            : offerPriceMode === 'gross'
              ? (grossCents / 100).toFixed(2)
              : (netFromGrossCents(grossCents, OFFER_VAT) / 100).toFixed(2);
        return {
          label: it.label,
          note: '',
          quantity: String(it.quantity > 0 ? it.quantity : 1),
          unitPriceEur,
          isPackage: false,
        };
      });
      setShowOfferItems(true);
      setOfferLines((prev) => {
        const hasContent = prev.some((l) => l.label.trim() || toCents(l.unitPriceEur) !== 0);
        return hasContent ? [...prev, ...drafts] : drafts;
      });
      toast({ title: t('inquiries.extractItemsDone', { count: drafts.length }) });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('inquiries.extractItemsFailed'),
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  // Second step: sending mails the customer and flips the lead to "quoted".
  const [confirmSendOffer, setConfirmSendOffer] = useState(false);

  const sendQuoteMutation = useMutation({
    mutationFn: () =>
      inquiriesApi.sendQuote(companySlug, inquiry.id, {
        body: offerBody,
        quotedAmount: offerAmount.trim() === '' ? null : offerAmount.trim(),
      }),
    onSuccess: (res) => {
      setConfirmSendOffer(false);
      setOfferBody('');
      applyUpdate(res.inquiry);
      void queryClient.invalidateQueries({ queryKey: ['inquiry-emails', companySlug, inquiry.id] });
      toast({ title: t('inquiries.offerSent') });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('inquiries.offerFailed'),
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const emailsQuery = useQuery({
    queryKey: ['inquiry-emails', companySlug, inquiry.id],
    queryFn: ({ signal }) => inquiriesApi.emails(companySlug, inquiry.id, signal),
  });
  const emailCount = emailsQuery.data?.emails.length ?? 0;

  const hasEmail = Boolean(inquiry.email);
  const [panelTab, setPanelTab] = useState<PanelTab>('request');

  const [editingContact, setEditingContact] = useState(false);
  const [emailDraft, setEmailDraft] = useState(inquiry.email ?? '');
  const [phoneDraft, setPhoneDraft] = useState(inquiry.phone ?? '');
  const emailValid =
    emailDraft.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim());

  const contactMutation = useMutation({
    mutationFn: () =>
      inquiriesApi.update(companySlug, inquiry.id, {
        email: emailDraft.trim() === '' ? null : emailDraft.trim(),
        phone: phoneDraft.trim() === '' ? null : phoneDraft.trim(),
      }),
    onSuccess: (res) => {
      setEditingContact(false);
      applyUpdate(res.inquiry);
      toast({ title: t('inquiries.contactSaved') });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('inquiries.contactSaveFailed'),
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  function startContactEdit() {
    setEmailDraft(inquiry.email ?? '');
    setPhoneDraft(inquiry.phone ?? '');
    setEditingContact(true);
  }

  const composerBox =
    'overflow-hidden rounded-lg border border-input bg-card transition-colors duration-fast focus-within:border-ring focus-within:ring-1 focus-within:ring-ring';
  const composerTextarea =
    'block min-h-[130px] w-full resize-none border-0 bg-transparent px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-sm';

  const metadataEntries = Object.entries(inquiry.metadata ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  const hasRequestFacts = Boolean(
    inquiry.service ||
    inquiry.plz ||
    inquiry.callReason ||
    inquiry.preferredDate ||
    inquiry.budget ||
    inquiry.quotedAmount,
  );

  return (
    <PageContainer>
      {backRow(
        <RecordPager
          state={state}
          slug={companySlug}
          id={inquiry.id}
          onGo={(slug, id) => navigate(inquiryPath(slug, id), { state, replace: true })}
          t={t}
        />,
      )}
      <PageHeading
        title={inquiry.name}
        subtitle={t('contacts.detailFrom', {
          name: inquiry.email ?? inquiry.phone ?? '—',
          date: formatDateTime(inquiry.createdAt, bcp47),
        })}
        meta={
          <>
            <Badge variant={STATUS_VARIANT[inquiry.status]}>
              {t(STATUS_KEY[inquiry.status] as never)}
            </Badge>
            <BrandChip brand={brand} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {inquiry.inquiryNumber}
            </span>
          </>
        }
        actions={
          <>
            <StatusActions
              status={inquiry.status}
              onChange={(status) => updateMutation.mutate({ status })}
              disabled={updateMutation.isPending}
              pendingStatus={pendingStatus}
              t={t}
            />
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0 self-start">
          <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as PanelTab)}>
            <TabsList variant="line" overflow="scroll" className="px-4 sm:px-5">
              <TabsTrigger value="request">{t('inquiries.panelTab.request')}</TabsTrigger>
              {hasEmail ? (
                <TabsTrigger value="offer">
                  <Send aria-hidden="true" />
                  {t('inquiries.panelTab.offer')}
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="emails">
                {t('inquiries.panelTab.emails')}
                {emailCount > 0 ? (
                  <CountPill tone={panelTab === 'emails' ? 'accent' : 'muted'}>
                    {emailCount}
                  </CountPill>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="notes">
                {t('inquiries.panelTab.notes')}
                {notesDirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-highlight" aria-hidden="true" />
                    <span className="sr-only">({t('inquiries.notesUnsaved')})</span>
                  </>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <div className="p-4 sm:p-5">
              <TabsContent value="request" className="mt-0 flex flex-col gap-5">
                {hasRequestFacts ? (
                  <div className="space-y-2">
                    <SectionLabel>{t('inquiries.requestDetails')}</SectionLabel>
                    <KeyValueList layout="grid">
                      <KeyValue label={t('inquiries.fields.service')} value={inquiry.service} />
                      <KeyValue
                        label={t('inquiries.fields.plz')}
                        value={
                          inquiry.plz ? <span className="tabular-nums">{inquiry.plz}</span> : null
                        }
                      />
                      <KeyValue
                        label={t('inquiries.fields.callReason')}
                        value={inquiry.callReason}
                      />
                      <KeyValue
                        label={t('inquiries.fields.preferredDate')}
                        value={
                          inquiry.preferredDate ? (
                            <span className="tabular-nums">
                              {formatShortDate(inquiry.preferredDate, bcp47)}
                            </span>
                          ) : null
                        }
                      />
                      <KeyValue label={t('inquiries.fields.budget')} value={inquiry.budget} />
                      <KeyValue
                        label={t('inquiries.fields.quotedAmount')}
                        value={
                          inquiry.quotedAmount ? (
                            <span className="tabular-nums">{inquiry.quotedAmount} €</span>
                          ) : null
                        }
                      />
                    </KeyValueList>
                  </div>
                ) : null}

                {inquiry.propertyDetails ? (
                  <div className="space-y-2">
                    <SectionLabel>{t('inquiries.fields.propertyDetails')}</SectionLabel>
                    <p className="whitespace-pre-wrap break-words text-2sm leading-relaxed">
                      {inquiry.propertyDetails}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <SectionLabel>{t('inquiries.fields.message')}</SectionLabel>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-4 py-3 text-2sm leading-relaxed">
                    {inquiry.message}
                  </p>
                </div>
              </TabsContent>

              {hasEmail ? (
                <TabsContent value="offer" className="mt-0">
                  <Label
                    htmlFor="inquiry-offer-body"
                    className="mb-1.5 block text-xs font-normal text-muted-foreground"
                  >
                    {t('inquiries.offerAutoNote')}
                  </Label>
                  <div className={composerBox}>
                    {/* Faded preview of the auto-added greeting: the operator's text is only the middle of the letter (see inquiryQuoteEmail). */}
                    <div className="select-none space-y-0.5 border-b border-border px-3 pb-2 pt-2.5 text-sm leading-relaxed text-muted-foreground">
                      <p>{t('inquiries.offerGreeting', { name: inquiry.name || '…' })}</p>
                      <p>{t('inquiries.offerIntro')}</p>
                    </div>
                    <textarea
                      id="inquiry-offer-body"
                      rows={6}
                      value={offerBody}
                      onChange={(e) => setOfferBody(e.target.value)}
                      placeholder={t('inquiries.offerBodyPlaceholder')}
                      className={composerTextarea}
                    />
                    <div className="select-none space-y-0.5 border-t border-border px-3 pb-2.5 pt-2 text-sm leading-relaxed text-muted-foreground">
                      <p>{brand.mailSignOff ?? t('inquiries.offerClosing')}</p>
                      <p>
                        {brand.mailSignatory ??
                          t('inquiries.offerSignatoryFallback', { brand: brand.name })}
                      </p>
                    </div>
                    <ClaudeChatBox
                      editablePrompt={{ kind: 'inquiry_quote', companySlug }}
                      busy={offerAssist.busy}
                      history={offerAssist.history}
                      placeholder={t('ai.placeholder')}
                      idleHint={offerBody.trim() ? t('ai.idleRefine') : t('ai.idleFresh')}
                      busyHint={t('ai.writing')}
                      sendLabel={t('ai.send')}
                      quickActions={[
                        {
                          label: t('ai.draftOffer'),
                          run: () =>
                            offerAssist.run(undefined, t('ai.draftOffer'), { fresh: true }),
                        },
                        {
                          label: t('ai.shorter'),
                          run: () => offerAssist.run('Deutlich kürzer fassen.', t('ai.shorter')),
                        },
                        {
                          label: t('ai.formal'),
                          run: () =>
                            offerAssist.run('Etwas förmlicher formulieren.', t('ai.formal')),
                        },
                      ]}
                      onSend={(instruction) => offerAssist.run(instruction, instruction)}
                    />
                  </div>
                  {showOfferItems ? (
                    <div className="mt-3 rounded-lg border border-border p-3">
                      <div className="mb-3 flex justify-end">
                        <ExtractItemsButton
                          pending={extractItemsMutation.isPending}
                          onClick={() => extractItemsMutation.mutate()}
                          t={t}
                        />
                      </div>
                      <LineItemsEditor
                        lines={offerLines}
                        onLinesChange={setOfferLines}
                        priceMode={offerPriceMode}
                        onPriceModeChange={setOfferPriceMode}
                        taxRatePercent={OFFER_VAT}
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {t('inquiries.offerItemsTotal')}: {offerEur(offerItemsGrossCents, bcp47)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={offerItemsGrossCents === 0}
                          onClick={applyOfferItems}
                        >
                          {t('inquiries.applyOfferItems')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowOfferItems(true)}
                      >
                        <ListPlus aria-hidden="true" />
                        {t('inquiries.addOfferItems')}
                      </Button>
                      <ExtractItemsButton
                        pending={extractItemsMutation.isPending}
                        onClick={() => extractItemsMutation.mutate()}
                        t={t}
                      />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="inquiry-offer-amount"
                        className="text-xs font-normal text-muted-foreground"
                      >
                        {t('inquiries.offerAmount')}
                      </Label>
                      <Input
                        id="inquiry-offer-amount"
                        inputMode="decimal"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-28 text-right tabular-nums"
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={offerBody.trim() === ''}
                      loading={sendQuoteMutation.isPending}
                      onClick={() => setConfirmSendOffer(true)}
                    >
                      <Send aria-hidden="true" />
                      {t('inquiries.sendOfferCta')}
                    </Button>
                  </div>
                </TabsContent>
              ) : null}

              <TabsContent value="emails" className="mt-0">
                <EmailHistory query={emailsQuery} t={t} bcp47={bcp47} />
              </TabsContent>

              <TabsContent value="notes" className="mt-0">
                <div className={composerBox}>
                  <textarea
                    id="inquiry-internal-notes"
                    aria-label={t('inquiries.notes')}
                    rows={6}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('inquiries.notesPlaceholder')}
                    className={composerTextarea}
                  />
                  <ClaudeChatBox
                    editablePrompt={{ kind: 'inquiry_note', companySlug }}
                    busy={notesAssist.busy}
                    history={notesAssist.history}
                    placeholder={t('ai.placeholder')}
                    idleHint={notes.trim() ? t('ai.idleRefine') : t('ai.idleFresh')}
                    busyHint={t('ai.writing')}
                    sendLabel={t('ai.send')}
                    quickActions={[
                      {
                        label: t('ai.draftNote'),
                        run: () => notesAssist.run(undefined, t('ai.draftNote'), { fresh: true }),
                      },
                      {
                        label: t('ai.nextSteps'),
                        run: () =>
                          notesAssist.run(
                            'Konzentriere dich auf konkrete nächste Schritte.',
                            t('ai.nextSteps'),
                          ),
                      },
                      {
                        label: t('ai.shorter'),
                        run: () => notesAssist.run('Deutlich kürzer fassen.', t('ai.shorter')),
                      },
                    ]}
                    onSend={(instruction) => notesAssist.run(instruction, instruction)}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!notesDirty || updateMutation.isPending}
                    loading={savingNotes}
                    onClick={() =>
                      updateMutation.mutate({ internalNotes: notes.trim() === '' ? null : notes })
                    }
                  >
                    {t('inquiries.saveNotes')}
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </Card>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard
            title={t('inquiries.contactTitle')}
            actions={
              editingContact ? (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditingContact(false)}
                    disabled={contactMutation.isPending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => contactMutation.mutate()}
                    disabled={!emailValid}
                    loading={contactMutation.isPending}
                  >
                    {t('common.save')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={startContactEdit}
                >
                  <Pencil aria-hidden="true" />
                  {t('common.edit')}
                </Button>
              )
            }
          >
            <KeyValueList layout="stacked">
              <KeyValue
                label={t('inquiries.fields.email')}
                empty="—"
                value={
                  editingContact ? (
                    <div className="flex flex-col gap-1">
                      <Input
                        type="email"
                        inputMode="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder={t('inquiries.emailPlaceholder')}
                        aria-label={t('inquiries.fields.email')}
                        aria-invalid={!emailValid}
                        aria-describedby={!emailValid ? 'inquiry-email-error' : undefined}
                      />
                      {!emailValid ? (
                        <span
                          id="inquiry-email-error"
                          role="alert"
                          className="text-xs font-medium text-destructive"
                        >
                          {t('inquiries.invalidEmail')}
                        </span>
                      ) : null}
                    </div>
                  ) : inquiry.email ? (
                    <a
                      href={`mailto:${inquiry.email}`}
                      className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {inquiry.email}
                    </a>
                  ) : null
                }
              />
              {editingContact || inquiry.phone ? (
                <KeyValue
                  label={t('inquiries.fields.phone')}
                  value={
                    editingContact ? (
                      <Input
                        type="tel"
                        inputMode="tel"
                        value={phoneDraft}
                        onChange={(e) => setPhoneDraft(e.target.value)}
                        placeholder={t('inquiries.phonePlaceholder')}
                        aria-label={t('inquiries.fields.phone')}
                      />
                    ) : (
                      <a
                        href={`tel:${inquiry.phone}`}
                        className="inline-flex items-center gap-1 rounded-sm tabular-nums text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Phone className="size-3" aria-hidden="true" />
                        {inquiry.phone}
                      </a>
                    )
                  }
                />
              ) : null}
              <KeyValue
                label={t('inquiries.fields.consentMarketing')}
                value={inquiry.consentMarketing ? t('common.yes') : t('common.no')}
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('inquiries.statusTitle')}>
            <KeyValueList>
              <KeyValue
                label={t('inquiries.colStatus')}
                value={
                  <Badge variant={STATUS_VARIANT[inquiry.status]}>
                    {t(STATUS_KEY[inquiry.status] as never)}
                  </Badge>
                }
              />
              <KeyValue
                label={t('inquiries.colCallback')}
                value={
                  inquiry.callbackOwner ? (
                    <CallbackOwnerBadge owner={inquiry.callbackOwner} t={t} />
                  ) : null
                }
              />
              <KeyValue label={t('inquiries.fields.source')} value={inquiry.source} />
              <KeyValue
                label={t('inquiries.timeline.created')}
                value={<DateValue iso={inquiry.createdAt} bcp47={bcp47} />}
              />
              {inquiry.handledAt ? (
                <KeyValue
                  label={t('inquiries.timeline.handled')}
                  value={<DateValue iso={inquiry.handledAt} bcp47={bcp47} />}
                />
              ) : null}
              {inquiry.quotedAt ? (
                <KeyValue
                  label={t('inquiries.timeline.quoted')}
                  value={<DateValue iso={inquiry.quotedAt} bcp47={bcp47} />}
                />
              ) : null}
              {inquiry.closedAt ? (
                <KeyValue
                  label={t('inquiries.timeline.closed')}
                  value={<DateValue iso={inquiry.closedAt} bcp47={bcp47} />}
                />
              ) : null}
            </KeyValueList>
          </SectionCard>

          {inquiry.attachments.length > 0 ? (
            <SectionCard
              title={t('inquiries.fields.attachments')}
              description={String(inquiry.attachments.length)}
            >
              <AttachmentGallery
                companySlug={companySlug}
                attachments={inquiry.attachments}
                className="grid grid-cols-2 gap-2"
              />
            </SectionCard>
          ) : null}

          {metadataEntries.length > 0 ? (
            <MetadataCard entries={metadataEntries} label={t('inquiries.metadataTitle')} t={t} />
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSendOffer}
        onOpenChange={setConfirmSendOffer}
        title={t('inquiries.confirmSendOfferTitle')}
        description={t('inquiries.confirmSendOfferBody', {
          to: inquiry.email ?? '—',
        })}
        confirmLabel={t('inquiries.sendOfferCta')}
        onConfirm={() => sendQuoteMutation.mutate()}
        isPending={sendQuoteMutation.isPending}
      />
    </PageContainer>
  );
}

function StatusActions({
  status,
  onChange,
  disabled,
  pendingStatus,
  t,
}: {
  status: InquiryStatus;
  onChange: (status: InquiryStatus) => void;
  disabled: boolean;
  pendingStatus: InquiryStatus | null;
  t: ReturnType<typeof useT>;
}) {
  const NEXT: Partial<Record<InquiryStatus, InquiryStatus>> = {
    new: 'in_review',
    in_review: 'quoted',
    quoted: 'won',
  };
  const all: { target: InquiryStatus; label: string; icon: ReactNode }[] = [
    {
      target: 'in_review',
      label: t('inquiries.actions.review'),
      icon: <ClipboardEdit aria-hidden="true" />,
    },
    {
      target: 'quoted',
      label: t('inquiries.actions.quoted'),
      icon: <CircleDollarSign aria-hidden="true" />,
    },
    { target: 'won', label: t('inquiries.actions.won'), icon: <Trophy aria-hidden="true" /> },
    { target: 'lost', label: t('inquiries.actions.lost'), icon: <XCircle aria-hidden="true" /> },
    { target: 'new', label: t('inquiries.actions.reset'), icon: <CheckCheck aria-hidden="true" /> },
  ];
  const primaryTarget = NEXT[status];
  const primary = all.find((a) => a.target === primaryTarget);
  const rest = all.filter((a) => a.target !== status && a.target !== primaryTarget);

  return (
    <>
      {primary ? (
        <Button
          size="sm"
          disabled={disabled}
          loading={pendingStatus === primary.target}
          onClick={() => onChange(primary.target)}
        >
          {primary.icon}
          {primary.label}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={disabled}
            aria-label={t('inquiries.moreActions')}
            title={t('inquiries.moreActions')}
            loading={pendingStatus !== null && pendingStatus !== primaryTarget}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {rest.map((a) => (
            <DropdownMenuItem key={a.target} onSelect={() => onChange(a.target)}>
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function RecordPager({
  state,
  slug,
  id,
  onGo,
  t,
}: {
  state: ListState;
  slug: CompanySlug;
  id: number;
  onGo: (slug: CompanySlug, id: number) => void;
  t: ReturnType<typeof useT>;
}) {
  const ids = state?.ids ?? [];
  const index = ids.findIndex((r) => r.slug === slug && r.id === id);
  if (index === -1 || ids.length < 2) return null;
  const prev = index > 0 ? ids[index - 1] : undefined;
  const next = index < ids.length - 1 ? ids[index + 1] : undefined;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!prev}
        onClick={() => prev && onGo(prev.slug, prev.id)}
        aria-label={t('inquiries.prevRecord')}
        title={t('inquiries.prevRecord')}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        {index + 1} / {ids.length}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!next}
        onClick={() => next && onGo(next.slug, next.id)}
        aria-label={t('inquiries.nextRecord')}
        title={t('inquiries.nextRecord')}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function CallbackOwnerBadge({
  owner,
  t,
}: {
  owner: NonNullable<ServiceInquiry['callbackOwner']>;
  t: ReturnType<typeof useT>;
}) {
  return (
    <Badge variant={owner === 'human' ? 'warning' : 'secondary'}>
      <Phone aria-hidden="true" />
      {owner === 'human' ? t('inquiries.callbackOwner.human') : t('inquiries.callbackOwner.ai')}
    </Badge>
  );
}

function ExtractItemsButton({
  pending,
  onClick,
  t,
}: {
  pending: boolean;
  onClick: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <Button type="button" size="sm" variant="ghost" loading={pending} onClick={onClick}>
      <Sparkles aria-hidden="true" />
      {pending ? t('inquiries.extractItemsBusy') : t('inquiries.extractItemsCta')}
    </Button>
  );
}

const EMAIL_STATUS_VARIANT: Record<InquiryEmailStatus, 'success' | 'secondary' | 'destructive'> = {
  sent: 'success',
  skipped: 'secondary',
  failed: 'destructive',
};

function EmailHistory({
  query,
  t,
  bcp47,
}: {
  query: ReturnType<typeof useQuery<{ emails: InquiryEmail[] }>>;
  t: ReturnType<typeof useT>;
  bcp47: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const emails = query.data?.emails ?? [];

  if (query.isLoading) {
    return <LoadingState className="min-h-28" />;
  }
  if (query.error) {
    return (
      <ErrorState
        title={t('inquiries.emailsLoadFailed')}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (emails.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        size="sm"
        icon={<Mail />}
        message={t('inquiries.emailHistoryEmpty')}
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {emails.map((email) => {
        const open = openId === email.id;
        return (
          <li key={email.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : email.id)}
              className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-2sm transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-expanded={open}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{email.subject}</span>
              {email.quotedAmount ? (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {email.quotedAmount} €
                </span>
              ) : null}
              <Badge variant={EMAIL_STATUS_VARIANT[email.status]}>
                {t(`inquiries.emailStatus.${email.status}` as never)}
              </Badge>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDateTime(email.createdAt, bcp47)}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
                  open && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <div className="border-t border-border bg-muted/40 p-2">
                <p className="mb-1.5 px-1 text-xs text-muted-foreground">
                  {t('inquiries.emailTo', { to: email.toAddress })}
                </p>
                <iframe
                  title={`${t('inquiries.emailPreview')}: ${email.subject}`}
                  srcDoc={email.html}
                  sandbox=""
                  className="h-96 w-full rounded-md border border-border bg-white"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MetadataCard({
  entries,
  label,
  t,
}: {
  entries: [string, unknown][];
  label: string;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard
      title={label}
      description={String(entries.length)}
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={label}
        >
          <ChevronDown
            className={cn('transition-transform duration-fast', open && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
      }
    >
      {open ? (
        <KeyValueList layout="stacked">
          {entries.map(([k, v]) => (
            <KeyValue key={k} label={prettyLabel(k)} value={<MetaValue value={v} t={t} />} />
          ))}
        </KeyValueList>
      ) : null}
    </SectionCard>
  );
}

function DateValue({ iso, bcp47 }: { iso: string; bcp47: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatDateTime(iso, bcp47)}
    </time>
  );
}

function prettyLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatMetaValue(v: unknown, t: ReturnType<typeof useT>, bcp47: string): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (typeof v === 'number') return v.toLocaleString(bcp47, { maximumFractionDigits: 2 });
  if (typeof v === 'string' && ISO_DATE.test(v)) return formatDateTime(v, bcp47);
  if (Array.isArray(v)) return v.map((item) => formatMetaValue(item, t, bcp47)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Form metadata often carries whole objects (geo routing, AI vision); one level is laid out, deeper levels stay JSON. */
function MetaValue({ value, t }: { value: unknown; t: ReturnType<typeof useT> }) {
  const { bcp47 } = useLocale();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rows = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== '',
    );
    return (
      <KeyValueList
        layout="grid"
        className="mt-1 rounded-md border border-border bg-muted/40 p-2.5 text-xs"
      >
        {rows.map(([k, v]) => (
          <KeyValue key={k} label={prettyLabel(k)} value={formatMetaValue(v, t, bcp47)} />
        ))}
      </KeyValueList>
    );
  }
  return <>{formatMetaValue(value, t, bcp47)}</>;
}
