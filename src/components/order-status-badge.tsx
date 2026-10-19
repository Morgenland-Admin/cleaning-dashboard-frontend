import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { STATUS_LABEL, STATUS_VARIANT } from '@/pages/orders-shared';

import type { OrderStatus } from '@/lib/api';

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const t = useT();
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {t(STATUS_LABEL[status])}
    </Badge>
  );
}
