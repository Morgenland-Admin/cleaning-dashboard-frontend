import { useQueries } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { ChatPanel } from '@/components/chat-panel';
import { EmptyState } from '@/components/empty-state';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import { chatAdminApi, type ChatConversation } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';

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
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  const conversations = useMemo<ConvRow[]>(() => {
    const out: ConvRow[] = [];
    queries.forEach((q, i) => {
      const brand = brandList[i];
      if (!brand) return;
      (q.data?.conversations ?? []).forEach((c) => out.push({ ...c, brand }));
    });
    return out.sort((a, b) => {
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aT !== bT) return bT - aT;
      return a.partnerUserId.localeCompare(b.partnerUserId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join('|'), brandList]);

  function rowKey(c: ConvRow): string {
    return `${c.brand.companySlug}:${c.partnerUserId}`;
  }

  useEffect(() => {
    if (selectedKey) return;
    if (typeof window === 'undefined') return;
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (!isDesktop) return;
    if (conversations.length > 0) setSelectedKey(rowKey(conversations[0]!));
  }, [conversations, selectedKey]);

  const selected = useMemo(
    () => conversations.find((c) => rowKey(c) === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  const showThreadOnMobile = !!selected;

  return (
    <ChatShell>
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
        <aside
          aria-label={t('chat.conversationsLabel')}
          className={
            'flex min-h-0 flex-col border-border bg-card md:border-r ' +
            (showThreadOnMobile ? 'hidden md:flex' : 'flex')
          }
        >
          <header className="shrink-0 border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('chat.conversationsHeading')}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
              {isAllBrands
                ? t('chat.subtitleAllBrandsList', { n: brandList.length })
                : t('chat.subtitleForBrand', { brand: activeProject.name })}
            </p>
          </header>
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            error={firstError ?? null}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            showBrand={isAllBrands}
            bcp47={bcp47}
            t={t}
          />
        </aside>

        <section
          aria-label={t('chat.activeThreadLabel')}
          className={
            'min-h-0 ' + (showThreadOnMobile ? 'flex flex-col' : 'hidden md:flex md:flex-col')
          }
        >
          {selected ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/40 px-2 py-1.5 md:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  aria-label={t('chat.backToList')}
                  className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
              </div>
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
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={<MessageSquare className="size-6" aria-hidden="true" />}
                message={t('chat.pickConversation')}
              />
            </div>
          )}
        </section>
      </div>
    </ChatShell>
  );
}

// Fills viewport below header; 100svh prevents iOS URL bar from clipping composer.
function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-shell flex w-full flex-col overflow-hidden bg-card">
      <style>{`
        .chat-shell { height: calc(100svh - 4rem - 5.5rem - env(safe-area-inset-bottom)); }
        @media (min-width: 1024px) { .chat-shell { height: calc(100svh - 4rem); } }
      `}</style>
      <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ConversationList({
  conversations,
  isLoading,
  error,
  selectedKey,
  onSelect,
  showBrand,
  bcp47,
  t,
}: {
  conversations: ConvRow[];
  isLoading: boolean;
  error: Error | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  showBrand: boolean;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{t('chat.loadingConversations')}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        className="m-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{error.message}</span>
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<MessageSquare className="size-6" aria-hidden="true" />}
          message={t('chat.noPartners')}
        />
      </div>
    );
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
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:bg-muted/40 focus-visible:outline-none ' +
          (active ? 'bg-muted/40' : 'hover:bg-muted/25')
        }
      >
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-rust/10 text-rust"
        >
          <MessageSquare className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            {conv.lastMessageAt ? (
              <time
                dateTime={conv.lastMessageAt}
                className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
              >
                {formatDateTime(conv.lastMessageAt, bcp47)}
              </time>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {showBrand ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <BrandMark brand={conv.brand} size="xs" />
                <span className="uppercase tracking-wide">{conv.brand.shortName}</span>
              </span>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {conv.lastMessagePreview ?? t('chat.noMessagesYet')}
            </p>
          </div>
        </div>
        {conv.unreadForAdmin > 0 ? (
          <span
            aria-label={t('chat.unreadCount', { n: conv.unreadForAdmin })}
            className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rust px-1.5 text-[10px] font-semibold text-primary-foreground"
          >
            {conv.unreadForAdmin > 99 ? '99+' : conv.unreadForAdmin}
          </span>
        ) : null}
      </button>
    </li>
  );
}
