import { useCallback, useState } from 'react';

import { aiApi, errMessage, type AiAssistKind } from './api';

import type { ChatEntry } from '@/components/claude-chat-box';
import type { CompanySlug } from '@/contexts/project-context';

export function useClaudeAssist(opts: {
  kind: AiAssistKind;
  companySlug: CompanySlug;
  refId: number;
  getCurrent: () => string;
  apply: (text: string) => void;
  updatedLabel: string;
}) {
  const { kind, companySlug, refId, getCurrent, apply, updatedLabel } = opts;
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (instruction: string | undefined, label: string, runOpts?: { fresh?: boolean }) => {
      if (busy) return;
      setHistory((c) => [...c, { role: 'user', text: label }]);
      setBusy(true);
      try {
        const { text } = await aiApi.assist(companySlug, {
          kind,
          refId,
          current: runOpts?.fresh ? undefined : getCurrent(),
          instruction,
          fresh: runOpts?.fresh,
        });
        apply(text);
        setHistory((c) => [...c, { role: 'claude', text: updatedLabel }]);
      } catch (err) {
        setHistory((c) => [...c, { role: 'claude', text: errMessage(err) }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, kind, companySlug, refId, getCurrent, apply, updatedLabel],
  );

  return { history, busy, run };
}
