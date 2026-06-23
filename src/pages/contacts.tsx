import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  Check,
  CheckCheck,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Phone,
  RefreshCcw,
  Reply,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { BrandMark } from '@/components/brand-mark';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  contactApi,
  type ContactMessage,
  type ContactReply,
  type ContactStatus,
  ApiError,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';

type Row = ContactMessage & { _brand: Project };

const statusVariant: Record<
  ContactStatus,
  'default' | 'info' | 'success' | 'secondary' | 'warning'
> = {
  new: 'info',
  read: 'warning',
  replied: 'success',
  archived: 'secondary',
};

const STATUS_LABEL_KEY: Record<ContactStatus, string> = {
  new: 'contacts.statusNew',
  read: 'contacts.statusRead',
  replied: 'contacts.statusReplied',
  archived: 'contacts.statusArchived',
};

export function ContactsPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('contacts.title'));
  const [tab, setTab] = useState<ContactStatus | 'all'>('all');
  const [selected, setSelected] = useState<{
    companySlug: CompanySlug;
    id: number;
  } | null>(null);

  const PAGE_SIZE = 50;

  const singleInfinite = useInfiniteQuery({
    queryKey: ['contacts-infinite', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      contactApi.list(
        activeProject.companySlug,
        { limit: PAGE_SIZE, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['contacts', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        contactApi.list(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : singleInfinite.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : singleInfinite.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : singleInfinite.error;
  const allBrandsHasMore = isAllBrands && multi.some((q) => q.data?.nextCursor);

  const messages = useMemo<Row[]>(() => {
    if (isAllBrands) {
      const out: Row[] = [];
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.messages ?? []).forEach((m) => out.push({ ...m, _brand: brand }));
      });
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return out;
    }
    const pages = singleInfinite.data?.pages ?? [];
    return pages.flatMap((p) => p.messages.map((m) => ({ ...m, _brand: activeProject })));
  }, [isAllBrands, multi, projects, singleInfinite.data, activeProject]);

  const loadMore = useCallback(() => {
    if (!isAllBrands && singleInfinite.hasNextPage && !singleInfinite.isFetchingNextPage) {
      void singleInfinite.fetchNextPage();
    }
  }, [isAllBrands, singleInfinite]);

  const filtered = useMemo(() => {
    if (tab === 'all') return messages;
    return messages.filter((m) => m.status === tab);
  }, [messages, tab]);

  const selectedRow = useMemo(
    () =>
      selected
        ? (messages.find(
            (m) => m.id === selected.id && m._brand.companySlug === selected.companySlug,
          ) ?? null)
        : null,
    [messages, selected],
  );

  const counts = useMemo(() => {
    const c: Record<ContactStatus | 'all', number> = {
      all: messages.length,
      new: 0,
      read: 0,
      replied: 0,
      archived: 0,
    };
    for (const m of messages) c[m.status]++;
    return c;
  }, [messages]);

  const statusMutation = useMutation({
    mutationFn: (vars: { companySlug: CompanySlug; id: number; status: ContactStatus }) =>
      contactApi.updateStatus(vars.companySlug, vars.id, vars.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const detailKey = selected
    ? (['contact-detail', selected.companySlug, selected.id] as const)
    : null;

  const detailQuery = useQuery({
    queryKey: detailKey ?? ['contact-detail', 'none'],
    queryFn: ({ signal }) => contactApi.get(selected!.companySlug, selected!.id, signal),
    enabled: !!selected,
  });

  const replyMutation = useMutation({
    mutationFn: (vars: { companySlug: CompanySlug; id: number; body: string }) =>
      contactApi.reply(vars.companySlug, vars.id, vars.body),
    onSuccess: ({ reply, message }, vars) => {
      queryClient.setQueryData<{ messages: ContactMessage[] } | undefined>(
        ['contacts', vars.companySlug],
        (prev) =>
          prev
            ? {
                messages: prev.messages.map((m) => (m.id === message.id ? message : m)),
              }
            : prev,
      );
      queryClient.setQueryData<{
        message: ContactMessage | null;
        replies: ContactReply[];
      }>(['contact-detail', vars.companySlug, vars.id], (prev) => ({
        message,
        replies: [...(prev?.replies ?? []), reply],
      }));
      void queryClient.invalidateQueries({ queryKey: ['contacts-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void singleInfinite.refetch();
  }

  const errorMessage =
    firstError instanceof ApiError
      ? firstError.status === 401
        ? t('contacts.errUnauthorized')
        : firstError.status === 403
          ? t('contacts.errForbidden')
          : firstError.message
      : firstError
        ? t('contacts.errGeneric')
        : null;

  const STATUS_TABS: { value: ContactStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('contacts.tabAll') },
    { value: 'new', label: t('contacts.tabNew') },
    { value: 'read', label: t('contacts.tabRead') },
    { value: 'replied', label: t('contacts.tabReplied') },
    { value: 'archived', label: t('contacts.tabArchived') },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span>/</span>
          <span className="text-foreground">{t('contacts.breadcrumb')}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('contacts.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('contacts.subtitle', {
                brand: isAllBrands ? t('brandFilter.allBrands') : activeProject.name,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
              <RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />
              {t('contacts.refresh')}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ContactStatus | 'all')}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((tabItem) => {
            const active = tab === tabItem.value;
            return (
              <TabsTrigger key={tabItem.value} value={tabItem.value} className="gap-1.5">
                {tabItem.label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    active
                      ? 'bg-rust/15 text-rust'
                      : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {counts[tabItem.value]}
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
              <CardTitle>{t('contacts.inboxTitle')}</CardTitle>
              <CardDescription>
                {filtered.length}{' '}
                {filtered.length === 1
                  ? t('contacts.messageSingular')
                  : t('contacts.messagePlural')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {t('contacts.inboxLoading')}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState message={t('contacts.inboxEmpty')} />
            ) : (
              <div className="divide-y">
                {filtered.map((m) => {
                  const isSelected =
                    selected?.id === m.id && selected?.companySlug === m._brand.companySlug;
                  return (
                    <button
                      key={`${m._brand.id}:${m.id}`}
                      type="button"
                      onClick={() =>
                        setSelected({
                          companySlug: m._brand.companySlug,
                          id: m.id,
                        })
                      }
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5',
                        isSelected && 'bg-muted/60',
                        m.status === 'new' && 'border-l-2 border-l-info',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-[13px] font-medium',
                            m.status === 'new' && 'font-semibold',
                          )}
                        >
                          {m.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <BrandChip brand={m._brand} />
                          <Badge variant={statusVariant[m.status]}>
                            {t(STATUS_LABEL_KEY[m.status] as never)}
                          </Badge>
                        </div>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{m.email}</div>
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-muted-foreground">
                          {m.subject ? (
                            <span className="text-foreground/80">{m.subject} · </span>
                          ) : null}
                          {m.message}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatRelative(m.createdAt, t, bcp47)}
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
              message={detailQuery.data?.message ?? selectedRow}
              brand={selectedRow._brand}
              replies={detailQuery.data?.replies ?? []}
              repliesLoading={detailQuery.isLoading}
              t={t}
              bcp47={bcp47}
              showBrand={true}
              onClose={() => setSelected(null)}
              onStatusChange={(status) =>
                statusMutation.mutate({
                  companySlug: selectedRow._brand.companySlug,
                  id: selectedRow.id,
                  status,
                })
              }
              onSendReply={(body) =>
                replyMutation.mutateAsync({
                  companySlug: selectedRow._brand.companySlug,
                  id: selectedRow.id,
                  body,
                })
              }
              isUpdating={statusMutation.isPending}
              isReplying={replyMutation.isPending}
              replyError={
                replyMutation.error instanceof ApiError
                  ? replyMutation.error.message
                  : replyMutation.error
                    ? t('contacts.replyFailed')
                    : null
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailPanel({
  message,
  brand,
  replies,
  repliesLoading,
  t,
  bcp47,
  showBrand,
  onClose,
  onStatusChange,
  onSendReply,
  isUpdating,
  isReplying,
  replyError,
}: {
  message: ContactMessage | Row;
  brand: Project;
  replies: ContactReply[];
  repliesLoading: boolean;
  t: ReturnType<typeof useT>;
  bcp47: string;
  showBrand: boolean;
  onClose: () => void;
  onStatusChange: (status: ContactStatus) => void;
  onSendReply: (body: string) => Promise<unknown>;
  isUpdating: boolean;
  isReplying: boolean;
  replyError: string | null;
}) {
  return (
    <Card className="sticky top-20 overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border/70 bg-muted/30 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
        <Avatar className="size-10 shrink-0" aria-hidden="true">
          <AvatarFallback className="bg-rust/15 text-[12px] font-semibold uppercase text-rust">
            {initialsOf(message.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {message.subject || t('contacts.detailNoSubject')}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground/85">{message.name}</span>
            <span aria-hidden="true">·</span>
            <a href={`mailto:${message.email}`} className="truncate text-primary hover:underline">
              {message.email}
            </a>
            <span aria-hidden="true">·</span>
            <time dateTime={message.createdAt} className="tabular-nums">
              {formatDateTime(message.createdAt, bcp47)}
            </time>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant[message.status]}>
              {t(STATUS_LABEL_KEY[message.status] as never)}
            </Badge>
            {showBrand ? <BrandChip brand={brand} /> : null}
            {message.phone ? (
              <a
                href={`tel:${message.phone}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground/80 hover:bg-muted"
              >
                <Phone className="size-3" />
                {message.phone}
              </a>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
              <Globe className="size-3" />
              {message.locale.toUpperCase()}
            </span>
            {message.consentMarketing ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                <Check className="size-3" />
                {t('contacts.detailMarketing')}
              </span>
            ) : null}
            {message.source ? (
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                {message.source}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:gap-0.5 sm:self-center">
          <ToolbarButton
            onClick={() => onStatusChange('read')}
            disabled={isUpdating || message.status === 'read'}
            icon={MailOpen}
            label={t('contacts.actionMarkRead')}
            active={message.status === 'read'}
          />
          <ToolbarButton
            onClick={() => onStatusChange('replied')}
            disabled={isUpdating || message.status === 'replied'}
            icon={Reply}
            label={t('contacts.actionMarkReplied')}
            active={message.status === 'replied'}
          />
          <ToolbarButton
            onClick={() => onStatusChange('archived')}
            disabled={isUpdating || message.status === 'archived'}
            icon={Archive}
            label={t('contacts.actionArchive')}
            active={message.status === 'archived'}
          />
          {message.status !== 'new' ? (
            <ToolbarButton
              onClick={() => onStatusChange('new')}
              disabled={isUpdating}
              icon={CheckCheck}
              label={t('contacts.actionReset')}
            />
          ) : null}
          <ToolbarButton onClick={onClose} icon={X} label={t('common.close')} />
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
        <h3 className="sr-only">{t('contacts.conversationTitle')}</h3>

        <ThreadItem
          name={message.name}
          subtitle={t('contacts.originalMessage')}
          timestamp={formatDateTime(message.createdAt, bcp47)}
          body={message.message}
          tone="incoming"
        />

        {message.attachments.length > 0 ? (
          <div className="ml-11">
            <AttachmentGallery companySlug={brand.companySlug} attachments={message.attachments} />
          </div>
        ) : null}

        {message.metadata && Object.keys(message.metadata).length > 0 ? (
          <div className="ml-11">
            <ContactMetadataBlock
              metadata={message.metadata}
              label={t('contacts.metadataTitle')}
              t={t}
            />
          </div>
        ) : null}

        {repliesLoading && replies.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {t('contacts.inboxLoading')}
          </div>
        ) : null}

        {replies.map((r) => (
          <ThreadItem
            key={r.id}
            name={r.sentByName ?? t('contacts.replyFromAdmin')}
            subtitle={t('contacts.replyFromAdmin')}
            timestamp={formatDateTime(r.createdAt, bcp47)}
            body={r.body}
            tone="outgoing"
          />
        ))}
      </div>

      <div className="border-t border-border/70 bg-muted/20 px-4 py-4 sm:px-5">
        <ReplyComposer
          to={message.email}
          onSend={onSendReply}
          isSending={isReplying}
          error={replyError}
          t={t}
        />
      </div>
    </Card>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-md text-foreground/70 transition-colors',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground/70',
            active && 'bg-rust/10 text-rust hover:bg-rust/15 hover:text-rust',
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ThreadItem({
  name,
  subtitle,
  timestamp,
  body,
  tone,
}: {
  name: string;
  subtitle: string;
  timestamp: string;
  body: string;
  tone: 'incoming' | 'outgoing';
}) {
  const isOutgoing = tone === 'outgoing';
  return (
    <article className="flex items-start gap-3">
      <Avatar className="size-8 shrink-0" aria-hidden="true">
        <AvatarFallback
          className={cn(
            'text-[11px] font-semibold uppercase',
            isOutgoing ? 'bg-rust/15 text-rust' : 'bg-muted text-foreground/70',
          )}
        >
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-2xl border px-4 py-3',
          isOutgoing ? 'border-rust/20 bg-rust/[0.04]' : 'border-border bg-background',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold">{name}</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">{subtitle}</span>
          </div>
          <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {timestamp}
          </time>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/90">
          {body}
        </p>
      </div>
    </article>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function ReplyComposer({
  to,
  onSend,
  isSending,
  error,
  t,
}: {
  to: string;
  onSend: (body: string) => Promise<unknown>;
  isSending: boolean;
  error: string | null;
  t: ReturnType<typeof useT>;
}) {
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const sentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== null) {
        window.clearTimeout(sentTimerRef.current);
      }
    };
  }, []);

  async function handleSend() {
    if (!body.trim()) {
      setLocalError(t('contacts.replyEmpty'));
      return;
    }
    setLocalError(null);
    try {
      await onSend(body);
      setBody('');
      setJustSent(true);
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = window.setTimeout(() => setJustSent(false), 2400);
    } catch {
      /* error surfaced via the prop */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl + Enter → send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  const shownError = localError ?? error;

  return (
    <div className="group rounded-2xl border border-border bg-card transition-colors focus-within:border-rust/40 focus-within:ring-2 focus-within:ring-rust/15">
      <Textarea
        rows={4}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (localError) setLocalError(null);
          if (justSent) setJustSent(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t('contacts.replyPlaceholder')}
        disabled={isSending}
        aria-label={t('contacts.replyPlaceholder')}
        className="resize-none border-0 bg-transparent px-3.5 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0 sm:text-[13.5px]"
      />
      {shownError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-1.5 px-3.5 pb-2 text-[12px] text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{shownError}</span>
        </div>
      ) : null}
      {justSent ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 px-3.5 pb-2 text-[12px] text-success"
        >
          <Check className="size-3.5" />
          <span>{t('contacts.replySentToast')}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3.5 py-2">
        <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <Mail className="size-3" />
          <span>
            {t('contacts.replyEmailLabel')}{' '}
            <span className="font-medium text-foreground/80">{to}</span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            ⌘↩
          </kbd>
          <Button size="sm" onClick={handleSend} disabled={isSending || body.trim() === ''}>
            {isSending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t('contacts.replySending')}
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                {t('contacts.replySend')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
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

function ContactMetadataBlock({
  metadata,
  label,
  t,
}: {
  metadata: Record<string, unknown>;
  label: string;
  t: ReturnType<typeof useT>;
}) {
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <dl className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{prettyMetaLabel(k)}</dt>
            <dd className="break-words text-sm">{formatMetaValue(v, t)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function prettyMetaLabel(key: string): string {
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
