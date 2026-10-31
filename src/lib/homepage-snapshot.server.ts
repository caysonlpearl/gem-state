import { serverEnv } from "./runtime-env.server.ts";
import {
  HOME_MAX_STALE_MS,
  HOME_REFRESH_MS,
  validHomepageSnapshot,
  type HomepageSnapshot,
} from "./homepage-snapshot-contract.ts";

export const HOMEPAGE_BUCKET = "homepage-snapshots";
export const HOMEPAGE_OBJECT = "v1/home.json";
type Store = {
  read(): Promise<unknown>;
  write(value: HomepageSnapshot): Promise<void>;
  acquire(slot: number): Promise<boolean>;
};
type Builder = (previous: HomepageSnapshot | null) => Promise<HomepageSnapshot>;

/** Fast shared reads and a distributed refresh lease. A visitor never builds
 * inventory, reserves provider calls, signs photos, or waits for a refresh. */
export function createHomepageSnapshotCache(store: Store, build: Builder, clock = Date.now) {
  let memory: HomepageSnapshot | null = null;
  let checkedAt = 0;
  let reading: Promise<HomepageSnapshot> | undefined;
  let refreshing: Promise<{ refreshed: boolean; reason?: string }> | undefined;
  const usable = (value: HomepageSnapshot | null) =>
    value &&
    Object.values(value.sections).some((s) => s && clock() - s.updatedAt <= HOME_MAX_STALE_MS);
  async function read(): Promise<HomepageSnapshot> {
    if (usable(memory) && clock() - checkedAt < 30_000) return memory!;
    if (reading) return reading;
    reading = (async () => {
      try {
        const value = await store.read();
        if (!validHomepageSnapshot(value) || !usable(value))
          throw new Error("No current homepage snapshot.");
        memory = value;
        checkedAt = clock();
        return value;
      } catch {
        if (usable(memory)) {
          checkedAt = clock();
          return memory!;
        }
        throw new Error("Homepage listings are temporarily unavailable. Please try again.");
      }
    })().finally(() => {
      reading = undefined;
    });
    return reading;
  }
  async function refresh(force = false) {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const previous = await read().catch(() => null);
      if (!force && previous && clock() - previous.generatedAt < HOME_REFRESH_MS)
        return { refreshed: false, reason: "fresh" };
      if (!(await store.acquire(Math.floor(clock() / HOME_REFRESH_MS))))
        return { refreshed: false, reason: "in_progress" };
      const next = await build(previous);
      if (!validHomepageSnapshot(next) || !usable(next))
        throw new Error("No successful homepage sources; previous snapshot retained.");
      await store.write(next);
      memory = next;
      checkedAt = clock();
      return { refreshed: true };
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }
  return { read, refresh };
}

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
const shared = createHomepageSnapshotCache(
  {
    async read() {
      const base = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
      if (!base) throw new Error("Homepage cache is not configured.");
      // Public card data only. No auth header, so the storage CDN can share this
      // small response across visitors instead of hitting Postgres every time.
      const response = await fetch(
        `${base}/storage/v1/object/public/${HOMEPAGE_BUCKET}/${HOMEPAGE_OBJECT}`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (!response.ok) throw new Error("Homepage cache could not be read.");
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error("Homepage cache is too large.");
      return JSON.parse(body);
    },
    async write(value) {
      const body = JSON.stringify(value);
      if (body.length > 2_000_000) throw new Error("Homepage cache is too large.");
      const { error } = await (
        await db()
      ).storage
        .from(HOMEPAGE_BUCKET)
        .upload(HOMEPAGE_OBJECT, body, {
          contentType: "application/json",
          cacheControl: "60",
          upsert: true,
        });
      if (error) throw new Error("Could not save the refreshed homepage.");
    },
    async acquire(slot) {
      // Storage's unique object key is a cross-instance five-minute lease.
      // Other workers lose this insert without doing the expensive source reads.
      const { error } = await (
        await db()
      ).storage
        .from(HOMEPAGE_BUCKET)
        .upload(`leases/${slot}.json`, "{}", { contentType: "application/json", upsert: false });
      if (error && !/already exists|duplicate/i.test(error.message))
        throw new Error("Homepage refresh lease is unavailable.");
      return !error;
    },
  },
  async (previous) =>
    (await import("./homepage-snapshot-build.server")).buildHomepageSnapshot(previous),
);

export const readHomepageSnapshot = () => shared.read();
export const refreshHomepageSnapshot = (force = false) => shared.refresh(force);
