import { ArrowUp, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { PromptEditDialog } from '@/components/prompt-edit-dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { useSession } from '@/lib/auth-client';

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
  idleHint: string;
  busyHint: string;
  sendLabel: string;
  quickActions: QuickAction[];
  onSend: (instruction: string) => void;
  editablePrompt?: { kind: AiAssistKind; companySlug: CompanySlug };
}) {
  const t = useT();
  const { data: session } = useSession();
  const [text, setText] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);

  // Writing a prompt decides what customers receive: admins only, matching the backend gate.
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
    <div className="border-t border-border bg-muted/40">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
        <ClaudeIcon className={busy ? 'animate-pulse' : ''} />
        <span className="text-xs font-medium leading-none">Claude</span>
        <span aria-hidden="true" className="text-2xs leading-none text-muted-foreground">
          ·
        </span>
        <span className="truncate text-2xs leading-none text-muted-foreground">
          {busy ? busyHint : idleHint}
        </span>
        {editablePrompt ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setPromptOpen(true)}
            aria-label={t('prompts.edit')}
            title={t('prompts.edit')}
            className="-my-1 ml-auto text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span className="hidden sm:inline">{t('prompts.edit')}</span>
          </Button>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="space-y-1 px-3 pb-1">
          {history.slice(-6).map((entry, i) =>
            entry.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <span className="max-w-[85%] rounded-lg bg-primary-soft px-2.5 py-1 text-2xs leading-snug text-foreground">
                  {entry.text}
                </span>
              </div>
            ) : (
              <div
                key={i}
                className="flex items-start gap-1.5 text-2xs leading-snug text-muted-foreground"
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
          aria-label={t('ai.inputLabel')}
          rows={Math.min(4, Math.max(1, text.split('\n').length))}
          disabled={busy}
          className="flex-1 resize-none bg-transparent py-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60 sm:text-2sm"
        />
        <Button
          type="button"
          size="icon-sm"
          onClick={submit}
          disabled={busy || !text.trim()}
          aria-label={sendLabel}
          title={sendLabel}
          className="mb-0.5"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>

      {quickActions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {quickActions.map((a) => (
            <Button
              key={a.label}
              type="button"
              variant="outline"
              size="xs"
              onClick={a.run}
              disabled={busy}
              className="font-normal text-muted-foreground hover:border-claude hover:text-foreground"
            >
              {a.label}
            </Button>
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
