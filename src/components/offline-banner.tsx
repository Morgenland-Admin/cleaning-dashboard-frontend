import { WifiOff } from 'lucide-react';

import { useT } from '@/i18n';
import { useIsOnline } from '@/lib/use-is-online';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  const t = useT();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 lg:bottom-4"
    >
      {/* `warning-foreground` is near-white and for solid fills only; soft surfaces use `text-warning`. */}
      <p className="pointer-events-auto flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning shadow-lg">
        <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
        {t('offline.message')}
      </p>
    </div>
  );
}
