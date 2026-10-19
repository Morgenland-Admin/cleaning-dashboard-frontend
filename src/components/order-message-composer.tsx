import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Mail, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { ApiError, ordersAdminApi, type OrderRow } from '@/lib/api';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { formatDateTime } from '@/lib/utils';
import { orderDetailKey } from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

/** The last messages sent from this page (read-only; the full mail trail is the e-mail log tab). */
export function OrderSentMessages({ order }: { order: OrderRow }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const sent = order.metadata?.messages ?? [];
  if (sent.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {sent.slice(-3).map((m, i) => (
        <li key={i} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span>{m.sentByName ?? t('orders.message.team')}</span>
            <time className="tabular-nums" dateTime={m.sentAt}>
              {formatDateTime(m.sentAt, bcp47)}
            </time>
          </div>
          <p className="whitespace-pre-wrap text-2sm text-foreground">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Sends under the order's own brand; both the button and ⌘↵ ask first — the mail leaves at once. */
export function OrderMessageComposer({
  companySlug,
  order,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sentTimerRef = useRef<number | null>(null);

  const send = useMutation({
    mutationFn: (text: string) => ordersAdminApi.sendMessage(companySlug, order.id, text),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orderDetailKey(companySlug, order.id) });
      toast.success(t('orders.message.sent'));
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.message.sendFailed')),
  });

  const assist = useClaudeAssist({
    kind: 'order_message',
    companySlug,
    refId: order.id,
    getCurrent: () => body,
    apply: (text) => {
      setBody(text);
      setLocalError(null);
      setJustSent(false);
    },
    updatedLabel: t('orders.message.aiUpdated'),
  });

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
    };
  }, []);

  function requestSend() {
    if (!body.trim()) {
      setLocalError(t('orders.message.needBody'));
      return;
    }
    setLocalError(null);
    setConfirmOpen(true);
  }

  async function handleSend() {
    setLocalError(null);
    try {
      await send.mutateAsync(body);
      setConfirmOpen(false);
      setBody('');
      setJustSent(true);
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = window.setTimeout(() => setJustSent(false), 2400);
    } catch {
      /* toast in the mutation */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      requestSend();
    }
  }

  return (
    <div className="space-y-3">
      <OrderSentMessages order={order} />

      <div className="overflow-hidden rounded-lg border border-input bg-card transition-colors duration-fast focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
        <Textarea
          rows={5}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (localError) setLocalError(null);
            if (justSent) setJustSent(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('orders.message.placeholder')}
          disabled={send.isPending}
          aria-label={t('orders.section.message')}
          className="min-h-[120px] resize-none rounded-none border-0 bg-transparent px-3.5 py-3 leading-relaxed shadow-none focus-visible:ring-0 sm:text-2sm"
        />
        {localError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-1.5 px-3.5 pb-2 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span>{localError}</span>
          </div>
        )}
        {justSent && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 px-3.5 pb-2 text-xs text-success"
          >
            <Check className="size-3.5" aria-hidden="true" />
            <span>{t('orders.message.sentNotice')}</span>
          </div>
        )}
        <ClaudeChatBox
          editablePrompt={{ kind: 'order_message', companySlug }}
          busy={assist.busy}
          history={assist.history}
          placeholder={t('orders.message.aiPlaceholder')}
          idleHint={body.trim() ? t('orders.message.aiRefine') : t('orders.message.aiFresh')}
          busyHint={t('ai.writing')}
          sendLabel={t('ai.send')}
          quickActions={[
            {
              label: t('orders.message.aiDraft'),
              run: () => assist.run(undefined, t('orders.message.aiDraft'), { fresh: true }),
            },
            {
              label: t('orders.message.aiShorter'),
              run: () =>
                assist.run(t('orders.message.aiShorterPrompt'), t('orders.message.aiShorter')),
            },
            {
              label: t('orders.message.aiWarmer'),
              run: () =>
                assist.run(t('orders.message.aiWarmerPrompt'), t('orders.message.aiWarmer')),
            },
          ]}
          onSend={(instruction) => assist.run(instruction, instruction)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            <Mail className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t('orders.message.recipientPrefix')}{' '}
              <span className="font-medium text-foreground">{order.customerEmail}</span>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <kbd className="hidden items-center gap-0.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:inline-flex">
              ⌘↩
            </kbd>
            <Button
              size="sm"
              onClick={requestSend}
              disabled={body.trim() === ''}
              loading={send.isPending}
            >
              <Send aria-hidden="true" />
              {send.isPending ? t('orders.message.sending') : t('orders.message.send')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('orders.message.confirmTitle')}
        description={t('orders.message.confirmBody', { email: order.customerEmail })}
        confirmLabel={t('orders.message.send')}
        onConfirm={() => void handleSend()}
        isPending={send.isPending}
      />
    </div>
  );
}
