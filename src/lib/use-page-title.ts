import { useEffect } from 'react';

const SUFFIX = 'Reinigungs-Portal';

/** Sets document.title for the component's lifetime. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) {
      document.title = `${title} · ${SUFFIX}`;
    } else {
      document.title = SUFFIX;
    }
    return () => {
      document.title = SUFFIX;
    };
  }, [title]);
}
