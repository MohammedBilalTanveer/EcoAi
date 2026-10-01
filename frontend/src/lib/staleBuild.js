const RELOAD_KEY = 'ecoai_chunk_reload';

/** A lazy-loaded page whose file no longer exists — the site was redeployed. */
export const isStaleChunkError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    String(error?.message || error),
  );

/**
 * Reloads once to pick up the new build. Returns false if we already tried recently,
 * so a genuinely broken deploy can't cause a reload loop.
 */
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: reload anyway */
  }
  window.location.reload();
  return true;
}
