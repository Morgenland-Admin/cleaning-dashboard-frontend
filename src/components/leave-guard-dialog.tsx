import { ConfirmDialog } from '@/components/confirm-dialog';
import { useT } from '@/i18n';

import type { Blocker } from 'react-router-dom';

export function LeaveGuardDialog({
  blocker,
  title,
  description,
}: {
  blocker: Blocker;
  title?: string;
  description?: string;
}) {
  const t = useT();
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title={title ?? t('common.leaveTitle')}
      description={description ?? t('common.leaveDescription')}
      confirmLabel={t('common.leaveConfirm')}
      cancelLabel={t('common.leaveCancel')}
      isDangerous
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}
