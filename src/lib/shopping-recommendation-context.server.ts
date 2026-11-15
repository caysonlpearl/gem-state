import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import { validShoppingId, type Interest } from "./shopping-contract.ts";

export type ShoppingSeedContext = { category: string; mode: string | null };
type Response = { data: unknown; error: unknown; count?: number | null };
type Read = PromiseLike<Response> & {
  abortSignal(signal: AbortSignal): Read;
  retry(enabled: boolean): Read;
};
type Database = {
  from(table: string): {
    select(
      columns: string,
      options: { count: "exact" },
    ): { in(column: string, values: readonly string[]): Read };
  };
};
const unavailable = () => new Error("Recommendation context could not be read. Please retry.");

/** Resolve category/intent only, never another copy of every listing's text or
 * photos. The bound covers the existing history, favorite and choice budgets. */
export async function loadShoppingSeedContexts(db: Database, supplied: readonly string[]) {
  const ids = [...new Set(supplied)];
  if (ids.length > 15000 || !ids.every(validShoppingId)) throw unavailable();
  const result = new Map<string, ShoppingSeedContext>();
  if (!ids.length) return result;
  const chunks: string[][] = [];
  let chunk: string[] = [],
    bytes = 0;
  for (const id of ids) {
    const size = encodeURIComponent(id).length + 6;
    if (chunk.length && (chunk.length === 200 || bytes + size > 6000)) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(id);
    bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  try {
    return await withCatalogReadDeadline(async (deadline) => {
      const controller = new AbortController();
      const signal = AbortSignal.any([deadline, controller.signal]);
      try {
        for (let start = 0; start < chunks.length; start += 4) {
          signal.throwIfAborted();
          const group = chunks.slice(start, start + 4);
          const reads = await Promise.allSettled(
            group.map(async (batch) => {
              try {
                const response = await db
                  .from("shopping_inventory")
                  .select("listing_id,category,mode:card->home->>mode", { count: "exact" })
                  .in("listing_id", batch)
                  .abortSignal(signal)
                  .retry(false);
                signal.throwIfAborted();
                if (
                  response.error !== null ||
                  !Array.isArray(response.data) ||
                  response.data.length > batch.length ||
                  !Number.isSafeInteger(response.count) ||
                  response.count !== response.data.length
                )
                  throw unavailable();
                for (const value of response.data) {
                  if (!value || typeof value !== "object" || Array.isArray(value))
                    throw unavailable();
                  const row = value as Record<string, unknown>;
                  if (
                    Object.keys(row).length !== 3 ||
                    typeof row.listing_id !== "string" ||
                    !batch.includes(row.listing_id) ||
                    result.has(row.listing_id) ||
                    typeof row.category !== "string" ||
                    !/^[a-z0-9-]{1,80}$/.test(row.category) ||
                    !(row.mode === null || (typeof row.mode === "string" && row.mode.length <= 40))
                  )
                    throw unavailable();
                  result.set(row.listing_id, {
                    category: row.category,
                    mode: row.mode as string | null,
                  });
                }
              } catch {
                controller.abort();
                throw unavailable();
              }
            }),
          );
          if (reads.some((read) => read.status === "rejected")) throw unavailable();
        }
        signal.throwIfAborted();
        return result;
      } finally {
        controller.abort();
      }
    });
  } catch {
    throw unavailable();
  }
}

const priority = (a: Interest, b: Interest) =>
  b.score - a.score || b.lastAt - a.lastAt || a.listingId.localeCompare(b.listingId);

/** Represent distinct category/intents before adding more seeds from a single
 * interest. Ranking still uses the agreed signal weights and decay. */
export function shoppingRecommendationSeeds(
  profile: Map<string, Interest>,
  contexts: Map<string, ShoppingSeedContext>,
  limit = 8,
) {
  const groups = new Map<string, Interest[]>();
  for (const interest of [...profile.values()]
    .filter((i) => !i.dismissed && i.score > 0)
    .sort(priority)) {
    const context = contexts.get(interest.listingId);
    if (!context) continue;
    const key = JSON.stringify([context.category, context.mode]);
    const group = groups.get(key) ?? [];
    group.push(interest);
    groups.set(key, group);
  }
  const ids: string[] = [];
  while (groups.size && ids.length < limit) {
    const round = [...groups.entries()].sort((a, b) => priority(a[1][0], b[1][0]));
    for (const [key, group] of round) {
      if (ids.length === limit) break;
      ids.push(group.shift()!.listingId);
      if (!group.length) groups.delete(key);
    }
  }
  return ids;
}
