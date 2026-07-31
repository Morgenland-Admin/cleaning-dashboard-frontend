import { Loader2 } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { useT } from '@/i18n';

/**
 * Sentinel element that fires `onIntersect` when it scrolls into view.
 *
 * Pass `rootRef` when the list lives inside its own `overflow-y-auto` box —
 * without it the observer measures against the viewport and `rootMargin`
 * pre-fetching is silently clipped away by the scroll container.
 */
export function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  onIntersect,
  rootRef,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onIntersect: () => void;
  rootRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  // Callers usually rebuild `onIntersect` on every render (it closes over the
  // query object). Keep it in a ref so the observer is created once instead of
  // being torn down and re-fired on each render.
  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
    // Read inside the effect: refs are attached before effects run, so the
    // scroll container is available here even on the first pass.
    const root = rootRef?.current ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onIntersectRef.current();
            break;
          }
        }
      },
      // Pre-fetch before reaching the bottom.
      { root, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, rootRef]);

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
