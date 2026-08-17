import { WifiOff } from 'lucide-react';

import { useT } from '@/i18n';
import { useIsOnline } from '@/lib/use-is-online';

/**
 * Offline indicator.
 *
 * Installed as a PWA the app shell keeps loading from the service-worker cache
 * while every query behind it fails, which reads as "the app is broken" rather
 * than "you have no signal". This says which one it is.
 *
 * Sits above the bottom tab bar on mobile so it never covers the nav.
 */
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
      {/* `bg-warning-soft text-warning` is the system's soft-surface pairing
          (see ui/badge.tsx) — `warning-foreground` is for the solid fill and is
          near-white, which would be unreadable here in light mode. */}
      <p className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning/40 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning shadow-lg">
        <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
        {t('offline.message')}
      </p>
    </div>
  );
}
