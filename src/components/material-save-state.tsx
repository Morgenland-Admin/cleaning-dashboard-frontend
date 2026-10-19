import { useT } from '@/i18n';
import { formatDateTime } from '@/lib/utils';

import type { DraftMode, SaveStatus } from '@/lib/use-material-draft';

/** One line under the editor: shared/saved/local/read-only. */
export function SaveState({
  mode,
  status,
  meta,
  canWrite,
  bcp47,
}: {
  mode: DraftMode;
  status: SaveStatus;
  meta: { updatedAt: string; updatedByName: string | null } | null;
  canWrite: boolean;
  bcp47: string;
}) {
  const t = useT();
  if (!canWrite) return <>{t('materials.readOnly')}</>;
  if (mode === 'local') return <>{t('materials.saveLocal')}</>;
  if (mode === 'error' || status === 'error') return <>{t('materials.saveFailed')}</>;
  if (status === 'saving') return <>{t('materials.saving')}</>;
  if (meta) {
    return (
      <>
        {t('materials.savedAt', {
          when: formatDateTime(meta.updatedAt, bcp47),
          who: meta.updatedByName ?? '—',
        })}
      </>
    );
  }
  return <>{t('materials.saveShared')}</>;
}
