import { useEffect, useState } from 'react';

/** Matches Tailwind's `lg` breakpoint — the width at which two-pane layouts work. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Whether the viewport is wide enough for desktop layout behaviour.
 *
 * Use it for things CSS alone cannot express — an IntersectionObserver root that
 * only exists at `lg`, or choosing between a side panel and a sheet. Pure
 * styling should stay in Tailwind's `lg:` variants.
 */
export function useIsDesktop(): boolean {
  // Read during initialisation, not in an effect: the value is available before
  // first paint, so the layout never flashes the wrong branch.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
