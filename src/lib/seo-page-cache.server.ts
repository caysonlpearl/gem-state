import type { PlacePageData } from "./place-pages.functions";
import { homepageCard } from "./homepage-snapshot-contract";
import type { ClassifiedCard } from "./classifieds.functions";
import { serverEnv } from "./runtime-env.server";

export const SEO_REFRESH_MS = 5 * 60_000;
export const SEO_MAX_STALE_MS = 6 * 60 * 60_000;
type Entry = { version: 1; key: string; generatedAt: number; value: PlacePageData };
type Store = {
  read(key: string): Promise<unknown>;
  write(key: string, entry: Entry): Promise<void>;
  acquire(key: string, slot: number): Promise<boolean>;
  release?(key: string, slot: number): Promise<void>;
};
type Load = () => Promise<PlacePageData | null>;
const queued = new Map<string, () => Promise<unknown>>();

/** Only public page/card fields enter shared storage. Never cache the page
 * shell, session, favorites, raw provider responses or private seller data. */
export function publicSeoPage(value: PlacePageData): PlacePageData {
  const card = (listing: PlacePageData["listings"][number]) =>
    homepageCard(listing as ClassifiedCard);
  return {
    ...value,
    listings: value.listings.map(card),
    regionGroups: value.regionGroups.map((group) => ({
      ...group,
      listings: group.listings.map(card),
    })),
    recentlySold: value.recentlySold.map((listing) => ({
      ...card(listing),
      soldAt: listing.soldAt,
    })),
  };
}

export function createSeoPageCache(
  store: Store,
  clock = Date.now,
  enqueue = (key: string, task: () => Promise<unknown>) => {
    queued.set(key, task);
    if (queued.size > 300) queued.delete(queued.keys().next().value!);
  },
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  const memory = new Map<string, { entry: Entry; checkedAt: number }>();
  const reading = new Map<string, Promise<PlacePageData | null>>();
  function remember(key: string, entry: Entry) {
    memory.delete(key);
    memory.set(key, { entry, checkedAt: clock() });
    if (memory.size > 300) memory.delete(memory.keys().next().value!);
  }
  const usable = (entry: unknown, key: string): entry is Entry => {
    const e = entry as Entry | null;
    return (
      !!e &&
      e.version === 1 &&
      e.key === key &&
      Number.isFinite(e.generatedAt) &&
      e.generatedAt <= clock() &&
      clock() - e.generatedAt <= SEO_MAX_STALE_MS &&
      typeof e.value?.heading === "string" &&
      Array.isArray(e.value.listings) &&
      Array.isArray(e.value.regionGroups) &&
      Array.isArray(e.value.recentlySold)
    );
  };
  async function refresh(key: string, load: Load) {
    let acquired;
    const slot = Math.floor(clock() / SEO_REFRESH_MS);
    try {
      acquired = await store.acquire(key, slot);
    } catch {
      // A cache outage need not take down otherwise available public inventory.
      // This fallback still reads stored sources only and spends no API quota.
      const value = await load();
      if (!value) return null;
      const entry: Entry = { version: 1, key, generatedAt: clock(), value: publicSeoPage(value) };
      remember(key, entry);
      return entry.value;
    }
    if (!acquired) return null;
    let persisted = false;
    try {
      const loaded = await load();
      if (!loaded) return null;
      const entry: Entry = { version: 1, key, generatedAt: clock(), value: publicSeoPage(loaded) };
      try {
        await store.write(key, entry);
        persisted = true;
      } catch {
        // Failed writes leave the remote last-good object untouched.
      }
      remember(key, entry);
      return entry.value;
    } finally {
      // A failed first build must not lock an empty page for five minutes.
      if (!persisted) await store.release?.(key, slot).catch(() => undefined);
    }
  }
  async function read(key: string, load: Load): Promise<PlacePageData | null> {
    const inFlight = reading.get(key);
    if (inFlight) return inFlight;
    const task = (async () => {
      let saved = memory.get(key)?.entry;
      if (!saved || clock() - (memory.get(key)?.checkedAt ?? 0) > 30_000) {
        try {
          const remote = await store.read(key);
          if (usable(remote, key)) {
            saved = remote;
            remember(key, remote);
          }
        } catch {
          /* A storage failure may use the bounded last-good copy. */
        }
      }
      if (usable(saved, key)) {
        if (clock() - saved.generatedAt >= SEO_REFRESH_MS) enqueue(key, () => refresh(key, load));
        return saved.value;
      }
      const built = await refresh(key, load);
      if (built) return built;
      // Another worker may be preparing this page for the first time. Give
      // its stored result a bounded chance to arrive instead of an instant 500.
      for (const delay of [0, 250, 500, 1000, 2000, 4000]) {
        if (delay) await pause(delay);
        const remote = await store.read(key).catch(() => null);
        if (usable(remote, key)) {
          remember(key, remote);
          return remote.value;
        }
      }
      throw new Error("Search listings are temporarily unavailable. Please try again.");
    })().finally(() => reading.delete(key));
    reading.set(key, task);
    return task;
  }
  return { read, refresh };
}

const bucket = "homepage-snapshots";
async function objectKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
const shared = createSeoPageCache({
  async read(key) {
    const base = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
    if (!base) throw new Error("SEO cache is not configured.");
    const response = await fetch(
      `${base}/storage/v1/object/public/${bucket}/seo-pages/v2/${await objectKey(key)}.json`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) throw new Error("Saved SEO page unavailable.");
    const body = await response.text();
    if (body.length > 1_500_000) throw new Error("Saved SEO page too large.");
    return JSON.parse(body);
  },
  async write(key, entry) {
    const body = JSON.stringify(entry);
    if (body.length > 1_500_000) throw new Error("SEO page too large.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(`seo-pages/v2/${await objectKey(key)}.json`, body, {
        contentType: "application/json",
        cacheControl: "60",
        upsert: true,
      });
    if (error) throw new Error("SEO page could not be saved.");
  },
  async acquire(key, slot) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(`seo-page-leases/v2/${await objectKey(key)}/${slot}.json`, "{}", {
        contentType: "application/json",
        upsert: false,
      });
    if (error && !/already exists|duplicate/i.test(error.message))
      throw new Error("SEO refresh lease unavailable.");
    return !error;
  },
  async release(key, slot) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from(bucket)
      .remove([`seo-page-leases/v2/${await objectKey(key)}/${slot}.json`]);
  },
});
export const preparedSeoPage = (key: string, load: Load) => shared.read(key, load);
/** The server attaches these public-only refresh tasks to its own waitUntil. */
export function pendingSeoPageRefreshes() {
  const tasks = [...queued.entries()].slice(0, 4);
  for (const [key] of tasks) queued.delete(key);
  return tasks.map(([, run]) => run().catch(() => null));
}
