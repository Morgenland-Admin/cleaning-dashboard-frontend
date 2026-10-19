import { FileText, Paperclip, RotateCw, Send, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { ChatEmojiPicker } from '@/components/chat-emoji-picker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/i18n';
import { ALLOWED_FILE_TYPES, formatBytes, insertAt, MAX_BODY } from '@/lib/chat';
import { cn } from '@/lib/utils';

import type { ChatAttachment } from '@/lib/api';
import type { DraftFile, useChatDrafts } from '@/lib/use-chat-drafts';

const MAX_HEIGHT = 192;
const ACCEPT = [...ALLOWED_FILE_TYPES, '.heic', '.heif'].join(',');

function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function ChatComposer({
  draftKey,
  drafts,
  onSend,
  onTyping,
}: {
  /** sessionStorage key: an unsent text survives switching conversations. */
  draftKey: string;
  drafts: ReturnType<typeof useChatDrafts>;
  onSend: (payload: { body?: string; attachments?: ChatAttachment[] }) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const { t } = useLocale();
  const hintId = useId();
  const [text, setText] = useState(() => readDraft(draftKey));
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingSince = useRef(0);
  const typingStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caret = useRef<{ at: number; focus: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
    if (caret.current) {
      if (caret.current.focus) el.focus();
      el.setSelectionRange(caret.current.at, caret.current.at);
      caret.current = null;
    }
  }, [text]);

  const tooLong = text.length > MAX_BODY;
  const canSend = !drafts.uploading && !tooLong && (text.trim().length > 0 || drafts.ready > 0);

  function change(value: string) {
    setText(value);
    writeDraft(draftKey, value);
    const now = Date.now();
    if (now - typingSince.current > 2000) {
      typingSince.current = now;
      onTyping(true);
    }
    if (typingStop.current) clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => {
      typingSince.current = 0;
      onTyping(false);
    }, 3000);
  }

  function insertEmoji(char: string, keepOpen: boolean) {
    const el = areaRef.current;
    const start = el?.selectionStart ?? text.length;
    const next = insertAt(text, start, el?.selectionEnd ?? start, char);
    caret.current = { at: next.caret, focus: !keepOpen };
    change(next.value);
  }

  function send() {
    if (!canSend) return;
    const attachments = drafts.take();
    onSend({
      body: text.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
    });
    setText('');
    writeDraft(draftKey, '');
    if (typingStop.current) clearTimeout(typingStop.current);
    typingSince.current = 0;
    onTyping(false);
    areaRef.current?.focus();
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 pb-2 pt-2.5 sm:px-4">
      {drafts.files.length > 0 ? (
        <ul aria-label={t('chat.draftFiles')} className="mb-2 flex flex-wrap gap-2">
          {drafts.files.map((f) => (
            <DraftChip
              key={f.id}
              file={f}
              onRemove={() => drafts.remove(f.id)}
              onRetry={() => drafts.retry(f.id)}
            />
          ))}
        </ul>
      ) : null}

      {/* One rounded row; it carries the textarea's border and focus ring. */}
      <div className="flex items-end gap-0.5 rounded-2xl border border-input bg-card p-1 shadow-xs transition-colors hover:border-muted-foreground has-[[aria-invalid=true]]:border-destructive has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-1 has-[textarea:focus-visible]:ring-ring">
        {/* Proxy for the paperclip button, which carries label and focus ring. */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            drafts.add(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          aria-label={t('chat.attachFile')}
          title={t('chat.attachFile')}
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground sm:size-10"
        >
          <Paperclip aria-hidden="true" />
        </Button>
        <Textarea
          ref={areaRef}
          value={text}
          rows={1}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            const coarse = window.matchMedia('(pointer: coarse)').matches;
            if (e.metaKey || e.ctrlKey || (!e.shiftKey && !coarse)) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            const files = e.clipboardData?.files;
            if (!files?.length) return;
            if (!e.clipboardData.getData('text/plain')) e.preventDefault();
            drafts.add(files);
          }}
          placeholder={t('chat.composerPlaceholder')}
          aria-label={t('chat.composerPlaceholder')}
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          className="min-h-10 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 shadow-none focus-visible:ring-0"
        />
        <ChatEmojiPicker onPick={insertEmoji} />
        <Button
          type="button"
          size="icon"
          onClick={send}
          disabled={!canSend}
          aria-label={t('chat.send')}
          title={t('chat.send')}
          className="shrink-0 rounded-full sm:size-10"
        >
          <Send aria-hidden="true" />
        </Button>
      </div>
      <p
        id={hintId}
        className="mt-1 flex justify-between gap-3 px-2 text-2xs text-muted-foreground"
      >
        <span className="hidden sm:inline">{t('chat.sendHint')}</span>
        {text.length > MAX_BODY - 500 ? (
          <span className={cn('ml-auto tabular-nums', tooLong && 'font-medium text-destructive')}>
            {t('chat.charCount', { n: text.length, max: MAX_BODY })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function DraftChip({
  file,
  onRemove,
  onRetry,
}: {
  file: DraftFile;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const { t, bcp47 } = useLocale();
  const pct = Math.round(file.progress * 100);
  return (
    <li
      className={cn(
        'relative flex w-52 items-center gap-2 overflow-hidden rounded-md border bg-muted py-1.5 pl-1.5 pr-0.5 text-xs',
        file.status === 'error' ? 'border-destructive' : 'border-border',
      )}
    >
      {file.previewUrl ? (
        <img src={file.previewUrl} alt="" className="size-9 shrink-0 rounded-sm object-cover" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-card">
          <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{file.name}</span>
        <span
          className={cn(
            'block text-2xs',
            file.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {file.status === 'uploading'
            ? t('chat.uploading', { pct })
            : file.status === 'error'
              ? t('chat.uploadFailed')
              : formatBytes(file.size, bcp47)}
        </span>
      </span>
      {file.status === 'error' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRetry}
          aria-label={t('chat.retryUpload', { name: file.name })}
          title={file.error}
        >
          <RotateCw aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label={t('chat.removeAttachment', { name: file.name })}
        className="text-muted-foreground hover:text-foreground"
      >
        <X aria-hidden="true" />
      </Button>
      {file.status === 'uploading' ? (
        <span
          role="progressbar"
          aria-label={file.name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-border"
        >
          <span
            className="block h-full bg-primary transition-[width] duration-fast"
            style={{ width: `${pct}%` }}
          />
        </span>
      ) : null}
    </li>
  );
}
