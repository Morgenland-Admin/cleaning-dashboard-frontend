import { Loader2 } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

/**
 * Pass `rootRef` when the list scrolls in its own box, or `rootMargin` pre-fetch is clipped.
 * The button is the fallback when the observer does not fire again (sentinel still in view).
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

  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
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
      { root, rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, rootRef]);

  if (!hasMore) return null;
  return (
    <div
      ref={ref}
      aria-live="polite"
      className="flex min-h-16 items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <span>{t('common.loading')}</span>
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => onIntersectRef.current()}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  );
}
