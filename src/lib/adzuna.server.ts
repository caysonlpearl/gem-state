import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "./runtime-env.server";
import { normalizeAdzunaResult, type AdzunaSearch, type AdzunaResult } from "./adzuna-contract";

const empty = (status: "unavailable" | "limited"): AdzunaResult => ({ status, jobs: [], total: 0 });

export async function searchJobs(input: AdzunaSearch): Promise<AdzunaResult> {
  const appId = serverEnv("ADZUNA_APP_ID");
  const appKey = serverEnv("ADZUNA_APP_KEY");
  const dbUrl = serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL");
  const dbKey =
    serverEnv("GEM_STATE_SUPABASE_SERVICE_ROLE_KEY") || serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!appId || !appKey || !dbUrl || !dbKey) return empty("unavailable");
  // Untyped client is intentional: generated database types predate this migration.
  const db = createClient(dbUrl, dbKey, {
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
  const query = {
    // 5: city normalization, salary ranges and category mapping.
    version: 5,
    category: input.category,
    employment: input.employment,
    what: input.what.toLowerCase(),
    where: input.where.toLowerCase(),
    page: input.page,
  };
  const key = JSON.stringify(query);
  try {
    const { data: reservation, error } = await db.rpc("reserve_adzuna_search", {
      p_query_key: key,
    });
    // Fail closed if the shared budget/cache is not available.
    if (error || !reservation) return empty("unavailable");
    if (reservation.cached) return reservation.payload as AdzunaResult;
    if (!reservation.allowed) return empty("limited");
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${query.page}`);
    url.search = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      what: query.what,
      where: query.where,
      results_per_page: "50",
      sort_by: "date",
      ...(query.category ? { category: query.category } : {}),
      ...(query.employment ? { [query.employment]: "1" } : {}),
      "content-type": "application/json",
    }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return empty(response.status === 429 ? "limited" : "unavailable");
    const result = normalizeAdzunaResult(await response.json());
    const { error: cacheError } = await db.from("adzuna_search_cache").upsert({
      query_key: key,
      payload: result,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    });
    if (cacheError) return empty("unavailable");
    return result;
  } catch {
    // Provider errors can contain the request URL, including credentials.
    // Never log or return raw upstream errors.
    return empty("unavailable");
  }
}
