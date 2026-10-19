import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/** Blocks in-app navigation and tab close while `dirty`; call `allowLeave()` right before a deliberate navigate. */
export function useLeaveGuard(dirty: boolean) {
  const allow = useRef(false);
  const allowOnce = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowOnce.current) {
      allowOnce.current = false;
      return false;
    }
    return dirty && !allow.current && currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const allowLeave = useCallback(() => {
    allow.current = true;
  }, []);

  /** Lets exactly the next navigation through (e.g. a URL change that keeps the same form). */
  const allowNextNavigation = useCallback(() => {
    allowOnce.current = true;
  }, []);

  return { blocker, allowLeave, allowNextNavigation };
}
