import { useEffect, useState } from 'react';

/**
 * Browser connectivity, from the `online`/`offline` events.
 *
 * `navigator.onLine` only reports whether the machine has *a* network, not
 * whether the API is reachable — good enough to distinguish "no signal" from
 * "something is broken", which is the only claim the UI makes with it.
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
