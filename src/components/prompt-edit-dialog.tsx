import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { ClaudeIcon } from '@/components/claude-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { aiApi, errMessage, type AiAssistKind } from '@/lib/api';

import type { CompanySlug } from '@/contexts/project-context';

/**
 * Edits the instruction text Claude gets for one assist kind, per brand.
 * The locked output rules are shown read-only — they are appended server-side
 * so an edit can never break the mail template or invent prices.
 */
export function PromptEditDialog({
  open,
  onOpenChange,
  companySlug,
  kind,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  kind: AiAssistKind;
  canEdit: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  // `null` = untouched: show whatever the server says the prompt is, so the
  // editor stays in sync through load and reset without an effect.
  const [draft, setDraft] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['ai-prompts', companySlug],
    queryFn: ({ signal }) => aiApi.prompts(companySlug, signal),
    enabled: open,
  });

  const prompt = query.data?.prompts.find((p) => p.kind === kind) ?? null;
  const value = draft ?? prompt?.body ?? '';

  function close() {
    onOpenChange(false);
    setDraft(null);
  }

  const saveMutation = useMutation({
    mutationFn: (body: string) => aiApi.savePrompt(companySlug, kind, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-prompts', companySlug] });
      toast({ title: t('prompts.saved') });
      close();
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('prompts.saveFailed'),
        description: errMessage(err),
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => aiApi.resetPrompt(companySlug, kind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-prompts', companySlug] });
      setDraft(null); // fall back to the refetched default
      toast({ title: t('prompts.resetDone') });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('prompts.resetFailed'),
        description: errMessage(err),
      });
    },
  });

  const busy = saveMutation.isPending || resetMutation.isPending;
  const dirty = !!prompt && value.trim() !== prompt.body.trim();
  const tooShort = value.trim().length < 20;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClaudeIcon />
            {t(`prompts.kind.${kind}` as never)}
          </DialogTitle>
          <DialogDescription>
            {t('prompts.description', { brand: prompt?.brand ?? '' })}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : query.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errMessage(query.error)}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="prompt-body" className="text-xs font-medium">
                {t('prompts.instructionsLabel')}
              </label>
              <Textarea
                id="prompt-body"
                rows={12}
                value={value}
                readOnly={!canEdit}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
              />
              <p className="text-2xs text-muted-foreground">{t('prompts.brandPlaceholderHint')}</p>
            </div>

            {/* Read-only: appended to every request, not editable by design. */}
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('prompts.lockedLabel')}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{prompt?.lockedRules}</p>
            </div>

            {!canEdit ? (
              <p className="text-2xs text-muted-foreground">{t('prompts.readOnlyHint')}</p>
            ) : null}
          </div>
        )}

        <DialogFooter className="mt-1 gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || busy || !prompt?.isCustom}
            onClick={() => resetMutation.mutate()}
            title={t('prompts.resetHint')}
          >
            {resetMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            {t('prompts.reset')}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canEdit || busy || !dirty || tooShort}
              onClick={() => saveMutation.mutate(value.trim())}
            >
              {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
