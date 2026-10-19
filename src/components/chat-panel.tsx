import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ChatAvatar } from '@/components/chat-avatar';
import { ChatComposer } from '@/components/chat-composer';
import { ChatDetailsColumn, ChatDetailsSheet } from '@/components/chat-details';
import { ChatThreadHeader, type SocketStatus } from '@/components/chat-header';
import { ChatMessageItem } from '@/components/chat-message';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useLocale } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  chatAdminApi,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatThreadPage,
} from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import {
  dayGroups,
  daysAgo,
  LEGACY_ADMIN_SENDER,
  mergePages,
  threadRows,
  type FileProblem,
  type ThreadMessage,
} from '@/lib/chat';
import { chatContactOf } from '@/lib/partners';
import { useChatDrafts } from '@/lib/use-chat-drafts';
import { useChatSocket } from '@/lib/use-chat-socket';
import { useMediaQuery } from '@/lib/use-is-desktop';
import { formatDateTime } from '@/lib/utils';

import type { CompanySlug, Project } from '@/contexts/project-context';

type Thread = InfiniteData<ChatThreadPage, number | undefined>;
type Payload = { body?: string; attachments?: ChatAttachment[] };

// Tailwind `xl`: the details panel is a third column from here, a sheet below.
const WIDE_QUERY = '(min-width: 1280px)';

const DETAILS_PREF = 'chat-details-open';
function readDetailsPref(): boolean {
  try {
    return window.localStorage.getItem(DETAILS_PREF) !== 'closed';
  } catch {
    return true;
  }
}

function writeDetailsPref(open: boolean) {
  try {
    window.localStorage.setItem(DETAILS_PREF, open ? 'open' : 'closed');
  } catch {
    // Private mode: the toggle still works, it just isn't remembered.
  }
}

const PROBLEM_KEY = {
  type: 'chat.problemType',
  size: 'chat.problemSize',
  count: 'chat.problemCount',
} as const satisfies Record<FileProblem, string>;

export function ChatPanel({
  companySlug,
  conversation,
  partnerName,
  brand,
}: {
  companySlug: CompanySlug;
  conversation: ChatConversation;
  partnerName: string;
  /** Set when the list mixes brands. */
  brand?: Project | null;
}) {
  const { partnerUserId, partnerStatus } = conversation;
  const contact = chatContactOf(conversation);
  const { t, bcp47 } = useLocale();
  const { data: session } = useSession();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const adminId = session?.user?.id ?? '';
  const threadKey = useMemo(
    () => ['chat-thread', companySlug, partnerUserId] as const,
    [companySlug, partnerUserId],
  );

  const [wsStatus, setWsStatus] = useState<SocketStatus>('connecting');
  const [pending, setPending] = useState<ThreadMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [dragDepth, setDragDepth] = useState(0);
  const typingReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Next appended message scrolls into view even if the reader had scrolled up.
  const forceBottom = useRef(false);

  const thread = useInfiniteQuery({
    queryKey: threadKey,
    queryFn: ({ pageParam, signal }) =>
      chatAdminApi.messages(companySlug, partnerUserId, { before: pageParam, signal }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
    // Without a live socket the thread still updates.
    refetchInterval: wsStatus === 'open' ? false : 15_000,
  });

  const serverMessages = useMemo(() => mergePages(thread.data?.pages ?? []), [thread.data]);
  const messages = useMemo<ThreadMessage[]>(
    () => [...serverMessages, ...pending],
    [serverMessages, pending],
  );

  // Captured once per thread: where the "new messages" divider goes.
  const [unreadMark, setUnreadMark] = useState<{ ready: boolean; id: number | null }>({
    ready: false,
    id: null,
  });
  if (!unreadMark.ready && thread.isSuccess) {
    const first = serverMessages.find((m) => m.senderRole === 'partner' && !m.readAt);
    setUnreadMark({ ready: true, id: first?.id ?? null });
  }
  const rows = useMemo(() => threadRows(messages, unreadMark.id), [messages, unreadMark.id]);

  const refreshList = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['chat-conversations', companySlug] }),
    [queryClient, companySlug],
  );

  const updateMessages = useCallback(
    (fn: (m: ChatMessage) => ChatMessage) => {
      queryClient.setQueryData<Thread>(threadKey, (prev) =>
        prev
          ? { ...prev, pages: prev.pages.map((p) => ({ ...p, messages: p.messages.map(fn) })) }
          : prev,
      );
    },
    [queryClient, threadKey],
  );

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<Thread>(threadKey, (prev) => {
        if (!prev || prev.pages.length === 0) return prev;
        const [latest, ...older] = prev.pages;
        const rest = latest!.messages.filter((m) => m.id !== message.id);
        return { ...prev, pages: [{ ...latest!, messages: [...rest, message] }, ...older] };
      });
    },
    [queryClient, threadKey],
  );

  const baseUrl =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_AUTH_URL ??
    'http://localhost:8000';

  const wasClosed = useRef(false);
  const { sendTyping } = useChatSocket({
    baseUrl,
    slug: companySlug,
    partnerUserId,
    onStatusChange: (status) => {
      setWsStatus(status);
      // Catch up on whatever arrived while the socket was down.
      if (status === 'open' && wasClosed.current) {
        void queryClient.invalidateQueries({ queryKey: threadKey });
      }
      if (status === 'closed') wasClosed.current = true;
    },
    onEvent: (evt) => {
      if (evt.type === 'message') {
        appendMessage(evt.message);
        refreshList();
        if (evt.message.senderRole === 'partner') {
          setPartnerTyping(false);
          const text = evt.message.body?.slice(0, 140) || t('chat.attachmentOnly');
          setAnnouncement(t('chat.announceIncoming', { partner: partnerName, text }));
        }
      } else if (evt.type === 'typing' && evt.from === 'partner') {
        setPartnerTyping(evt.isTyping);
        if (typingReset.current) clearTimeout(typingReset.current);
        if (evt.isTyping) typingReset.current = setTimeout(() => setPartnerTyping(false), 6000);
      } else if (evt.type === 'delivered' && evt.by === 'partner') {
        updateMessages((m) =>
          m.senderRole === 'admin' && !m.deliveredAt ? { ...m, deliveredAt: evt.deliveredAt } : m,
        );
      } else if (evt.type === 'read' && evt.by === 'partner') {
        updateMessages((m) =>
          m.senderRole === 'admin' && !m.readAt
            ? { ...m, readAt: evt.readAt, deliveredAt: m.deliveredAt ?? evt.readAt }
            : m,
        );
      }
    },
  });

  useEffect(() => {
    const timer = typingReset;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Read only while the tab is actually visible.
  const hasUnread = serverMessages.some((m) => m.senderRole === 'partner' && !m.readAt);
  const marking = useRef(false);
  useEffect(() => {
    if (!hasUnread) return;
    function mark() {
      if (marking.current || document.visibilityState !== 'visible') return;
      marking.current = true;
      const now = new Date().toISOString();
      chatAdminApi
        .markRead(companySlug, partnerUserId)
        .then(() => {
          updateMessages((m) =>
            m.senderRole === 'partner' && !m.readAt ? { ...m, readAt: now } : m,
          );
          refreshList();
        })
        .catch(() => null)
        .finally(() => {
          marking.current = false;
        });
    }
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [hasUnread, companySlug, partnerUserId, updateMessages, refreshList]);

  const deliver = useCallback(
    (localId: string, payload: Payload) => {
      chatAdminApi
        .send(companySlug, partnerUserId, payload)
        .then(({ message }) => {
          appendMessage(message);
          setPending((p) => p.filter((m) => m.local?.id !== localId));
          refreshList();
        })
        .catch(() => {
          setPending((p) =>
            p.map((m) =>
              m.local?.id === localId ? { ...m, local: { id: localId, status: 'failed' } } : m,
            ),
          );
          setAnnouncement(t('chat.notSent'));
        });
    },
    [companySlug, partnerUserId, appendMessage, refreshList, t],
  );

  function send(payload: Payload) {
    const localId = crypto.randomUUID();
    setPending((p) => [
      ...p,
      {
        id: -Date.now(),
        conversationId: 0,
        senderUserId: adminId,
        senderRole: 'admin',
        senderName: session?.user?.name ?? null,
        body: payload.body ?? null,
        attachments: payload.attachments ?? [],
        deliveredAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        local: { id: localId, status: 'sending' },
      },
    ]);
    setUnreadMark({ ready: true, id: null });
    forceBottom.current = true;
    deliver(localId, payload);
  }

  function retry(m: ThreadMessage) {
    const localId = m.local!.id;
    setPending((p) =>
      p.map((x) =>
        x.local?.id === localId ? { ...x, local: { id: localId, status: 'sending' } } : x,
      ),
    );
    deliver(localId, {
      body: m.body ?? undefined,
      attachments: m.attachments.length ? m.attachments : undefined,
    });
  }

  const onRejected = useCallback(
    (rejected: Array<{ name: string; problem: FileProblem }>) => {
      toast({
        variant: 'destructive',
        title: t('chat.filesRejected'),
        description: rejected.map((r) => `${r.name}: ${t(PROBLEM_KEY[r.problem])}`).join(' · '),
      });
    },
    [t],
  );
  const drafts = useChatDrafts(companySlug, onRejected);

  // --- details: a remembered column from `xl`, a sheet below
  const isWide = useMediaQuery(WIDE_QUERY);
  const [columnOpen, setColumnOpen] = useState(readDetailsPref);
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailsOpen = isWide ? columnOpen : sheetOpen;
  const detailsId = useId();
  const infoRef = useRef<HTMLButtonElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusDetails = useRef(false);

  function setColumn(open: boolean) {
    setColumnOpen(open);
    writeDetailsPref(open);
  }
  function toggleDetails() {
    if (!isWide) return setSheetOpen((o) => !o);
    focusDetails.current = !columnOpen;
    setColumn(!columnOpen);
  }
  useEffect(() => {
    if (columnOpen && focusDetails.current) detailsHeadingRef.current?.focus();
    focusDetails.current = false;
  }, [columnOpen]);

  // --- scrolling: stay pinned to the newest message unless the reader scrolled up
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const snapshot = useRef<{ first?: string; last?: string; height: number; top: number }>({
    height: 0,
    top: 0,
  });
  const firstKey = rows.find((r) => r.kind === 'message')?.key;
  const lastRow = rows.at(-1);
  const lastKey = lastRow?.kind === 'message' ? lastRow.key : undefined;

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !lastKey) return;
    const prev = snapshot.current;
    if (!prev.last) {
      const divider = el.querySelector<HTMLElement>('[data-unread-divider]');
      if (divider) el.scrollTop = Math.max(0, divider.offsetTop - el.clientHeight / 3);
      else el.scrollTop = el.scrollHeight;
    } else if (prev.first !== firstKey && prev.last === lastKey) {
      // Older page prepended: keep the reader's place.
      el.scrollTop = prev.top + (el.scrollHeight - prev.height);
    } else if (prev.last !== lastKey) {
      const last = lastRow?.kind === 'message' ? lastRow.message : null;
      if (forceBottom.current || atBottom.current || last?.senderUserId === adminId) {
        scrollToBottom(true);
      } else if (last?.senderRole === 'partner') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- counts messages that arrived out of view
        setNewBelow((n) => n + 1);
      }
      forceBottom.current = false;
    }
    snapshot.current = {
      first: firstKey,
      last: lastKey,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
  }, [firstKey, lastKey, lastRow, adminId, scrollToBottom]);

  useEffect(() => {
    if (partnerTyping && atBottom.current) scrollToBottom(true);
  }, [partnerTyping, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    snapshot.current.top = el.scrollTop;
    snapshot.current.height = el.scrollHeight;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = bottom;
    if (bottom && newBelow) setNewBelow(0);
    if (showJump === bottom) setShowJump(!bottom);
    if (el.scrollTop < 120 && thread.hasNextPage && !thread.isFetchingNextPage) {
      void thread.fetchNextPage();
    }
  }

  // --- drag & drop anywhere on the thread
  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const dropHandlers = canWrite
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragDepth((d) => d + 1);
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragDepth((d) => Math.max(0, d - 1));
        },
        onDragOver: (e: React.DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDrop: (e: React.DragEvent) => {
          if (!e.dataTransfer?.files?.length) return;
          e.preventDefault();
          setDragDepth(0);
          drafts.add(e.dataTransfer.files);
        },
      }
    : {};

  function senderLabel(m: ThreadMessage): { visible: boolean; text: string } {
    if (m.senderRole === 'partner') return { visible: true, text: partnerName };
    if (m.senderUserId === adminId) return { visible: false, text: t('chat.you') };
    if (m.senderUserId === LEGACY_ADMIN_SENDER)
      return { visible: true, text: t('chat.legacySender') };
    return { visible: true, text: m.senderName || t('chat.colleague') };
  }

  function dayLabel(iso: string): string {
    const ago = daysAgo(iso);
    if (ago === 0) return t('chat.today');
    if (ago === 1) return t('chat.yesterday');
    const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
    return formatDateTime(iso, bcp47, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  }

  const detailsProps = {
    companySlug,
    conversation,
    partnerName,
    contact,
    brand,
    messages: serverMessages,
    hasMore: !!thread.hasNextPage,
    loadingMore: thread.isFetchingNextPage,
    onLoadMore: () => void thread.fetchNextPage(),
  };

  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label={t('chat.regionLabel', { partner: partnerName })}
        className="relative flex min-w-0 flex-1 flex-col bg-card"
        {...dropHandlers}
      >
        {dragDepth > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-highlight/10 p-4 backdrop-blur-sm"
          >
            <div className="flex size-full items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-card/90 text-sm font-medium text-primary">
              {t('chat.dropHere')}
            </div>
          </div>
        ) : null}

        <ChatThreadHeader
          partnerName={partnerName}
          partnerStatus={partnerStatus}
          contact={contact}
          wsStatus={wsStatus}
          partnerTyping={partnerTyping}
          detailsOpen={detailsOpen}
          detailsId={isWide && columnOpen ? detailsId : undefined}
          infoRef={infoRef}
          onToggleDetails={toggleDetails}
        />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-5"
          >
            {thread.isLoading ? (
              <LoadingState inline label={t('chat.loadingThread')} className="pt-4" />
            ) : thread.error ? (
              <div className="pt-4">
                <ErrorState
                  error={thread.error}
                  onRetry={() => void thread.refetch()}
                  retrying={thread.isFetching}
                />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                size="sm"
                message={canWrite ? t('chat.emptyThread') : t('chat.emptyThreadReadOnly')}
              />
            ) : (
              <>
                <div className="flex justify-center pt-3">
                  {thread.hasNextPage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void thread.fetchNextPage()}
                      loading={thread.isFetchingNextPage}
                    >
                      {thread.isFetchingNextPage ? t('chat.loadingOlder') : t('chat.loadOlder')}
                    </Button>
                  ) : (
                    <p className="text-2xs text-muted-foreground">{t('chat.historyStart')}</p>
                  )}
                </div>
                <ol aria-label={t('chat.messagesLabel')}>
                  {dayGroups(rows).map((group) => (
                    <li key={group.key}>
                      <h3 className="sticky top-0 z-10 flex justify-center pt-4">
                        <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-2xs font-medium text-muted-foreground shadow-xs">
                          {dayLabel(group.date)}
                        </span>
                      </h3>
                      <ol className="flex flex-col">
                        {group.rows.map((row) =>
                          row.kind === 'unread' ? (
                            <li
                              key={row.key}
                              data-unread-divider
                              className="flex items-center gap-2 pt-3 text-2xs font-medium text-primary"
                            >
                              <span aria-hidden="true" className="h-px flex-1 bg-primary/40" />
                              {t('chat.newMessages')}
                              <span aria-hidden="true" className="h-px flex-1 bg-primary/40" />
                            </li>
                          ) : (
                            <ChatMessageItem
                              key={row.key}
                              message={row.message}
                              mine={row.message.senderRole === 'admin'}
                              startsGroup={row.startsGroup}
                              endsGroup={row.endsGroup}
                              senderLabel={senderLabel(row.message)}
                              avatarName={
                                row.message.senderRole === 'partner' ? partnerName : undefined
                              }
                              companySlug={companySlug}
                              onRetry={() => retry(row.message)}
                              onDiscard={() =>
                                setPending((p) =>
                                  p.filter((x) => x.local?.id !== row.message.local?.id),
                                )
                              }
                            />
                          ),
                        )}
                      </ol>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {partnerTyping ? (
              <div className="flex items-center gap-2 pt-3 text-xs text-muted-foreground">
                <ChatAvatar name={partnerName} size="sm" />
                <span
                  aria-hidden="true"
                  className="inline-flex items-center gap-1 rounded-2xl bg-muted px-3 py-2.5"
                >
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
                </span>
                <span>{t('chat.partnerTyping', { partner: partnerName })}</span>
              </div>
            ) : null}
          </div>

          {showJump || newBelow > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setNewBelow(0);
                scrollToBottom(true);
              }}
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md"
            >
              {thread.isFetching && !thread.isFetchingNextPage ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <ArrowDown aria-hidden="true" />
              )}
              {newBelow > 0 ? t('chat.newBelow', { n: newBelow }) : t('chat.jumpToLatest')}
            </Button>
          ) : null}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {canWrite ? (
          <ChatComposer
            draftKey={`chat-draft:${companySlug}:${partnerUserId}`}
            drafts={drafts}
            onSend={send}
            onTyping={sendTyping}
          />
        ) : (
          <p className="shrink-0 border-t border-border bg-muted px-4 py-3 text-xs text-muted-foreground sm:px-5">
            {t('chat.readOnly')}
          </p>
        )}
      </section>

      {isWide && columnOpen ? (
        <ChatDetailsColumn
          {...detailsProps}
          id={detailsId}
          headingRef={detailsHeadingRef}
          onClose={() => {
            setColumn(false);
            infoRef.current?.focus();
          }}
        />
      ) : null}
      {!isWide ? (
        <ChatDetailsSheet {...detailsProps} open={sheetOpen} onOpenChange={setSheetOpen} />
      ) : null}
    </div>
  );
}
