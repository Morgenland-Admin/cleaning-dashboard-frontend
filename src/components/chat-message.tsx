import { AlertCircle, Check, CheckCheck, Clock, RotateCw, Trash2 } from 'lucide-react';
import { Fragment } from 'react';

import { ChatFileLink, ChatImageGrid } from '@/components/chat-attachments';
import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/i18n';
import {
  deliveryState,
  formatBytes,
  isImageFile,
  linkParts,
  type DeliveryState,
  type ThreadMessage,
} from '@/lib/chat';
import { cn, formatDateTime, safeHttpUrl } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

type T = ReturnType<typeof useLocale>['t'];

const STATUS_KEY = {
  sending: 'chat.statusSending',
  failed: 'chat.statusFailed',
  sent: 'chat.statusSent',
  delivered: 'chat.delivered',
  read: 'chat.read',
} as const satisfies Record<DeliveryState, string>;

export function ChatMessageItem({
  message,
  mine,
  startsGroup,
  endsGroup,
  senderLabel,
  avatarName,
  companySlug,
  onRetry,
  onDiscard,
}: {
  message: ThreadMessage;
  mine: boolean;
  startsGroup: boolean;
  endsGroup: boolean;
  /** Visible label above the run, e.g. a colleague's name; screen readers always get one. */
  senderLabel: { visible: boolean; text: string };
  /** Incoming runs show this avatar once, beside their last message. */
  avatarName?: string;
  companySlug: CompanySlug;
  onRetry?: () => void;
  onDiscard?: () => void;
}) {
  const { t, bcp47 } = useLocale();
  const images = message.attachments.filter(isImageFile);
  const files = message.attachments.filter((a) => !isImageFile(a));
  const state = mine ? deliveryState(message) : null;
  const fullTime = formatDateTime(message.createdAt, bcp47);
  const showLabel = startsGroup && senderLabel.visible;
  // Time and receipt once per run; unsent and failed messages keep their own.
  const meta =
    endsGroup || message.local ? (
      <MessageMeta message={message} state={state} t={t} bcp47={bcp47} />
    ) : null;

  return (
    <li
      className={cn(
        'flex gap-2',
        mine ? 'justify-end' : 'justify-start',
        startsGroup ? 'pt-3' : 'pt-0.5',
      )}
    >
      {!mine ? (
        <span className="flex w-7 shrink-0 items-end">
          {endsGroup && avatarName ? <ChatAvatar name={avatarName} size="sm" /> : null}
        </span>
      ) : null}
      <div
        title={fullTime}
        className={cn(
          'flex min-w-0 max-w-[85%] flex-col gap-1 md:max-w-[min(68%,36rem)]',
          mine ? 'items-end' : 'items-start',
          message.local?.status === 'sending' && 'opacity-70',
        )}
      >
        {showLabel ? (
          <p aria-hidden="true" className="px-1 text-2xs font-medium text-muted-foreground">
            {senderLabel.text}
          </p>
        ) : null}
        <span className="sr-only">
          {senderLabel.text}, {fullTime}:
        </span>
        {images.length > 0 ? (
          <ChatImageGrid
            companySlug={companySlug}
            images={images}
            className={cn(
              'max-w-full',
              images.length === 1
                ? 'w-64 grid-cols-1'
                : images.length === 2 || images.length === 4
                  ? 'w-72 grid-cols-2'
                  : 'w-72 grid-cols-3',
            )}
            tileClassName={images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}
          />
        ) : null}
        {files.length > 0 ? (
          <ul className="flex w-72 max-w-full flex-col gap-1">
            {files.map((f) => (
              <li key={f.key}>
                <ChatFileLink
                  companySlug={companySlug}
                  file={f}
                  meta={f.size > 0 ? formatBytes(f.size, bcp47) : null}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {message.body ? (
          <div
            className={cn(
              'relative min-w-0 rounded-2xl px-3 pb-1.5 pt-1.5 text-sm text-foreground',
              mine ? 'bg-primary-soft' : 'bg-muted',
              mine
                ? [!startsGroup && 'rounded-tr-sm', !endsGroup && 'rounded-br-sm']
                : [!startsGroup && 'rounded-tl-sm', !endsGroup && 'rounded-bl-sm'],
            )}
          >
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              <Linkified text={message.body} />
              {/* Keeps the last line clear of the time, which sits in the corner. */}
              {meta ? (
                <span
                  aria-hidden="true"
                  className={cn('inline-block h-3', mine ? 'w-[4.5rem]' : 'w-12')}
                />
              ) : null}
            </p>
            {meta ? <span className="absolute bottom-1 right-2.5">{meta}</span> : null}
          </div>
        ) : meta ? (
          <span className="px-1">{meta}</span>
        ) : null}
        {message.local?.status === 'failed' ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
            <span className="text-destructive">{t('chat.notSent')}</span>
            <Button type="button" variant="outline" size="xs" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              {t('chat.retry')}
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={onDiscard}>
              <Trash2 aria-hidden="true" />
              {t('chat.discard')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function MessageMeta({
  message,
  state,
  t,
  bcp47,
}: {
  message: ThreadMessage;
  state: DeliveryState | null;
  t: T;
  bcp47: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-2xs leading-4 text-muted-foreground">
      <time
        dateTime={message.createdAt}
        title={formatDateTime(message.createdAt, bcp47)}
        className="tabular-nums"
      >
        {formatDateTime(message.createdAt, bcp47, { timeStyle: 'short' })}
      </time>
      {state ? <StatusIcon state={state} readAt={message.readAt} t={t} bcp47={bcp47} /> : null}
    </span>
  );
}

function StatusIcon({
  state,
  readAt,
  t,
  bcp47,
}: {
  state: DeliveryState;
  readAt: string | null;
  t: T;
  bcp47: string;
}) {
  const label =
    state === 'read' && readAt
      ? t('chat.readAt', { time: formatDateTime(readAt, bcp47) })
      : t(STATUS_KEY[state]);
  const Icon =
    state === 'sending'
      ? Clock
      : state === 'failed'
        ? AlertCircle
        : state === 'sent'
          ? Check
          : CheckCheck;
  return (
    <span
      title={label}
      className={cn(
        'inline-flex',
        state === 'read' && 'text-primary',
        state === 'failed' && 'text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Linkified({ text }: { text: string }) {
  return linkParts(text).map((part, i) => {
    const href = part.href ? safeHttpUrl(part.href) : null;
    return href ? (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:no-underline"
      >
        {part.text}
      </a>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    );
  });
}
