import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { ChatAvatar } from '@/components/chat-avatar';
import { ChatPanel } from '@/components/chat-panel';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { SearchInput } from '@/components/search-input';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import { chatAdminApi, type ChatConversation } from '@/lib/api';
import { daysAgo } from '@/lib/chat';
import { chatContactOf, partnerStatusLabel, partnerStatusTone } from '@/lib/partners';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

type ConvRow = ChatConversation & { brand: Project };
type StatusFilter = 'all' | 'active' | 'pending';

function titleOf(c: ChatConversation, t: ReturnType<typeof useLocale>['t']): string {
  return (
    c.partnerCompanyName ?? c.partnerName ?? chatContactOf(c).email ?? t('chat.unknownPartner')
  );
}

export function ChatPage() {
  const { activeProject, projects, isAllBrands, setBrandView } = useProject();
  const { t, bcp47 } = useLocale();
  usePageTitle(t('chat.pageTitle'));

  // Selection lives in the URL (`?partner=<userId>&brand=<slug>`), so push links open the thread.
  const [searchParams, setSearchParams] = useSearchParams();
  const partnerParam = searchParams.get('partner');
  const brandParam = searchParams.get('brand');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const brandList = isAllBrands ? projects : [activeProject];
  const queries = useQueries({
    queries: brandList.map((b) => ({
      queryKey: ['chat-conversations', b.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        chatAdminApi.conversations(b.companySlug, signal),
      refetchInterval: 30_000,
      placeholderData: (prev: unknown) => prev,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  // `useQueries` returns a fresh array every render; this key changes only when a query resolves new data.
  const queriesUpdatedKey = queries.map((q) => q.dataUpdatedAt).join('|');
  const conversations = useMemo<ConvRow[]>(() => {
    // Dedupe by brand + partner: the backend can return two rows for one partner (no unique index); the later wins.
    const byKey = new Map<string, ConvRow>();
    queries.forEach((q, i) => {
      const brand = brandList[i];
      if (!brand) return;
      (q.data?.conversations ?? []).forEach((c) => {
        byKey.set(`${brand.companySlug}:${c.partnerUserId}`, { ...c, brand });
      });
    });
    return [...byKey.values()].sort((a, b) => {
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aT !== bT) return bT - aT;
      return a.partnerUserId.localeCompare(b.partnerUserId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see queriesUpdatedKey
  }, [queriesUpdatedKey, brandList]);

  function rowKey(c: ConvRow): string {
    return `${c.brand.companySlug}:${c.partnerUserId}`;
  }

  const selected = useMemo(
    () =>
      partnerParam
        ? (conversations.find(
            (c) =>
              c.partnerUserId === partnerParam &&
              (!brandParam || c.brand.companySlug === brandParam),
          ) ?? null)
        : null,
    [conversations, partnerParam, brandParam],
  );
  const selectedKey = selected ? rowKey(selected) : null;

  function select(c: ConvRow | null, replace = false) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (c) {
          next.set('partner', c.partnerUserId);
          next.set('brand', c.brand.companySlug);
        } else {
          next.delete('partner');
          next.delete('brand');
        }
        return next;
      },
      { replace },
    );
  }

  // A link into another brand's thread (partner page, push) switches the brand view once;
  // if the user then switches away, the stale selection is dropped.
  const followedBrand = useRef<string | null>(null);
  useEffect(() => {
    if (!brandParam || brandList.some((b) => b.companySlug === brandParam)) return;
    const linked = projects.find((p) => p.companySlug === brandParam);
    if (linked && followedBrand.current !== brandParam) {
      followedBrand.current = brandParam;
      setBrandView(linked.id);
    } else {
      select(null, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- select only writes the URL
  }, [brandParam, brandList, projects, setBrandView]);

  useEffect(() => {
    if (partnerParam || conversations.length === 0) return;
    // Two-pane layout starts at `md` here (not `lg` like the inboxes); the shell below is built around it.
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    select(conversations[0]!, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot default once the list resolves
  }, [conversations, partnerParam]);

  const statusCounts = useMemo(() => {
    const c = { all: conversations.length, active: 0, pending: 0 };
    for (const conv of conversations) {
      if (conv.partnerStatus === 'active') c.active++;
      else if (conv.partnerStatus === 'pending') c.pending++;
    }
    return c;
  }, [conversations]);
  const showStatusFilter = statusCounts.pending > 0 && conversations.length > 1;
  const activeFilter = showStatusFilter ? statusFilter : 'all';

  const needle = search.trim().toLowerCase();
  const visible = conversations.filter((c) => {
    if (activeFilter !== 'all' && c.partnerStatus !== activeFilter) return false;
    if (!needle) return true;
    return [
      c.partnerCompanyName,
      c.partnerName,
      c.partnerEmail,
      c.partnerContactEmail,
      c.partnerContactPhone,
      c.partnerPhone,
    ].some((v) => v?.toLowerCase().includes(needle));
  });

  const showThreadOnMobile = !!selected;
  const subtitle = isAllBrands
    ? t('chat.subtitleAllBrandsList', { n: brandList.length })
    : t('chat.subtitleForBrand', { brand: activeProject.name });

  return (
    <ChatShell>
      {/* Compact bar instead of PageHeading (chat is full-bleed); still the route's one <h1>. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        {selected ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => select(null)}
            aria-label={t('chat.backToList')}
            className="md:hidden"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : null}
        <h1 className="text-base font-semibold leading-6 text-foreground">{t('chat.pageTitle')}</h1>
        <p className="min-w-0 truncate text-xs text-muted-foreground">{subtitle}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr] 2xl:grid-cols-[340px_1fr]">
        <aside
          aria-label={t('chat.conversationsLabel')}
          className={cn(
            'min-h-0 flex-col border-border bg-card md:flex md:border-r',
            showThreadOnMobile ? 'hidden' : 'flex',
          )}
        >
          <h2 className="sr-only">{t('chat.conversationsHeading')}</h2>
          {conversations.length > 5 || showStatusFilter ? (
            <div className="shrink-0 space-y-2 border-b border-border p-2">
              {conversations.length > 5 ? (
                <SearchInput
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t('chat.searchPlaceholder')}
                  label={t('chat.searchLabel')}
                />
              ) : null}
              {showStatusFilter ? (
                <SegmentedControl
                  size="sm"
                  overflow="scroll"
                  value={activeFilter}
                  onValueChange={setStatusFilter}
                  label={t('chat.statusFilter')}
                  options={[
                    { value: 'all', label: t('chat.filterAll'), count: statusCounts.all },
                    { value: 'active', label: t('chat.filterActive'), count: statusCounts.active },
                    {
                      value: 'pending',
                      label: t('chat.filterPending'),
                      count: statusCounts.pending,
                    },
                  ]}
                />
              ) : null}
              {activeFilter === 'pending' ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('partners.statusHint.pending')}
                </p>
              ) : null}
            </div>
          ) : null}
          <ConversationList
            conversations={visible}
            filtered={!!needle || activeFilter !== 'all'}
            showStatus={activeFilter !== 'pending'}
            isLoading={isLoading}
            error={firstError ?? null}
            onRetry={() => queries.forEach((q) => void q.refetch())}
            retrying={isFetching}
            selectedKey={selectedKey}
            onSelect={select}
            showBrand={isAllBrands}
            bcp47={bcp47}
            t={t}
          />
        </aside>

        <section
          aria-label={t('chat.activeThreadLabel')}
          className={cn('min-h-0 flex-col md:flex', showThreadOnMobile ? 'flex' : 'hidden')}
        >
          {selected ? (
            <div className="min-h-0 flex-1">
              <ChatPanel
                key={`${selected.brand.companySlug}:${selected.partnerUserId}`}
                companySlug={selected.brand.companySlug as CompanySlug}
                conversation={selected}
                partnerName={titleOf(selected, t)}
                brand={isAllBrands ? selected.brand : null}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState icon={<MessageSquare />} message={t('chat.pickConversation')} />
            </div>
          )}
        </section>
      </div>
    </ChatShell>
  );
}

// Fills the viewport below the app header (h-14) and above the phone bottom nav; 100svh so the iOS URL bar never clips the composer.
function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-shell flex w-full flex-col overflow-hidden bg-card">
      <style>{`
        .chat-shell { height: calc(100svh - 3.5rem - 5.5rem - env(safe-area-inset-bottom)); }
        @media (min-width: 1024px) { .chat-shell { height: calc(100svh - 3.5rem); } }
      `}</style>
      <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ConversationList({
  conversations,
  filtered,
  isLoading,
  error,
  onRetry,
  retrying,
  selectedKey,
  onSelect,
  showBrand,
  showStatus,
  bcp47,
  t,
}: {
  conversations: ConvRow[];
  filtered: boolean;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
  selectedKey: string | null;
  onSelect: (conv: ConvRow) => void;
  showBrand: boolean;
  showStatus: boolean;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  if (isLoading) {
    return <LoadingState inline label={t('chat.loadingConversations')} className="px-4" />;
  }
  if (error) {
    return (
      <div className="p-4">
        <ErrorState error={error} onRetry={onRetry} retrying={retrying} />
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        message={filtered ? t('chat.noMatches') : t('chat.noPartners')}
      />
    );
  }
  return (
    <ul className="relative min-h-0 flex-1 overflow-y-auto py-1">
      {conversations.map((c) => {
        const key = `${c.brand.companySlug}:${c.partnerUserId}`;
        return (
          <ConversationRow
            key={key}
            conv={c}
            active={key === selectedKey}
            onSelect={() => onSelect(c)}
            showBrand={showBrand}
            showStatus={showStatus}
            bcp47={bcp47}
            t={t}
          />
        );
      })}
    </ul>
  );
}

function ConversationRow({
  conv,
  active,
  onSelect,
  showBrand,
  showStatus,
  bcp47,
  t,
}: {
  conv: ConvRow;
  active: boolean;
  onSelect: () => void;
  showBrand: boolean;
  showStatus: boolean;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const unread = conv.unreadForAdmin > 0;
  const name = titleOf(conv, t);
  const statusNote =
    showStatus && conv.partnerStatus !== 'active'
      ? partnerStatusLabel(t, conv.partnerStatus)
      : null;
  return (
    <li className="px-1.5">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          active ? 'bg-primary-soft' : 'hover:bg-accent/60',
        )}
      >
        {/* Status as a dot on the avatar, so the name keeps the whole first line. */}
        <span className="relative shrink-0" title={statusNote ?? undefined}>
          <ChatAvatar name={name} />
          {statusNote ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card',
                STATUS_DOT[partnerStatusTone(conv.partnerStatus)] ?? 'bg-muted-foreground',
              )}
            />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-2sm text-foreground',
                unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {name}
              {statusNote ? <span className="sr-only">, {statusNote}</span> : null}
            </span>
            {conv.lastMessageAt ? (
              <time
                dateTime={conv.lastMessageAt}
                title={formatDateTime(conv.lastMessageAt, bcp47)}
                className={cn(
                  'ml-auto shrink-0 text-2xs tabular-nums',
                  unread ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                {shortWhen(conv.lastMessageAt, bcp47, t)}
              </time>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {showBrand ? <BrandChip brand={conv.brand} /> : null}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                unread ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {conv.lastMessagePreview ?? t('chat.noMessagesYet')}
            </span>
            {unread ? (
              <>
                <CountPill tone="solid">
                  <span aria-hidden="true">
                    {conv.unreadForAdmin > 99 ? '99+' : conv.unreadForAdmin}
                  </span>
                </CountPill>
                <span className="sr-only">{t('chat.unreadCount', { n: conv.unreadForAdmin })}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

const STATUS_DOT: Record<string, string> = {
  warning: 'bg-warning',
  danger: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

/** List time: clock today, "Gestern", weekday this week, else the date. */
function shortWhen(iso: string, bcp47: string, t: ReturnType<typeof useLocale>['t']): string {
  const ago = daysAgo(iso);
  if (ago === 0) return formatDateTime(iso, bcp47, { timeStyle: 'short' });
  if (ago === 1) return t('chat.yesterday');
  if (ago < 7) return formatDateTime(iso, bcp47, { weekday: 'short' });
  return formatDateTime(iso, bcp47, { day: '2-digit', month: '2-digit', year: '2-digit' });
}
