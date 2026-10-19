import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, PackageCheck, Receipt } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { SectionCard, SectionLabel } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  ordersAdminApi,
  type InvoiceStatus,
  type OrderDetailResponse,
  type OrderRow,
  type OrderStatus,
} from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { invoiceStatusLabel, invoiceStatusTone } from '@/pages/invoices-shared';
import { isImportedOrder, orderDetailKey } from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

/** Statuses in which a receipt can be created or corrected (mirrors the backend). */
const RECEIPT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'accepted',
  'picked_up',
  'in_cleaning',
  'ready',
]);

/** Receipt + invoice; renders nothing when neither exists nor can be made. */
export function OrderDocumentsCard({
  companySlug,
  order,
  invoice,
  canWrite,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  invoice: OrderDetailResponse['invoice'];
  canWrite: boolean;
}) {
  const t = useT();
  const hasReceipt = (order.metadata?.receipt?.history?.length ?? 0) > 0;
  // Imported history was billed in the old system; nothing new is drafted from it.
  const live = canWrite && !isImportedOrder(order);
  const receiptPossible =
    live && order.pickupMode !== 'onsite' && RECEIPT_STATUSES.has(order.status);
  // An invoice is drafted from a live order; a cancelled one is not billed.
  const invoicePossible = live && order.status !== 'cancelled' && order.status !== 'refunded';
  if (!hasReceipt && !receiptPossible && !invoice && !invoicePossible) return null;

  return (
    <SectionCard title={t('orders.detail.documents')} bodyClassName="space-y-4 p-4">
      {hasReceipt || receiptPossible ? (
        <ReceiptBlock order={order} canEdit={receiptPossible} />
      ) : null}
      {invoice || invoicePossible ? (
        <InvoiceBlock companySlug={companySlug} order={order} invoice={invoice} />
      ) : null}
    </SectionCard>
  );
}

function ReceiptBlock({ order, canEdit }: { order: OrderRow; canEdit: boolean }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const receiptHref = `/auftraege/${order.id}/eingangsbestaetigung`;
  const history = order.metadata?.receipt?.history ?? [];
  const last = history[history.length - 1];
  const savedAt = order.metadata?.receipt?.savedAt;

  return (
    <div className="space-y-2">
      <SectionLabel as="h3" icon={<PackageCheck aria-hidden="true" />}>
        {t('orders.receipt.section')}
      </SectionLabel>
      {last ? (
        <div className="space-y-2">
          <div>
            <p className="text-2sm text-foreground">
              {t('orders.receipt.sentAt', { date: formatDateTime(last.sentAt, bcp47) })}
              {last.sentByName ? ` ${t('orders.receipt.sentBy', { name: last.sentByName })}` : ''}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(last.totalCents / 100, 'EUR', bcp47)}
              {history.length > 1
                ? ` · ${t('orders.receipt.sentTimes', { count: history.length })}`
                : ''}
            </p>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link to={receiptHref} state={location.state}>
                <PackageCheck aria-hidden="true" />
                {t('orders.receipt.editResend')}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {savedAt
              ? t('orders.receipt.draftSavedAt', { date: formatDateTime(savedAt, bcp47) })
              : t('orders.receipt.hint')}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to={receiptHref} state={location.state}>
              <PackageCheck aria-hidden="true" />
              {savedAt ? t('orders.receipt.continueDraft') : t('orders.receipt.create')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Creating never issues: the draft carries this order's positions so later extras go on the
 * same invoice (one document for the customer). Finalising is a separate step there.
 */
function InvoiceBlock({
  companySlug,
  order,
  invoice,
}: {
  companySlug: CompanySlug;
  order: OrderRow;
  invoice: OrderDetailResponse['invoice'];
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createInvoice = useMutation({
    mutationFn: () => ordersAdminApi.createInvoice(companySlug, order.id),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: orderDetailKey(companySlug, order.id) });
      await queryClient.invalidateQueries({ queryKey: ['invoices'], exact: false });
      toast.success(res.created ? t('orders.invoice.created') : t('orders.invoice.exists'));
      navigate(`/rechnungen/${res.invoice.id}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.invoice.failed')),
  });

  return (
    <div className="space-y-2">
      <SectionLabel as="h3" icon={<Receipt aria-hidden="true" />}>
        {t('orders.section.invoice')}
      </SectionLabel>
      {invoice ? (
        <div className="space-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2sm font-medium tabular-nums">
                {invoice.number ?? t('orders.invoice.noNumber')}
              </span>
              <StatusBadge
                tone={invoiceStatusTone(invoice.status)}
                label={invoiceStatusLabel(t, invoice.status as InvoiceStatus)}
              />
            </div>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {formatCurrency(invoice.totalCents / 100, 'EUR', bcp47)}
              {invoice.status === 'draft'
                ? ` · ${t('orders.invoice.editable')}`
                : invoice.issuedAt
                  ? ` · ${t('orders.invoice.issuedAt', { date: formatDateTime(invoice.issuedAt, bcp47) })}`
                  : null}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/rechnungen/${invoice.id}`}>
              {invoice.status === 'draft' ? t('orders.invoice.edit') : t('orders.invoice.open')}
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('orders.invoice.createHint')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createInvoice.mutate()}
            loading={createInvoice.isPending}
          >
            <Receipt aria-hidden="true" />
            {t('orders.invoice.create')}
          </Button>
        </div>
      )}
    </div>
  );
}
