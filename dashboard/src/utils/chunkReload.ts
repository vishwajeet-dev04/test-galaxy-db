/**
 * Recovery for "new deploy, old tab": each build renames the lazily loaded chunks (Help, BU detail),
 * so a tab opened before the deploy asks for files the server no longer has. One reload fetches the
 * new index.html and fixes it. The timestamp guard stops a reload loop if the chunk is really missing.
 */

const LAST_RELOAD_KEY = "galaxy.chunkReloadAt";
const RELOAD_GUARD_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** Reloads once per guard window. Returns false (no reload) when the guard is active or unusable. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch (err) {
    // Without storage the guard cannot work; skip the auto-reload rather than risk a loop.
    console.warn("chunk_reload_guard_unavailable", err);
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite fires `vite:preloadError` when a dynamic import or its CSS fails to load. */
export function installChunkReload(): void {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("chunk_load_failed", event.payload);
    if (reloadForNewVersion()) event.preventDefault();
  });
}
