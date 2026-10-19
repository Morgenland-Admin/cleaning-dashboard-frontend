import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDebounced } from '@/lib/use-debounced';

/**
 * A list search kept in the URL (`?q=`), so the back link from a record restores it.
 * `query` is what to fetch with: debounced while typing, cleared at once.
 */
export function useUrlSearch(param = 'q') {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get(param) ?? '';
  const [input, setInput] = useState(fromUrl);
  const debounced = useDebounced(input.trim(), 300);
  const query = input.trim() === '' ? '' : debounced;

  // A link that changes ?q (sidebar, bell) wins over the box; our own writes are left alone.
  const [seen, setSeen] = useState(fromUrl);
  if (fromUrl !== seen) {
    setSeen(fromUrl);
    if (fromUrl !== query) setInput(fromUrl);
  }

  useEffect(() => {
    if (query === fromUrl) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (query) next.set(param, query);
        else next.delete(param);
        return next;
      },
      { replace: true },
    );
  }, [query, fromUrl, param, setSearchParams]);

  return { input, setInput, query, searching: input.trim() !== query };
}
