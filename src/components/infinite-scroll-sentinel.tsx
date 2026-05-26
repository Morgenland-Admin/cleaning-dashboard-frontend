import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useT } from '@/i18n';

/** Sentinel element that fires `onIntersect` when it enters the viewport. */
export function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  onIntersect,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onIntersect: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onIntersect();
            break;
          }
        }
      },
      // Pre-fetch before reaching the bottom.
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, onIntersect]);

  if (!hasMore) return null;
  return (
    <div
      ref={ref}
      className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          <span>{t('common.loading')}</span>
        </>
      ) : (
        <span className="opacity-0">.</span>
      )}
    </div>
  );
}
