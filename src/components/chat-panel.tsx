import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCheck,
  Check as CheckIcon,
  Loader2,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/i18n';
import { chatAdminApi, uploadsAdminApi, type ChatAttachment, type ChatMessage } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useChatSocket } from '@/lib/use-chat-socket';
import { formatDateTime } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

export function ChatPanel({
  companySlug,
  partnerUserId,
  partnerName,
}: {
  companySlug: CompanySlug;
  partnerUserId: string;
  partnerName: string;
}) {
  const { t, bcp47 } = useLocale();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const adminId = session?.user?.id ?? '';

  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState<File[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  // Nested dragenter/dragleave counter to prevent overlay flicker.
  const [dragDepth, setDragDepth] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const threadQuery = useQuery({
    queryKey: ['chat-thread', companySlug, partnerUserId],
    queryFn: ({ signal }) => chatAdminApi.messages(companySlug, partnerUserId, signal),
  });

  const messages = threadQuery.data?.messages ?? [];

  const baseUrl =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_AUTH_URL ??
    'http://localhost:8000';

  const { sendTyping } = useChatSocket({
    baseUrl,
    slug: companySlug,
    partnerUserId,
    onStatusChange: setWsStatus,
    onEvent: (evt) => {
      if (evt.type === 'message' && evt.message.senderRole === 'partner') {
        queryClient.setQueryData<typeof threadQuery.data>(
          ['chat-thread', companySlug, partnerUserId],
          (prev) => (prev ? { ...prev, messages: [...prev.messages, evt.message] } : prev),
        );
        void queryClient.invalidateQueries({
          queryKey: ['chat-conversations', companySlug],
        });
      } else if (evt.type === 'typing' && evt.from === 'partner') {
        setPartnerTyping(evt.isTyping);
      } else if (evt.type === 'read' && evt.by === 'partner') {
        queryClient.setQueryData<typeof threadQuery.data>(
          ['chat-thread', companySlug, partnerUserId],
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map((m) =>
                m.senderRole === 'admin' && !m.readAt ? { ...m, readAt: evt.readAt } : m,
              ),
            };
          },
        );
      } else if (evt.type === 'hello') {
        // No-op — wsStatus already tracks this via onStatusChange.
      }
    },
  });

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const markReadMutation = useMutation({
    mutationFn: () => chatAdminApi.markRead(companySlug, partnerUserId),
  });

  useEffect(() => {
    const lastIncomingUnread = messages
      .filter((m) => m.senderRole === 'partner' && !m.readAt)
      .at(-1);
    if (lastIncomingUnread) {
      markReadMutation.mutate();
      void queryClient.invalidateQueries({
        queryKey: ['chat-conversations', companySlug],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, companySlug, partnerUserId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (payload: { body?: string; attachments?: ChatAttachment[] }) =>
      chatAdminApi.send(companySlug, partnerUserId, payload),
    onSuccess: ({ message }) => {
      queryClient.setQueryData<typeof threadQuery.data>(
        ['chat-thread', companySlug, partnerUserId],
        (prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev),
      );
      setDraft('');
      setAttachments([]);
      void queryClient.invalidateQueries({
        queryKey: ['chat-conversations', companySlug],
      });
    },
  });

  const canSend = !sendMutation.isPending && (draft.trim().length > 0 || attachments.length > 0);

  function handleSend() {
    if (!canSend) return;
    sendMutation.mutate({
      body: draft.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    sendTyping(false);
  }

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleDraftChange(value: string) {
    setDraft(value);
    sendTyping(true);
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => sendTyping(false), 2000);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setUploading((u) => [...u, ...arr]);
    const results = await Promise.allSettled(
      arr.map((f) => uploadsAdminApi.uploadDirect(companySlug, f)),
    );
    setUploading((u) => u.filter((f) => !arr.includes(f)));
    const ok: ChatAttachment[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') ok.push(r.value);
    }
    if (ok.length > 0) setAttachments((curr) => [...curr, ...ok]);
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  }
  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setDragDepth(0);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <section
      aria-label={t('chat.regionLabel', { partner: partnerName })}
      className="relative flex h-full min-h-0 flex-col bg-card"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragDepth > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-rust/10 backdrop-blur-sm"
        >
          <div className="rounded-xl border-2 border-dashed border-rust/60 bg-card px-6 py-4 text-sm font-medium text-rust shadow-lg">
            {t('chat.dropHere')}
          </div>
        </div>
      ) : null}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/40 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {t('chat.threadWith', { partner: partnerName })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {wsStatus === 'open'
              ? t('chat.statusLive')
              : wsStatus === 'connecting'
                ? t('chat.statusConnecting')
                : t('chat.statusOffline')}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={
            'size-2 rounded-full ' +
            (wsStatus === 'open'
              ? 'bg-emerald-500'
              : wsStatus === 'connecting'
                ? 'bg-amber-500'
                : 'bg-muted-foreground/40')
          }
        />
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {threadQuery.isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>{t('chat.loadingThread')}</span>
          </div>
        ) : threadQuery.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{(threadQuery.error as Error).message}</span>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('chat.emptyThread')}</p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={m.senderUserId === adminId || m.senderRole === 'admin'}
              companySlug={companySlug}
              bcp47={bcp47}
              t={t}
            />
          ))
        )}
        {partnerTyping ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true" className="inline-flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
            </span>
            <span>{t('chat.partnerTyping', { partner: partnerName })}</span>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border bg-background/40 p-3 sm:p-4">
        {attachments.length > 0 || uploading.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.key}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="size-3" aria-hidden="true" />
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((curr) => curr.filter((x) => x.key !== a.key))}
                  aria-label={t('chat.removeAttachment', { name: a.name })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
            {uploading.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
              >
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                <span className="max-w-[140px] truncate">{f.name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <Textarea
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('chat.composerPlaceholder')}
            aria-label={t('chat.composerPlaceholder')}
            rows={2}
            className="min-h-[40px] flex-1 resize-none"
          />
          <div className="flex shrink-0 items-end gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sendMutation.isPending}
              aria-label={t('chat.attachFile')}
              className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </button>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={t('chat.send')}
            >
              {sendMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t('chat.sendHint')}</p>
        {sendMutation.error ? (
          <p role="alert" className="mt-1.5 text-[11px] text-destructive">
            {(sendMutation.error as Error).message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MessageBubble({
  message,
  isMine,
  companySlug,
  bcp47,
  t,
}: {
  message: ChatMessage;
  isMine: boolean;
  companySlug: CompanySlug;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  return (
    <div className={'flex gap-2 ' + (isMine ? 'flex-row-reverse' : '')}>
      <div
        className={'flex max-w-[78%] flex-col gap-1.5 ' + (isMine ? 'items-end' : 'items-start')}
      >
        {message.attachments.length > 0 ? (
          <AttachmentGallery
            companySlug={companySlug}
            attachments={message.attachments}
            className={
              'grid gap-1.5 ' +
              (message.attachments.length === 1 ? 'w-48 grid-cols-1' : 'w-64 grid-cols-2')
            }
          />
        ) : null}
        {message.body ? (
          <div
            className={
              'rounded-2xl px-3 py-2 text-sm ' +
              (isMine ? 'bg-white text-zinc-900' : 'bg-muted text-foreground')
            }
          >
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </div>
        ) : null}
        <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
          <time dateTime={message.createdAt} className="tabular-nums">
            {formatDateTime(message.createdAt, bcp47)}
          </time>
          {isMine ? (
            message.readAt ? (
              <span aria-label={t('chat.read')} title={t('chat.read')}>
                <CheckCheck className="size-3" aria-hidden="true" />
              </span>
            ) : message.deliveredAt ? (
              <span aria-label={t('chat.delivered')} title={t('chat.delivered')}>
                <CheckIcon className="size-3" aria-hidden="true" />
              </span>
            ) : null
          ) : null}
        </div>
      </div>
    </div>
  );
}
