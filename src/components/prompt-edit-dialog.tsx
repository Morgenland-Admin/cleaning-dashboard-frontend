import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { ClaudeIcon } from '@/components/claude-icon';
import { LoadingState } from '@/components/empty-state';
import { SectionLabel } from '@/components/section';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { aiApi, errMessage, type AiAssistKind } from '@/lib/api';

import type { CompanySlug } from '@/contexts/project-context';

/** The locked output rules are appended server-side, so an edit can never break the mail template or invent prices. */
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
  // `null` = untouched: show whatever the server says the prompt is.
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
      setDraft(null);
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
      <DialogContent className="sm:max-w-2xl">
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
          <LoadingState className="min-h-40" />
        ) : query.error ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt-body">{t('prompts.instructionsLabel')}</Label>
              <Textarea
                id="prompt-body"
                rows={12}
                value={value}
                readOnly={!canEdit}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                aria-describedby="prompt-body-hint"
                className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
              />
              <p id="prompt-body-hint" className="text-xs text-muted-foreground">
                {t('prompts.brandPlaceholderHint')}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted px-3 py-2">
              <SectionLabel as="p" className="mb-1">
                {t('prompts.lockedLabel')}
              </SectionLabel>
              <p className="text-xs leading-relaxed text-muted-foreground">{prompt?.lockedRules}</p>
            </div>

            {!canEdit ? (
              <p className="text-xs text-muted-foreground">{t('prompts.readOnlyHint')}</p>
            ) : null}
          </div>
        )}

        <DialogFooter className="mt-1 gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || busy || !prompt?.isCustom}
            loading={resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
            title={t('prompts.resetHint')}
          >
            <RotateCcw aria-hidden="true" />
            {t('prompts.reset')}
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canEdit || busy || !dirty || tooShort}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate(value.trim())}
            >
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
