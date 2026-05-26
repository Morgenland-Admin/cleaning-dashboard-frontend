import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, ordersCancellationApi, type CancellationDecision } from '@/lib/api';

import type { CompanySlug } from '@/contexts/project-context';

export function OrderCancelDialog({
  open,
  onOpenChange,
  companySlug,
  orderId,
  orderNumber,
  totalCents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  orderId: number;
  orderNumber: string;
  totalCents: number;
}) {
  const queryClient = useQueryClient();

  // Policy is time-sensitive (24h rule) — never serve a cached decision.
  const preview = useQuery({
    queryKey: ['order-cancel-preview', companySlug, orderId] as const,
    queryFn: ({ signal }) => ordersCancellationApi.preview(companySlug, orderId, signal),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const decision = preview.data?.decision;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 grid w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="font-serif text-xl font-semibold tracking-tight">
            Auftrag stornieren
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Auftrag <span className="font-mono">{orderNumber}</span> · Gesamt{' '}
            <span className="tabular-nums">{formatEur(totalCents)}</span>
          </DialogPrimitive.Description>

          {preview.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : preview.isError || !decision ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="inline size-4 text-destructive" aria-hidden="true" />{' '}
              Stornierungsregel konnte nicht geladen werden.
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => preview.refetch()}
              >
                Erneut versuchen
              </Button>
            </div>
          ) : (
            // `key` remounts the form when the decision changes, resetting
            // its state to the new suggestion.
            <PolicyBlock
              key={`${decision.reasonCode}:${decision.suggestedRefundCents}`}
              decision={decision}
              companySlug={companySlug}
              orderId={orderId}
              totalCents={totalCents}
              onClose={() => onOpenChange(false)}
              onSuccess={() => {
                void queryClient.invalidateQueries({
                  queryKey: ['order-detail', companySlug, orderId],
                });
                void queryClient.invalidateQueries({
                  queryKey: ['orders-infinite', companySlug],
                  exact: false,
                });
                onOpenChange(false);
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PolicyBlock({
  decision,
  companySlug,
  orderId,
  totalCents,
  onClose,
  onSuccess,
}: {
  decision: CancellationDecision;
  companySlug: CompanySlug;
  orderId: number;
  totalCents: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [refundEur, setRefundEur] = useState<string>(() =>
    formatCentsAsEurString(decision.suggestedRefundCents),
  );
  const [reason, setReason] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (body: { reason?: string; refundCentsOverride?: number }) =>
      ordersCancellationApi.cancel(companySlug, orderId, body),
    onSuccess,
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : 'Stornierung fehlgeschlagen.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision.allowed) return;
    setSubmitError(null);

    const refundCentsOverride = parseEurStringToCents(refundEur);
    if (refundCentsOverride == null) {
      setSubmitError('Bitte geben Sie einen gültigen Erstattungsbetrag an (z.B. 49,90).');
      return;
    }
    if (refundCentsOverride < 0 || refundCentsOverride > totalCents) {
      setSubmitError(`Erstattung muss zwischen 0,00 € und ${formatEur(totalCents)} liegen.`);
      return;
    }

    cancel.mutate({
      reason: reason.trim() || undefined,
      refundCentsOverride:
        refundCentsOverride === decision.suggestedRefundCents ? undefined : refundCentsOverride,
    });
  }

  const modeBadge =
    decision.mode === 'full'
      ? { label: 'Volle Rückerstattung', cls: 'bg-emerald-100 text-emerald-900' }
      : decision.mode === 'partial'
        ? { label: 'Teilerstattung', cls: 'bg-amber-100 text-amber-900' }
        : { label: 'Stornierung nicht möglich', cls: 'bg-rose-100 text-rose-900' };

  if (!decision.allowed) {
    return (
      <>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div>
              <div className="font-semibold">{modeBadge.label}</div>
              <p className="mt-1 text-rose-900 dark:text-rose-100">{decision.message}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Wenn dieser Auftrag dennoch erstattet werden muss, nutzen Sie bitte den Status&nbsp;
          <strong>„Erstattet“</strong> für eine volle Rückerstattung.
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${modeBadge.cls}`}
            >
              {modeBadge.label}
            </span>
            <p className="mt-2 text-muted-foreground">{decision.message}</p>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="refund-eur" className="text-sm">
          Erstattungsbetrag (EUR)
        </Label>
        <Input
          id="refund-eur"
          type="text"
          inputMode="decimal"
          value={refundEur}
          onChange={(e) => setRefundEur(e.target.value)}
          placeholder="0,00"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Vorschlag: {formatCentsAsEurString(decision.suggestedRefundCents)} €. Auf 0 setzen für
          eine Stornierung ohne Rückerstattung.
        </p>
      </div>

      <div>
        <Label htmlFor="cancel-reason" className="text-sm">
          Grund (intern, optional)
        </Label>
        <Textarea
          id="cancel-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Kurze Notiz für das Auftrags-Log"
          className="mt-1"
        />
      </div>

      {submitError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={cancel.isPending}>
          Abbrechen
        </Button>
        <Button type="submit" variant="destructive" disabled={cancel.isPending}>
          {cancel.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Stornieren bestätigen
        </Button>
      </div>
    </form>
  );
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

function formatCentsAsEurString(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function parseEurStringToCents(s: string): number | null {
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
