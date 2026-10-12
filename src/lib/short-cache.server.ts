/**
 * A per-instance, in-memory cache for public page data that's identical for
 * every visitor. A minute of staleness on the home and landing pages is fine
 * for a classifieds site, and it lets warm server instances skip the database
 * round trips that make up most of the page's response time. Failed loads are
 * not kept.
 */
const MAX_ENTRIES = 300;
const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export function shortCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = load();
  entries.delete(key);
  entries.set(key, { expiresAt: now + ttlMs, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  // Maps iterate in insertion order, so the first key is the oldest.
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return value;
}

export const PUBLIC_PAGE_CACHE_MS = 60_000;
