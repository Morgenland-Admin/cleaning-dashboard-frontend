import { useEffect, useState } from 'react';

// Use for output that changes as time passes (expiry, overdue); Date.now() in render is impure and goes stale.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
