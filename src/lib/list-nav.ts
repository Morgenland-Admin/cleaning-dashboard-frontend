/** What a list passes in `location.state` when it opens a record. */
export interface ListNavState {
  from?: string;
  ids?: number[];
}

export function readListNav(state: unknown): ListNavState {
  if (!state || typeof state !== 'object') return {};
  const s = state as Record<string, unknown>;
  return {
    from: typeof s.from === 'string' ? s.from : undefined,
    ids:
      Array.isArray(s.ids) && s.ids.every((n) => typeof n === 'number')
        ? (s.ids as number[])
        : undefined,
  };
}
