import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLocale, useT } from '@/i18n';
import { ApiError, ordersCancellationApi, type CancellationDecision } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

export function OrderCancelDialog({
  open,
  onOpenChange,
  companySlug,
  orderId,
  orderNumber,
  totalCents,
  paymentProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  orderId: number;
  orderNumber: string;
  totalCents: number;
  paymentProvider?: 'stripe' | 'paypal';
}) {
  const t = useT();
  const { bcp47 } = useLocale();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('orders.cancel.title')}</DialogTitle>
          <DialogDescription>
            {t('orders.cancel.order')} <span className="font-mono">{orderNumber}</span> ·{' '}
            {t('orders.total')}{' '}
            <span className="tabular-nums">{formatCurrency(totalCents / 100, 'EUR', bcp47)}</span>
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <LoadingState />
        ) : preview.isError || !decision ? (
          <ErrorState
            title={t('orders.cancel.policyFailed')}
            error={preview.error}
            onRetry={() => void preview.refetch()}
            retrying={preview.isFetching}
          />
        ) : (
          <PolicyBlock
            key={`${decision.reasonCode}:${decision.suggestedRefundCents}`}
            decision={decision}
            companySlug={companySlug}
            orderId={orderId}
            totalCents={totalCents}
            isPayPal={paymentProvider === 'paypal'}
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
      </DialogContent>
    </Dialog>
  );
}

function PolicyBlock({
  decision,
  companySlug,
  orderId,
  totalCents,
  isPayPal,
  onClose,
  onSuccess,
}: {
  decision: CancellationDecision;
  companySlug: CompanySlug;
  orderId: number;
  totalCents: number;
  isPayPal: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const eur = (cents: number) => formatCurrency(cents / 100, 'EUR', bcp47);
  // PayPal refunds can't be issued here — force €0 and refund manually in PayPal.
  const [refundEur, setRefundEur] = useState<string>(() =>
    formatCentsAsEurString(isPayPal ? 0 : decision.suggestedRefundCents),
  );
  const [reason, setReason] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (body: { reason?: string; refundCentsOverride?: number }) =>
      ordersCancellationApi.cancel(companySlug, orderId, body),
    onSuccess,
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : t('orders.cancel.failed'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision.allowed) return;
    setSubmitError(null);

    const refundCentsOverride = parseEurStringToCents(refundEur);
    if (refundCentsOverride == null) {
      setSubmitError(t('orders.cancel.invalidAmount'));
      return;
    }
    if (refundCentsOverride < 0 || refundCentsOverride > totalCents) {
      setSubmitError(t('orders.cancel.amountRange', { min: eur(0), max: eur(totalCents) }));
      return;
    }

    cancel.mutate({
      reason: reason.trim() || undefined,
      refundCentsOverride: isPayPal
        ? 0
        : refundCentsOverride === decision.suggestedRefundCents
          ? undefined
          : refundCentsOverride,
    });
  }

  const mode =
    decision.mode === 'full'
      ? { label: t('orders.cancel.modeFull'), variant: 'success' as const }
      : decision.mode === 'partial'
        ? { label: t('orders.cancel.modePartial'), variant: 'warning' as const }
        : { label: t('orders.cancel.modeNone'), variant: 'destructive' as const };

  if (!decision.allowed) {
    return (
      <>
        <Alert tone="destructive" title={mode.label}>
          {decision.message}
        </Alert>
        <p className="text-xs text-muted-foreground">
          {t('orders.cancel.notAllowedHint', { status: t('orders.status.refunded') })}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert tone="neutral" title={<Badge variant={mode.variant}>{mode.label}</Badge>}>
        {decision.message}
      </Alert>

      {isPayPal && <Alert tone="warning">{t('orders.cancel.paypalNote')}</Alert>}

      <FormField
        label={t('orders.cancel.refundLabel')}
        hint={
          isPayPal
            ? t('orders.cancel.refundPaypalHint')
            : t('orders.cancel.refundHint', { amount: eur(decision.suggestedRefundCents) })
        }
      >
        <Input
          type="text"
          inputMode="decimal"
          value={refundEur}
          onChange={(e) => setRefundEur(e.target.value)}
          placeholder="0,00"
          disabled={isPayPal}
          className="tabular-nums"
        />
      </FormField>

      <FormField label={t('orders.cancel.reasonLabel')}>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('orders.cancel.reasonPlaceholder')}
        />
      </FormField>

      {submitError && <Alert tone="destructive">{submitError}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={cancel.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="destructive" loading={cancel.isPending}>
          {t('orders.cancel.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Refund input value in German notation (49,90): the parser expects it, whatever the UI language.
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
