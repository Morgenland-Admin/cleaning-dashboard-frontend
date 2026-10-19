import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { BrandChip } from '@/components/brand-mark';
import { ChatPanel } from '@/components/chat-panel';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import { chatAdminApi, type ChatConversation } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

type ConvRow = ChatConversation & { brand: Project };

export function ChatPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const { t, bcp47 } = useLocale();
  usePageTitle(t('chat.pageTitle'));

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (selectedKey) return;
    if (typeof window === 'undefined') return;
    // Two-pane layout starts at `md` here (not `lg` like the inboxes); the shell below is built around it.
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (!isDesktop) return;
    // The first conversation is only known once the queries resolve; the `selectedKey` guard keeps this one-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (conversations.length > 0) setSelectedKey(rowKey(conversations[0]!));
  }, [conversations, selectedKey]);

  const selected = useMemo(
    () => conversations.find((c) => rowKey(c) === selectedKey) ?? null,
    [conversations, selectedKey],
  );

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
            onClick={() => setSelectedKey(null)}
            aria-label={t('chat.backToList')}
            className="md:hidden"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : null}
        <h1 className="text-base font-semibold leading-6 text-foreground">{t('chat.pageTitle')}</h1>
        <p className="min-w-0 truncate text-xs text-muted-foreground">{subtitle}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
        <aside
          aria-label={t('chat.conversationsLabel')}
          className={cn(
            'min-h-0 flex-col border-border bg-card md:flex md:border-r',
            showThreadOnMobile ? 'hidden' : 'flex',
          )}
        >
          <h2 className="shrink-0 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            {t('chat.conversationsHeading')}
          </h2>
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            error={firstError ?? null}
            onRetry={() => queries.forEach((q) => void q.refetch())}
            retrying={isFetching}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
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
                partnerUserId={selected.partnerUserId}
                partnerName={
                  selected.partnerCompanyName ??
                  selected.partnerName ??
                  selected.partnerEmail ??
                  t('chat.unknownPartner')
                }
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
  isLoading,
  error,
  onRetry,
  retrying,
  selectedKey,
  onSelect,
  showBrand,
  bcp47,
  t,
}: {
  conversations: ConvRow[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  showBrand: boolean;
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
    return <EmptyState icon={<MessageSquare />} message={t('chat.noPartners')} />;
  }
  return (
    <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
      {conversations.map((c) => {
        const key = `${c.brand.companySlug}:${c.partnerUserId}`;
        return (
          <ConversationRow
            key={key}
            conv={c}
            active={key === selectedKey}
            onSelect={() => onSelect(key)}
            showBrand={showBrand}
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
  bcp47,
  t,
}: {
  conv: ConvRow;
  active: boolean;
  onSelect: () => void;
  showBrand: boolean;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const title =
    conv.partnerCompanyName ?? conv.partnerName ?? conv.partnerEmail ?? t('chat.unknownPartner');
  const unread = conv.unreadForAdmin > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          active ? 'bg-primary-soft' : 'hover:bg-accent/60',
        )}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              unread ? 'bg-highlight' : 'bg-transparent',
            )}
          />
          <span
            className={cn(
              'min-w-0 truncate text-2sm text-foreground',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {title}
          </span>
          {conv.lastMessageAt ? (
            <time
              dateTime={conv.lastMessageAt}
              className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground"
            >
              {formatDateTime(conv.lastMessageAt, bcp47)}
            </time>
          ) : null}
        </span>
        <span className="flex items-center gap-2 pl-3.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
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
        {showBrand ? (
          <span className="pl-3.5 pt-0.5">
            <BrandChip brand={conv.brand} />
          </span>
        ) : null}
      </button>
    </li>
  );
}
