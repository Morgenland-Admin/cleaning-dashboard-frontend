import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { STATUS_VARIANT, statusText } from '@/pages/orders-shared';

import type { OrderStatus } from '@/lib/api';

/** Status comes from the DB; an unknown value renders raw in a neutral badge instead of crashing. */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus | string;
  className?: string;
}) {
  const t = useT();
  return (
    <Badge variant={STATUS_VARIANT[status as OrderStatus] ?? 'secondary'} className={className}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {statusText(t, status)}
    </Badge>
  );
}
