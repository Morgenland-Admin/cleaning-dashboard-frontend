const KEY = 'chunk-reload-at';
const COOLDOWN_MS = 60_000;

/** Reloads once per minute so a stale tab picks up the new build; false means "already tried, show the error". */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  );
}
