import { ArrowUp, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { PromptEditDialog } from '@/components/prompt-edit-dialog';
import { useT } from '@/i18n';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import { ClaudeIcon } from './claude-icon';

import type { CompanySlug } from '@/contexts/project-context';
import type { AiAssistKind } from '@/lib/api';

export interface ChatEntry {
  role: 'user' | 'claude';
  text: string;
}

export interface QuickAction {
  label: string;
  run: () => void;
}

// Presentational "✦ Claude" strip — embeds inside a parent card (the editor it
// assists). Parent owns history/busy and supplies onSend.
export function ClaudeChatBox({
  busy,
  history,
  placeholder,
  idleHint,
  busyHint,
  sendLabel,
  quickActions,
  onSend,
  editablePrompt,
}: {
  busy: boolean;
  history: ChatEntry[];
  placeholder: string;
  idleHint: string; // status text when idle
  busyHint: string; // status text while busy
  sendLabel: string; // send button aria-label / title
  quickActions: QuickAction[];
  onSend: (instruction: string) => void;
  /** Shows the "edit prompt" affordance for this brand + assist kind. */
  editablePrompt?: { kind: AiAssistKind; companySlug: CompanySlug };
}) {
  const t = useT();
  const { data: session } = useSession();
  const [text, setText] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);

  // Writing a prompt decides what customers receive — admins only, matching the
  // backend gate. Everyone else can still open it read-only.
  const accessLevel = (session?.user as { accessLevel?: string } | undefined)?.accessLevel;
  const canEditPrompt = accessLevel === 'super_admin' || accessLevel === 'admin';

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    // Borderless: a faint tinted band with a top divider, fused into the parent card.
    <div className="border-t border-border/60 bg-muted/20">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
        <ClaudeIcon className={busy ? 'animate-pulse' : ''} />
        <span className="text-xs font-medium leading-none">Claude</span>
        <span aria-hidden="true" className="text-[11px] leading-none text-muted-foreground/50">
          ·
        </span>
        <span className="truncate text-[11px] leading-none text-muted-foreground">
          {busy ? busyHint : idleHint}
        </span>
        {editablePrompt ? (
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            aria-label={t('prompts.edit')}
            title={t('prompts.edit')}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
          >
            <SlidersHorizontal className="size-3" />
            <span className="hidden sm:inline">{t('prompts.edit')}</span>
          </button>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="space-y-1 px-3 pb-1">
          {history.slice(-6).map((entry, i) =>
            entry.role === 'user' ? (
              <div key={i} className="flex justify-end">
                {/* Mirrors the app's outgoing thread bubble so it reads as a sent message. */}
                <span className="max-w-[85%] rounded-2xl rounded-br-sm border border-rust/20 bg-rust/[0.05] px-2.5 py-1 text-[11px] leading-snug text-foreground/90">
                  {entry.text}
                </span>
              </div>
            ) : (
              <div
                key={i}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground"
              >
                <ClaudeIcon size={11} className="mt-px shrink-0" />
                <span>{entry.text}</span>
              </div>
            ),
          )}
        </div>
      ) : null}

      <div className="flex items-end gap-2 px-3 pb-1.5 pt-0.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={Math.min(4, Math.max(1, text.split('\n').length))}
          disabled={busy}
          className="flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          aria-label={sendLabel}
          title={sendLabel}
          className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 disabled:opacity-40"
        >
          <ArrowUp className="size-3.5" />
        </button>
      </div>

      {quickActions.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {quickActions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              disabled={busy}
              className={cn(
                'rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors',
                'hover:border-claude hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
                'disabled:opacity-50',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {editablePrompt ? (
        <PromptEditDialog
          open={promptOpen}
          onOpenChange={setPromptOpen}
          companySlug={editablePrompt.companySlug}
          kind={editablePrompt.kind}
          canEdit={canEditPrompt}
        />
      ) : null}
    </div>
  );
}
