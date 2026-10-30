/* eslint-disable @typescript-eslint/no-explicit-any -- new provider tables predate generated types */
import {
  MERCHANDISE_SCOPES,
  MERCHANDISE_PAGE_SIZE,
  merchandiseSearchUrl,
  normalizeMerchandise,
  scopeKey,
  type MerchandiseScope,
} from "./avantlink-contract.ts";

type Database = any;
const bounded = (query: any) =>
  typeof query.abortSignal === "function" ? query.abortSignal(AbortSignal.timeout(8000)) : query;
async function database(): Promise<Database> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function refreshMerchandisePage(
  scope: MerchandiseScope,
  db?: Database,
  request = fetch,
) {
  db ??= await database();
  const key = scopeKey(scope);
  if (!MERCHANDISE_SCOPES.some((s) => scopeKey(s) === key))
    throw new Error("Invalid merchandise scope");
  const { data: reservation, error: reserveError } = await bounded(
    db.rpc("reserve_avantlink_merchandise_page", { p_scope_key: key }),
  );
  if (reserveError)
    return { scope: key, skipped: false, error: "Merchandise refresh is temporarily unavailable." };
  if (!reservation?.allowed)
    return { scope: key, skipped: true, reason: reservation?.reason ?? "unavailable" };
  const offset = Number(reservation.offset);
  try {
    const response = await request(merchandiseSearchUrl(scope, offset), {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error("provider_unavailable");
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length > MERCHANDISE_PAGE_SIZE) throw new Error("invalid_response");
    const byId = new Map(
      body
        .map((r) => normalizeMerchandise(r, scope))
        .filter((p) => p != null)
        .map((p) => [p.id, p]),
    );
    const products = [...byId.values()];
    const now = new Date().toISOString();
    if (products.length) {
      const { error } = await bounded(
        db.from("avantlink_merchandise").upsert(
          products.map((p) => ({
            id: p.id,
            sku: p.sku,
            scope_key: key,
            title: p.title,
            description: p.description,
            category_slug: p.categorySlug,
            price_cents: p.priceCents,
            payload: p,
            source_refreshed_at: now,
            active: true,
          })),
          { onConflict: "id" },
        ),
      );
      if (error) throw new Error("cache_write_failed");
    }
    const complete = body.length < MERCHANDISE_PAGE_SIZE;
    // Only a complete, successful scan can retire missing inventory. A failed
    // or truncated refresh leaves the last good records intact.
    if (complete) {
      const { error } = await bounded(
        db
          .from("avantlink_merchandise")
          .update({ active: false })
          .eq("scope_key", key)
          .lt("source_refreshed_at", reservation.generation),
      );
      if (error) throw new Error("cache_write_failed");
    }
    const { error } = await bounded(
      db
        .from("avantlink_merchandise_scopes")
        .update({
          lease_until: complete ? null : new Date(Date.now() + 31 * 60000).toISOString(),
          next_offset: complete ? 0 : offset + MERCHANDISE_PAGE_SIZE,
          ...(complete ? { completed_at: now } : {}),
          last_error: !complete && offset + MERCHANDISE_PAGE_SIZE >= 10000 ? "scope_limit" : null,
          received_count: Number(reservation.received ?? 0) + body.length,
          accepted_count: Number(reservation.accepted ?? 0) + products.length,
        })
        .eq("scope_key", key),
    );
    if (error) throw new Error("cache_write_failed");
    return {
      scope: key,
      skipped: false,
      received: body.length,
      accepted: products.length,
      complete,
    };
  } catch {
    await bounded(
      db
        .from("avantlink_merchandise_scopes")
        .update({ lease_until: new Date(Date.now() + 31 * 60000).toISOString(), last_error: "refresh_failed" })
        .eq("scope_key", key),
    );
    return {
      scope: key,
      skipped: false,
      error: "Could not refresh merchandise; cached results remain available.",
    };
  }
}

/** Existing half-hour scheduler refreshes the oldest eligible category page. */
export async function advanceMerchandiseFeed(db?: Database) {
  db ??= await database();
  const { data, error } = await bounded(
    db
      .from("avantlink_merchandise_scopes")
      .select("scope_key,completed_at,next_offset,lease_until"),
  );
  if (error) return { skipped: true, reason: "cache_unavailable" };
  const states = new Map<string, any>((data ?? []).map((r: any) => [r.scope_key, r]));
  const due = MERCHANDISE_SCOPES.filter((scope) => {
    const s = states.get(scopeKey(scope));
    return (
      (!s?.lease_until || Date.parse(s.lease_until) < Date.now()) &&
      Number(s?.next_offset ?? 0) < 10000 &&
      (s?.next_offset || !s?.completed_at || Date.parse(s.completed_at) < Date.now() - 86400000)
    );
  }).sort(
    (a, b) =>
      (Date.parse(states.get(scopeKey(a))?.completed_at ?? "") || 0) -
      (Date.parse(states.get(scopeKey(b))?.completed_at ?? "") || 0),
  );
  return due[0] ? refreshMerchandisePage(due[0], db) : { skipped: true, reason: "fresh" };
}
