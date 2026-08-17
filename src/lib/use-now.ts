import { useEffect, useState } from 'react';

/**
 * `Date.now()` that re-renders on a timer.
 *
 * Reading the clock straight from a component body is impure: React may discard
 * that render and re-run it with a different answer, and two rows of the same
 * list can land on opposite sides of a boundary. It is also stale by
 * construction — once a page stops refetching, an "expires at" comparison keeps
 * reporting the answer it had when the last render happened.
 *
 * Use this for anything whose *rendered output* changes as time passes on its
 * own (expiry, overdue). Timestamps that only get formatted do not need it.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
