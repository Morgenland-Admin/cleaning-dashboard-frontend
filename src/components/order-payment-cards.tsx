import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  RefreshCcw,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { KeyValue, KeyValueList } from '@/components/key-value';
import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale, useT } from '@/i18n';
import { ApiError, ordersAdminApi, type OrderRow } from '@/lib/api';
import { cn, formatCurrency, formatDateTime, isNonContactableEmail } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABEL,
  invalidateOrder,
  isImportedOrder,
  paymentMethodText,
} from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

const TEXT_LINK =
  'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type SyncResult = {
  order: OrderRow | null;
  stripe: { sessionStatus: string; paymentStatus: string };
  action: 'marked_paid' | 'marked_cancelled' | 'still_pending' | 'noop';
};

/** Picks the card for how the order is paid; `canWrite` false hides every payment action. */
export function OrderPaymentCard({
  companySlug,
  order,
  canWrite,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  canWrite: boolean;
}) {
  if (isImportedOrder(order)) return <ImportedPaymentCard order={order} />;
  if (order.paymentMode === 'after_service') {
    return (
      <AfterServicePaymentCard
        companySlug={companySlug}
        order={order}
        // A cancelled or refunded job is not billed any more.
        canAct={canWrite && !['cancelled', 'refunded'].includes(order.status)}
      />
    );
  }
  if (order.paymentProvider === 'paypal') return <PayPalPaymentCard order={order} />;
  return <StripePaymentCard companySlug={companySlug} order={order} canWrite={canWrite} />;
}

function PaidAlert({ order }: { order: OrderRow }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const method = paymentMethodText(t, order.paymentMethod);
  return (
    <Alert tone="success" title={`${t('orders.status.paid')}${method ? ` · ${method}` : ''}`}>
      {order.paidAt ? (
        <span className="tabular-nums">
          {formatDateTime(order.paidAt, bcp47)} ·{' '}
          {formatCurrency(order.totalCents / 100, 'EUR', bcp47)}
        </span>
      ) : null}
    </Alert>
  );
}

/** History from an import: the money was handled in the old system, nothing to do here. */
function ImportedPaymentCard({ order }: { order: OrderRow }) {
  const t = useT();
  return (
    <SectionCard title={t('orders.section.payment')} bodyClassName="space-y-3 p-4">
      {order.paidAt ? <PaidAlert order={order} /> : null}
      <p className="text-xs text-muted-foreground">{t('orders.legacy.paymentNote')}</p>
    </SectionCard>
  );
}

function AfterServicePaymentCard({
  companySlug,
  order,
  canAct,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  canAct: boolean;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invalidate = () => invalidateOrder(queryClient, companySlug, order.id);

  const recordPayment = useMutation({
    mutationFn: (method: 'cash' | 'ec_card') =>
      ordersAdminApi.recordPayment(companySlug, order.id, method),
    onSuccess: invalidate,
  });

  const paymentLink = useMutation({
    mutationFn: () => ordersAdminApi.createPaymentLink(companySlug, order.id),
    onSuccess: async (res) => {
      setLinkUrl(res.checkoutUrl);
      await invalidate();
    },
  });

  const busy = recordPayment.isPending || paymentLink.isPending;
  const errorMsg =
    recordPayment.error instanceof ApiError
      ? recordPayment.error.message
      : paymentLink.error instanceof ApiError
        ? paymentLink.error.message
        : recordPayment.isError || paymentLink.isError
          ? t('orders.afterService.failed')
          : null;
  const amount = formatCurrency(order.totalCents / 100, 'EUR', bcp47);
  // The payment link is e-mailed; an import placeholder address cannot receive it.
  const canMail = !isNonContactableEmail(order.customerEmail);

  const methods: Array<{ method: 'cash' | 'ec_card'; icon: LucideIcon }> = [
    { method: 'cash', icon: Banknote },
    { method: 'ec_card', icon: Wallet },
  ];

  return (
    <SectionCard title={t('orders.section.payAfterService')} bodyClassName="space-y-3 p-4">
      {order.paidAt ? (
        <PaidAlert order={order} />
      ) : !canAct ? (
        <p className="text-xs text-muted-foreground">
          {t('orders.afterService.notRecorded', { amount })}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('orders.afterService.recordHint', { amount })}
          </p>
          <div className="grid gap-2">
            {methods.map(({ method, icon: Icon }) => (
              <Button
                key={method}
                size="sm"
                variant="outline"
                className="justify-start"
                disabled={busy}
                loading={recordPayment.isPending && recordPayment.variables === method}
                onClick={() => recordPayment.mutate(method)}
              >
                <Icon aria-hidden="true" />
                {t(PAYMENT_METHOD_LABEL[method])}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy || !canMail}
              loading={paymentLink.isPending}
              onClick={() => paymentLink.mutate()}
            >
              <CreditCard aria-hidden="true" />
              {t(PAYMENT_METHOD_LABEL.credit_card)}
            </Button>
            {!canMail ? (
              <p className="text-xs text-muted-foreground">{t('orders.noEmailForLink')}</p>
            ) : null}
          </div>

          {linkUrl && (
            <Alert tone="info">
              <p>{t('orders.afterService.linkCreated', { email: order.customerEmail })}</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  readOnly
                  value={linkUrl}
                  aria-label={t('orders.afterService.linkLabel')}
                  className="min-w-0 flex-1 font-mono sm:text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(linkUrl);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard unavailable; the field stays selectable */
                    }
                  }}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? t('orders.afterService.copied') : t('orders.afterService.copy')}
                </Button>
              </div>
            </Alert>
          )}

          {errorMsg && <Alert tone="destructive">{errorMsg}</Alert>}
        </>
      )}
    </SectionCard>
  );
}

function ProviderIdCard({
  provider,
  action,
  children,
}: {
  provider: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-muted/40 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <CreditCard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {provider}
        </span>
        {action}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

function StripePaymentCard({
  companySlug,
  order,
  canWrite,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  canWrite: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const syncStripe = useMutation({
    mutationFn: () => ordersAdminApi.syncStripe(companySlug, order.id),
    onSuccess: () => invalidateOrder(queryClient, companySlug, order.id),
  });
  const syncError =
    syncStripe.error instanceof ApiError
      ? syncStripe.error.message
      : syncStripe.isError
        ? t('orders.stripe.syncFailed')
        : null;

  const piUrl = order.stripePaymentIntentId
    ? `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`
    : null;
  const sessionUrl = order.stripeSessionId
    ? `https://dashboard.stripe.com/payments/sessions/${order.stripeSessionId}`
    : null;

  const canSync = canWrite && order.status === 'payment_pending' && !!order.stripeSessionId;
  const hasAnyStripeId = !!(order.stripeSessionId || order.stripePaymentIntentId);

  return (
    <SectionCard title={t('orders.section.payment')} bodyClassName="space-y-3 p-4">
      {!hasAnyStripeId ? (
        <p className="text-xs text-muted-foreground">{t('orders.stripe.noData')}</p>
      ) : (
        <ProviderIdCard
          provider="Stripe"
          action={
            piUrl ? (
              <a
                href={piUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(TEXT_LINK, 'inline-flex items-center gap-1 text-xs')}
              >
                {t('orders.stripe.openDashboard')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null
          }
        >
          <KeyValueList>
            {order.stripePaymentIntentId ? (
              <KeyValue
                label={t('orders.stripe.paymentIntent')}
                value={<ProviderId value={order.stripePaymentIntentId} href={piUrl} />}
              />
            ) : null}
            {order.stripeSessionId ? (
              <KeyValue
                label={t('orders.stripe.checkoutSession')}
                value={<ProviderId value={order.stripeSessionId} href={sessionUrl} />}
              />
            ) : null}
          </KeyValueList>
        </ProviderIdCard>
      )}

      {canSync && (
        <Alert
          tone="warning"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncStripe.mutate()}
              loading={syncStripe.isPending}
            >
              <RefreshCcw aria-hidden="true" />
              {t('orders.stripe.sync')}
            </Button>
          }
        >
          {t('orders.stripe.syncHint')}
        </Alert>
      )}

      {syncStripe.data && <SyncResultBanner result={syncStripe.data} />}
      {syncError && <Alert tone="destructive">{syncError}</Alert>}
    </SectionCard>
  );
}

/** PayPal orders settle in the PayPal account — no Stripe IDs and no Stripe sync. */
function PayPalPaymentCard({ order }: { order: OrderRow }) {
  const t = useT();
  const hasIds = !!(order.paypalOrderId || order.paypalCaptureId);
  return (
    <SectionCard title={t('orders.section.payment')} bodyClassName="space-y-3 p-4">
      <ProviderIdCard provider="PayPal">
        {hasIds ? (
          <KeyValueList>
            {order.paypalOrderId ? (
              <KeyValue
                label={t('orders.paypal.orderId')}
                value={<ProviderId value={order.paypalOrderId} href={null} />}
              />
            ) : null}
            {order.paypalCaptureId ? (
              <KeyValue
                label={t('orders.paypal.captureId')}
                value={<ProviderId value={order.paypalCaptureId} href={null} />}
              />
            ) : null}
          </KeyValueList>
        ) : (
          <p className="text-xs text-muted-foreground">{t('orders.paypal.noData')}</p>
        )}
      </ProviderIdCard>
      <p className="text-xs text-muted-foreground">{t('orders.paypal.manualNote')}</p>
    </SectionCard>
  );
}

function ProviderId({ value, href }: { value: string; href: string | null }) {
  const display = value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(TEXT_LINK, 'font-mono text-xs')}
      title={value}
    >
      {display}
    </a>
  ) : (
    <span className="font-mono text-xs" title={value}>
      {display}
    </span>
  );
}

const SYNC_RESULT_TONE = {
  marked_paid: 'success',
  marked_cancelled: 'destructive',
  still_pending: 'warning',
  noop: 'neutral',
} as const;

function SyncResultBanner({ result }: { result: SyncResult }) {
  const t = useT();
  const text = {
    marked_paid: t('orders.stripe.markedPaid'),
    marked_cancelled: t('orders.stripe.markedCancelled'),
    still_pending: t('orders.stripe.stillPending', {
      sessionStatus: result.stripe.sessionStatus,
      paymentStatus: result.stripe.paymentStatus,
    }),
    noop: t('orders.stripe.noop'),
  }[result.action];
  return <Alert tone={SYNC_RESULT_TONE[result.action] ?? 'neutral'}>{text}</Alert>;
}
