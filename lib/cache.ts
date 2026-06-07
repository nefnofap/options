// Tiny in-process cache. Lets repeated requests (auto-refresh polls, tab
// switches) reuse a recent upstream response instead of hammering the
// provider — the main defense against Yahoo's 429 rate limiting. Also keeps
// the last good value so we can serve it stale when a refresh is throttled.

interface Entry {
  value: unknown;
  ts: number;
}

const store = new Map<string, Entry>();

/** Returns the cached value only if it's younger than ttlMs. */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > ttlMs) return null;
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { value, ts: Date.now() });
}

/** Returns the last cached value regardless of age (for stale fallback). */
export function cachePeek<T>(key: string): T | null {
  const e = store.get(key);
  return e ? (e.value as T) : null;
}
