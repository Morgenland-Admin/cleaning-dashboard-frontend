import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  ClipboardEdit,
  Inbox,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCcw,
  Send,
  Trophy,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { BrandMark } from '@/components/brand-mark';
import { ClaudeChatBox } from '@/components/claude-chat-box';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useToast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  inquiriesApi,
  type InquiryEmail,
  type InquiryEmailStatus,
  type InquiryStatus,
  type ServiceInquiry,
  ApiError,
} from '@/lib/api';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';

type Row = ServiceInquiry & { _brand: Project };

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

type PanelTab = 'request' | 'offer' | 'emails' | 'notes';

const STATUS_KEY: Record<InquiryStatus, string> = {
  new: 'inquiries.status.new',
  in_review: 'inquiries.status.in_review',
  quoted: 'inquiries.status.quoted',
  won: 'inquiries.status.won',
  lost: 'inquiries.status.lost',
};

function CallbackOwnerBadge({
  owner,
  t,
}: {
  owner: ServiceInquiry['callbackOwner'];
  t: ReturnType<typeof useT>;
}) {
  if (!owner) return null;
  return (
    <Badge variant={owner === 'human' ? 'warning' : 'secondary'} className="gap-1">
      <Phone className="size-3" />
      {owner === 'human' ? t('inquiries.callbackOwner.human') : t('inquiries.callbackOwner.ai')}
    </Badge>
  );
}

export function InquiriesPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('inquiries.title'));
  const [tab, setTab] = useState<InquiryStatus | 'all'>('all');
  const [selected, setSelected] = useState<{
    companySlug: CompanySlug;
    id: number;
  } | null>(null);

  const PAGE_SIZE = 50;

  const singleInfinite = useInfiniteQuery({
    queryKey: ['inquiries-infinite', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      inquiriesApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['inquiries', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        inquiriesApi.list(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : singleInfinite.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : singleInfinite.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : singleInfinite.error;
  const allBrandsHasMore = isAllBrands && multi.some((q) => q.data?.nextCursor);

  const inquiries = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.inquiries ?? []).forEach((inq) => out.push({ ...inq, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    const pages = singleInfinite.data?.pages ?? [];
    return pages.flatMap((p) => p.inquiries.map((inq) => ({ ...inq, _brand: activeProject })));
  }, [isAllBrands, multi, projects, singleInfinite.data, activeProject]);

  const loadMore = useCallback(() => {
    if (!isAllBrands && singleInfinite.hasNextPage && !singleInfinite.isFetchingNextPage) {
      void singleInfinite.fetchNextPage();
    }
  }, [isAllBrands, singleInfinite]);

  const filtered = useMemo(() => {
    if (tab === 'all') return inquiries;
    return inquiries.filter((i) => i.status === tab);
  }, [inquiries, tab]);

  const selectedRow = useMemo(
    () =>
      selected
        ? (inquiries.find(
            (i) => i.id === selected.id && i._brand.companySlug === selected.companySlug,
          ) ?? null)
        : null,
    [inquiries, selected],
  );

  const counts = useMemo(() => {
    const c: Record<InquiryStatus | 'all', number> = {
      all: inquiries.length,
      new: 0,
      in_review: 0,
      quoted: 0,
      won: 0,
      lost: 0,
    };
    for (const i of inquiries) c[i.status]++;
    return c;
  }, [inquiries]);

  const updateMutation = useMutation({
    mutationFn: (vars: {
      companySlug: CompanySlug;
      id: number;
      status?: InquiryStatus;
      internalNotes?: string | null;
    }) =>
      inquiriesApi.update(vars.companySlug, vars.id, {
        status: vars.status,
        internalNotes: vars.internalNotes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void singleInfinite.refetch();
  }

  const errorMessage =
    firstError instanceof ApiError
      ? firstError.status === 401
        ? t('inquiries.errUnauthorized')
        : firstError.status === 403
          ? t('inquiries.errForbidden')
          : firstError.message
      : firstError
        ? t('inquiries.errGeneric')
        : null;

  const STATUS_TABS: { value: InquiryStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('inquiries.tabAll') },
    { value: 'new', label: t('inquiries.tabNew') },
    { value: 'in_review', label: t('inquiries.tabInReview') },
    { value: 'quoted', label: t('inquiries.tabQuoted') },
    { value: 'won', label: t('inquiries.tabWon') },
    { value: 'lost', label: t('inquiries.tabLost') },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span>/</span>
          <span className="text-foreground">{t('inquiries.title')}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('inquiries.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('inquiries.subtitleFor', {
                brand: isAllBrands ? t('brandFilter.allBrands') : activeProject.name,
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
            <RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />
            {t('inquiries.refresh')}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as InquiryStatus | 'all')}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((ti) => {
            const active = tab === ti.value;
            return (
              <TabsTrigger key={ti.value} value={ti.value} className="gap-1.5">
                {ti.label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    active
                      ? 'bg-rust/15 text-rust'
                      : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {counts[ti.value]}
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

      <div className={cn('grid grid-cols-1 gap-4', selectedRow && 'lg:grid-cols-5')}>
        <Card className={cn(selectedRow && 'lg:col-span-2')}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{t('inquiries.inboxTitle')}</CardTitle>
              <CardDescription>
                {filtered.length === 1
                  ? t('inquiries.countSingular', { count: filtered.length })
                  : t('inquiries.countPlural', { count: filtered.length })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {t('inquiries.loading')}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState message={t('inquiries.empty')} />
            ) : (
              <div className="divide-y">
                {filtered.map((i) => {
                  const isSelected =
                    selected?.id === i.id && selected?.companySlug === i._brand.companySlug;
                  return (
                    <button
                      key={`${i._brand.id}:${i.id}`}
                      type="button"
                      onClick={() =>
                        setSelected({
                          companySlug: i._brand.companySlug,
                          id: i.id,
                        })
                      }
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5',
                        isSelected && 'bg-muted/60',
                        i.status === 'new' && 'border-l-2 border-l-sky-500',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-[13px] font-medium',
                            i.status === 'new' && 'font-semibold',
                          )}
                        >
                          {i.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <BrandChip brand={i._brand} />
                          <Badge variant={STATUS_VARIANT[i.status]}>
                            {t(STATUS_KEY[i.status] as never)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="shrink-0 font-mono">{i.inquiryNumber}</span>
                        <span className="truncate">{i.email}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-muted-foreground">
                          {i.service ? (
                            <span className="text-foreground/80">
                              <Wrench className="inline size-3 align-[-2px]" /> {i.service} ·{' '}
                            </span>
                          ) : null}
                          {i.message}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatRelative(i.createdAt, t, bcp47)}
                        </span>
                      </div>
                    </button>
                  );
                })}
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
              <div className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
                {t('common.allBrandsHasMore')}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {selectedRow ? (
          <div className="lg:col-span-3">
            <DetailPanel
              key={`${selectedRow._brand.id}:${selectedRow.id}`}
              inquiry={selectedRow}
              t={t}
              bcp47={bcp47}
              showBrand={true}
              onClose={() => setSelected(null)}
              onStatusChange={(status) =>
                updateMutation.mutate({
                  companySlug: selectedRow._brand.companySlug,
                  id: selectedRow.id,
                  status,
                })
              }
              onSaveNotes={(notes) =>
                updateMutation.mutate({
                  companySlug: selectedRow._brand.companySlug,
                  id: selectedRow.id,
                  internalNotes: notes,
                })
              }
              isUpdating={updateMutation.isPending}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailPanel({
  inquiry,
  t,
  bcp47,
  showBrand,
  onClose,
  onStatusChange,
  onSaveNotes,
  isUpdating,
}: {
  inquiry: Row;
  t: ReturnType<typeof useT>;
  bcp47: string;
  showBrand: boolean;
  onClose: () => void;
  onStatusChange: (status: InquiryStatus) => void;
  onSaveNotes: (notes: string | null) => void;
  isUpdating: boolean;
}) {
  const companySlug = inquiry._brand.companySlug;
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  // --- Offer (quote) compose + send ---------------------------------------
  const [offerBody, setOfferBody] = useState('');
  const [offerAmount, setOfferAmount] = useState(inquiry.quotedAmount ?? '');

  const offerAssist = useClaudeAssist({
    kind: 'inquiry_quote',
    companySlug,
    refId: inquiry.id,
    getCurrent: () => offerBody,
    apply: setOfferBody,
    updatedLabel: t('ai.updated'),
  });

  const sendQuoteMutation = useMutation({
    mutationFn: () =>
      inquiriesApi.sendQuote(companySlug, inquiry.id, {
        body: offerBody,
        quotedAmount: offerAmount.trim() === '' ? null : offerAmount.trim(),
      }),
    onSuccess: () => {
      setOfferBody('');
      void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
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

  // --- Email history ------------------------------------------------------
  const emailsQuery = useQuery({
    queryKey: ['inquiry-emails', companySlug, inquiry.id],
    queryFn: ({ signal }) => inquiriesApi.emails(companySlug, inquiry.id, signal),
  });
  const emailCount = emailsQuery.data?.emails.length ?? 0;

  // One workspace panel is visible at a time — keeps the card scannable and
  // avoids mounting both AI composers (and the email iframe) at once.
  const hasEmail = Boolean(inquiry.email);
  const [panelTab, setPanelTab] = useState<PanelTab>('request');

  // --- Editable contact details (admin-only correction) -------------------
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
    onSuccess: () => {
      setEditingContact(false);
      void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
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

  return (
    <Card className="sticky top-20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">{inquiry.name}</CardTitle>
          <CardDescription className="truncate">
            {t('contacts.detailFrom', {
              name: inquiry.email ?? inquiry.phone ?? '—',
              date: formatDateTime(inquiry.createdAt, bcp47),
            })}
          </CardDescription>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {inquiry.inquiryNumber}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showBrand ? <BrandChip brand={inquiry._brand} /> : null}
            <Badge variant={STATUS_VARIANT[inquiry.status]}>
              {t(STATUS_KEY[inquiry.status] as never)}
            </Badge>
            <CallbackOwnerBadge owner={inquiry.callbackOwner} t={t} />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Status actions */}
        <div className="flex flex-wrap gap-2">
          <ActionButton
            current={inquiry.status}
            target="in_review"
            icon={ClipboardEdit}
            label={t('inquiries.actions.review')}
            onClick={onStatusChange}
            disabled={isUpdating}
          />
          <ActionButton
            current={inquiry.status}
            target="quoted"
            icon={CircleDollarSign}
            label={t('inquiries.actions.quoted')}
            onClick={onStatusChange}
            disabled={isUpdating}
          />
          <ActionButton
            current={inquiry.status}
            target="won"
            icon={Trophy}
            label={t('inquiries.actions.won')}
            onClick={onStatusChange}
            disabled={isUpdating}
          />
          <ActionButton
            current={inquiry.status}
            target="lost"
            icon={XCircle}
            label={t('inquiries.actions.lost')}
            onClick={onStatusChange}
            disabled={isUpdating}
            variant="ghost"
          />
          {inquiry.status !== 'new' ? (
            <ActionButton
              current={inquiry.status}
              target="new"
              icon={CheckCheck}
              label={t('inquiries.actions.reset')}
              onClick={onStatusChange}
              disabled={isUpdating}
              variant="ghost"
            />
          ) : null}
        </div>

        {/* Contact + service info — email/phone are admin-editable */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('inquiries.contactTitle')}
            </span>
            {editingContact ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditingContact(false)}
                  disabled={contactMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => contactMutation.mutate()}
                  disabled={contactMutation.isPending || !emailValid}
                >
                  {contactMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={startContactEdit}
              >
                <Pencil className="size-3" />
                {t('common.edit')}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DetailRow label={t('inquiries.fields.email')}>
              {editingContact ? (
                <div className="flex flex-col gap-1">
                  <Input
                    type="email"
                    inputMode="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder={t('inquiries.emailPlaceholder')}
                    aria-invalid={!emailValid}
                    className="h-8 text-sm"
                  />
                  {!emailValid ? (
                    <span className="text-xs text-destructive">{t('inquiries.invalidEmail')}</span>
                  ) : null}
                </div>
              ) : inquiry.email ? (
                <a href={`mailto:${inquiry.email}`} className="text-primary hover:underline">
                  {inquiry.email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            {editingContact || inquiry.phone ? (
              <DetailRow label={t('inquiries.fields.phone')}>
                {editingContact ? (
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder={t('inquiries.phonePlaceholder')}
                    className="h-8 text-sm"
                  />
                ) : (
                  <a
                    href={`tel:${inquiry.phone}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Phone className="size-3" />
                    {inquiry.phone}
                  </a>
                )}
              </DetailRow>
            ) : null}
            {inquiry.service ? (
              <DetailRow label={t('inquiries.fields.service')} icon={Wrench}>
                {inquiry.service}
              </DetailRow>
            ) : null}
            {inquiry.plz ? (
              <DetailRow label={t('inquiries.fields.plz')} icon={MapPin}>
                {inquiry.plz}
              </DetailRow>
            ) : null}
            {inquiry.callReason ? (
              <DetailRow label={t('inquiries.fields.callReason')} icon={Phone}>
                {inquiry.callReason}
              </DetailRow>
            ) : null}
            {inquiry.preferredDate ? (
              <DetailRow label={t('inquiries.fields.preferredDate')} icon={CalendarClock}>
                {formatShortDate(inquiry.preferredDate, bcp47)}
              </DetailRow>
            ) : null}
            {inquiry.budget ? (
              <DetailRow label={t('inquiries.fields.budget')} icon={CircleDollarSign}>
                {inquiry.budget}
              </DetailRow>
            ) : null}
            {inquiry.quotedAmount ? (
              <DetailRow label={t('inquiries.fields.quotedAmount')}>
                {inquiry.quotedAmount} €
              </DetailRow>
            ) : null}
            {inquiry.source ? (
              <DetailRow label={t('inquiries.fields.source')}>{inquiry.source}</DetailRow>
            ) : null}
            <DetailRow label={t('inquiries.fields.consentMarketing')}>
              {inquiry.consentMarketing ? t('common.yes') : t('common.no')}
            </DetailRow>
          </div>
        </div>

        {/* Workspace — one panel at a time keeps the card scannable */}
        <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as PanelTab)} className="w-full">
          <TabsList className="flex w-full">
            <TabsTrigger value="request" className="flex-1">
              {t('inquiries.panelTab.request')}
            </TabsTrigger>
            {hasEmail ? (
              <TabsTrigger value="offer" className="flex-1 gap-1.5">
                <Send className="size-3.5" />
                {t('inquiries.panelTab.offer')}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="emails" className="flex-1 gap-1.5">
              {t('inquiries.panelTab.emails')}
              {emailCount > 0 ? (
                <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px] font-medium tabular-nums">
                  {emailCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 gap-1.5">
              {t('inquiries.panelTab.notes')}
              {notesDirty ? (
                <span className="size-1.5 rounded-full bg-rust" aria-hidden="true" />
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Request — the customer's message, photos and submitted fields */}
          <TabsContent
            value="request"
            className="flex flex-col gap-4 duration-200 animate-in fade-in-0"
          >
            {inquiry.propertyDetails ? (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <MapPin className="size-3" />
                  {t('inquiries.fields.propertyDetails')}
                </div>
                <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm leading-relaxed">
                  {inquiry.propertyDetails}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('inquiries.fields.message')}
              </div>
              <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm leading-relaxed">
                {inquiry.message}
              </div>
            </div>

            {inquiry.attachments.length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('inquiries.fields.attachments')}
                </div>
                <AttachmentGallery
                  companySlug={inquiry._brand.companySlug}
                  attachments={inquiry.attachments}
                />
              </div>
            ) : null}

            {Object.keys(inquiry.metadata ?? {}).length > 0 ? (
              <MetadataBlock
                metadata={inquiry.metadata}
                label={t('inquiries.metadataTitle')}
                t={t}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
              <TimelineRow
                icon={Calendar}
                label={t('inquiries.timeline.created')}
                value={formatDateTime(inquiry.createdAt, bcp47)}
              />
              {inquiry.handledAt ? (
                <TimelineRow
                  icon={ClipboardEdit}
                  label={t('inquiries.timeline.handled')}
                  value={formatDateTime(inquiry.handledAt, bcp47)}
                />
              ) : null}
              {inquiry.quotedAt ? (
                <TimelineRow
                  icon={CircleDollarSign}
                  label={t('inquiries.timeline.quoted')}
                  value={formatDateTime(inquiry.quotedAt, bcp47)}
                />
              ) : null}
              {inquiry.closedAt ? (
                <TimelineRow
                  icon={CheckCheck}
                  label={t('inquiries.timeline.closed')}
                  value={formatDateTime(inquiry.closedAt, bcp47)}
                />
              ) : null}
            </div>
          </TabsContent>

          {/* Offer — draft (with ✦ Claude) and send the quote email */}
          {hasEmail ? (
            <TabsContent value="offer" className="duration-200 animate-in fade-in-0">
              <div className="overflow-hidden rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
                <textarea
                  id="inquiry-offer-body"
                  rows={6}
                  value={offerBody}
                  onChange={(e) => setOfferBody(e.target.value)}
                  placeholder={t('inquiries.offerBodyPlaceholder')}
                  className="block min-h-[130px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                />
                <ClaudeChatBox
                  busy={offerAssist.busy}
                  history={offerAssist.history}
                  placeholder={t('ai.placeholder')}
                  idleHint={offerBody.trim() ? t('ai.idleRefine') : t('ai.idleFresh')}
                  busyHint={t('ai.writing')}
                  sendLabel={t('ai.send')}
                  quickActions={[
                    {
                      label: t('ai.draftOffer'),
                      run: () => offerAssist.run(undefined, t('ai.draftOffer'), { fresh: true }),
                    },
                    {
                      label: t('ai.shorter'),
                      run: () => offerAssist.run('Deutlich kürzer fassen.', t('ai.shorter')),
                    },
                    {
                      label: t('ai.formal'),
                      run: () => offerAssist.run('Etwas förmlicher formulieren.', t('ai.formal')),
                    },
                  ]}
                  onSend={(instruction) => offerAssist.run(instruction, instruction)}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="inquiry-offer-amount" className="text-xs text-muted-foreground">
                    {t('inquiries.offerAmount')}
                  </label>
                  <Input
                    id="inquiry-offer-amount"
                    inputMode="decimal"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-28 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={offerBody.trim() === '' || sendQuoteMutation.isPending}
                  onClick={() => sendQuoteMutation.mutate()}
                >
                  <Send className="size-3.5" />
                  {sendQuoteMutation.isPending ? t('common.saving') : t('inquiries.sendOfferCta')}
                </Button>
              </div>
            </TabsContent>
          ) : null}

          {/* Emails — what was already sent to this lead */}
          <TabsContent value="emails" className="duration-200 animate-in fade-in-0">
            <EmailHistory query={emailsQuery} t={t} bcp47={bcp47} />
          </TabsContent>

          {/* Notes — team-only, with ✦ Claude */}
          <TabsContent value="notes" className="duration-200 animate-in fade-in-0">
            <div className="overflow-hidden rounded-md border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
              <textarea
                id="inquiry-internal-notes"
                aria-label={t('inquiries.notes')}
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('inquiries.notesPlaceholder')}
                className="block min-h-[130px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              />
              <ClaudeChatBox
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
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!notesDirty || isUpdating}
                onClick={() => onSaveNotes(notes.trim() === '' ? null : notes)}
              >
                {isUpdating ? t('common.saving') : t('inquiries.saveNotes')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
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
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
        <Mail className="size-5 opacity-50" />
        {t('inquiries.emailHistoryEmpty')}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {emails.map((email) => {
        const open = openId === email.id;
        return (
          <li key={email.id} className="overflow-hidden rounded-md border bg-background">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : email.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
              aria-expanded={open}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{email.subject}</span>
              {email.quotedAmount ? (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {email.quotedAmount} €
                </span>
              ) : null}
              <Badge variant={EMAIL_STATUS_VARIANT[email.status]} className="shrink-0">
                {t(`inquiries.emailStatus.${email.status}` as never)}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(email.createdAt, bcp47)}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
            {open ? (
              <div className="border-t bg-muted/20 p-2">
                <div className="mb-1.5 px-1 text-xs text-muted-foreground">
                  {t('inquiries.emailTo', { to: email.toAddress })}
                </div>
                <iframe
                  title={`${t('inquiries.emailPreview')}: ${email.subject}`}
                  srcDoc={email.html}
                  sandbox=""
                  className="h-96 w-full rounded border bg-white"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton({
  current,
  target,
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'outline',
}: {
  current: InquiryStatus;
  target: InquiryStatus;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (status: InquiryStatus) => void;
  disabled: boolean;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const active = current === target;
  return (
    <Button
      variant={active ? 'default' : variant}
      size="sm"
      onClick={() => onClick(target)}
      disabled={disabled || active}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}

function DetailRow({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="truncate text-sm">{children}</span>
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function MetadataBlock({
  metadata,
  label,
  t,
}: {
  metadata: Record<string, unknown>;
  label: string;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (entries.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        {label}
        <span className="tabular-nums opacity-60">({entries.length})</span>
      </button>
      {open ? (
        <dl className="mt-1 grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm duration-200 animate-in fade-in-0 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{prettyLabel(k)}</dt>
              <dd className="break-words text-sm">{formatMetaValue(v, t)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
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

function formatMetaValue(v: unknown, t: ReturnType<typeof useT>): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return v.map((item) => formatMetaValue(item, t)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function BrandChip({ brand }: { brand: Project }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-1.5 py-0.5">
      <BrandMark brand={brand} size="xs" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {brand.shortName}
      </span>
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Inbox className="size-6 opacity-50" />
      <span>{message}</span>
    </div>
  );
}

function formatRelative(iso: string, t: ReturnType<typeof useT>, bcp47: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('contacts.timeNow');
  if (minutes < 60) return t('contacts.timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('contacts.timeHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('contacts.timeDays', { n: days });
  return formatShortDate(date, bcp47);
}
