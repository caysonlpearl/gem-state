import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./runtime-env.server";
import {
  normalizeMashvisorProperty,
  normalizeMashvisorResult,
  type MashvisorPropertyExtra,
  type MashvisorResult,
} from "./mashvisor-contract";

// Keep each city result two weeks so five markets refresh about ten times
// monthly, leaving the remaining calls for property detail pages.
const CACHE_MS = 14 * 24 * 60 * 60 * 1000;

function cacheDb() {
  const dbUrl = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
  const dbKey =
    serverEnv("GEM_STATE_SUPABASE_SERVICE_ROLE_KEY") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !dbKey) return null;
  return createClient(dbUrl, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        if (dbKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${dbKey}`)
          headers.delete("Authorization");
        headers.set("apikey", dbKey);
        return fetch(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
      },
    },
  });
}

/** Budgeted, cached GET. Returns the cached payload, a fresh one, or a status. */
async function cachedCall<T>(
  key: string,
  path: string,
  normalize: (json: unknown) => T,
): Promise<{ ok: true; value: T } | { ok: false; status: "unavailable" | "limited" }> {
  const apiKey = serverEnv("MASHVISOR_API_KEY");
  const db = cacheDb();
  if (!apiKey || !db) return { ok: false, status: "unavailable" };
  try {
    const { data: reservation, error } = await db.rpc("reserve_mashvisor_search", {
      p_query_key: key,
    });
    if (error || !reservation) return { ok: false, status: "unavailable" };
    if (reservation.cached) return { ok: true, value: reservation.payload as T };
    if (!reservation.allowed) {
      const { data: stale } = await db
        .from("mashvisor_search_cache")
        .select("payload")
        .eq("query_key", key)
        .maybeSingle();
      return stale ? { ok: true, value: stale.payload as T } : { ok: false, status: "limited" };
    }
    const response = await fetch(`https://api.mashvisor.com/v1.1/client/${path}`, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      return { ok: false, status: response.status === 429 ? "limited" : "unavailable" };
    const value = normalize(await response.json());
    await db.from("mashvisor_search_cache").upsert({
      query_key: key,
      payload: value,
      expires_at: new Date(Date.now() + CACHE_MS).toISOString(),
    });
    return { ok: true, value };
  } catch {
    // Never log provider errors; they can echo request details.
    return { ok: false, status: "unavailable" };
  }
}

export async function searchHomesForSale(state: string, city: string): Promise<MashvisorResult> {
  const key = JSON.stringify({ v: 2, kind: "city", state, city: city.toLowerCase() });
  const result = await cachedCall(
    key,
    `city/properties/${encodeURIComponent(state)}/${encodeURIComponent(city)}?page=1&items=50`,
    normalizeMashvisorResult,
  );
  return result.ok ? result.value : { status: result.status, homes: [] };
}

/** One cached property-info request supplies the expanded details and photos. */
export async function propertyDetails(
  state: string,
  id: string,
): Promise<
  { ok: true; value: MashvisorPropertyExtra } | { ok: false; status: "unavailable" | "limited" }
> {
  const key = JSON.stringify({ v: 2, kind: "property", state, id });
  return cachedCall(
    key,
    `property?id=${encodeURIComponent(id)}&state=${encodeURIComponent(state)}`,
    normalizeMashvisorProperty,
  );
}

/** A home from any recent cached city search (for its listing page). */
export async function cachedHome(id: string) {
  const db = cacheDb();
  if (!db) return null;
  const { data } = await db
    .from("mashvisor_search_cache")
    .select("payload")
    .contains("payload", { homes: [{ id }] })
    .order("expires_at", { ascending: false })
    .limit(1);
  const homes = (data?.[0]?.payload as MashvisorResult | undefined)?.homes ?? [];
  return { home: homes.find((home) => home.id === id) ?? null, siblings: homes };
}
