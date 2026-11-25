import { marketplaceStateCodes } from "../config/classifieds.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- cached provider schemas */
import {
  homepageCard,
  HOME_MAX_STALE_MS,
  HOME_CACHE_LAYOUT_VERSION,
  HOME_SOURCE_KEYS,
  type HomeSection,
  type HomeSourceKey,
  type HomepageSnapshot,
} from "./homepage-snapshot-contract.ts";
import { selectLandingCoverage } from "./landing-coverage.ts";
import { mergeDealerFeedVehicles, type PublishedFeedDealer } from "./dealer-feed-contract.ts";
import { MARKETCHECK_ID } from "./marketcheck-contract.ts";
import type { ClassifiedCard } from "./classifieds.functions";
type Result = {
  cards: ClassifiedCard[];
  total?: number;
  categoryCounts?: Record<string, number>;
  partialFailure?: { cause: unknown; dealers: PublishedFeedDealer[] };
};
type Sources = Record<HomeSourceKey, () => Promise<Result>>;
const bounded = (q: any) => q.abortSignal(AbortSignal.timeout(8000)).retry(false);
async function db(): Promise<any> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function cachedRows(table: string, pattern?: string) {
  let query = (await db()).from(table).select("payload").gt("expires_at", new Date().toISOString());
  if (pattern) query = query.like("cache_key", pattern);
  const { data, error } = await bounded(query.order("expires_at", { ascending: false }).limit(50));
  if (error) throw new Error("Saved inventory could not be read.");
  return data ?? [];
}

export async function loadHomepageVehicles(
  readDealers: () => Promise<{ cards: ClassifiedCard[]; dealers: PublishedFeedDealer[] }>,
  readAggregated: () => Promise<ClassifiedCard[]>,
): Promise<Result> {
  // Direct inventory is also the authority for suppressing duplicate dealer
  // inventory. Preserve the prior section if that authority cannot be read.
  const direct = await readDealers();
  let aggregated: ClassifiedCard[];
  try {
    aggregated = await readAggregated();
  } catch (cause) {
    return { cards: direct.cards, partialFailure: { cause, dealers: direct.dealers } };
  }
  return { cards: mergeDealerFeedVehicles(direct.cards, aggregated, direct.dealers) };
}

const sources: Sources = {
  async native() {
    const result = await (await import("./classifieds.functions")).loadNativeHomepageInventory();
    return { cards: result.listings, total: result.total, categoryCounts: result.categoryCounts };
  },
  async vehicles() {
    return loadHomepageVehicles(
      async () => (await import("./dealer-feed.server")).dealerFeedCards({ state: "ID" }),
      async () =>
        (await import("./marketcheck.server")).marketCheckCards(
          { state: "ID" },
          { cacheOnly: true, cacheReadTimeoutMs: 8000 },
        ),
    );
  },
  async homes() {
    const { openWebNinjaCards } = await import("./openwebninja-listings.server");
    return { cards: await openWebNinjaCards({ category: "other-real-estate", state: "ID" }) };
  },
  async jobs() {
    const { adzunaCard } = await import("./adzuna-listings.server");
    const rows = await cachedRows("adzuna_search_cache");
    const cards = rows.flatMap((row: any) => (row.payload?.jobs ?? []).map(adzunaCard));
    const { withEmployerLogos } = await import("./employer-logos.server");
    return { cards: await withEmployerLogos(cards, { cacheOnly: true }) };
  },
  async services() {
    const { directoryHomeCards } = await import("./service-directory.server");
    const { servicesShowcaseRows } = await import("../config/landing-service-rows.ts");
    const trades = servicesShowcaseRows.map((row) =>
      new URL(row.href, "https://onbluebird.com").searchParams.get("serviceSubcategory")!,
    );
    return { cards: await directoryHomeCards(trades) };
  },
  async pets() {
    const { rescueGroupsCard } = await import("./rescuegroups.server");
    const rows = await cachedRows("rescuegroups_cache", "rescuegroups:v1:%");
    return {
      cards: rows.flatMap((row: any) => (row.payload?.pets ?? []).map(rescueGroupsCard)),
    };
  },
  async merchandise() {
    return { cards: await (await import("./avantlink-listings.server")).merchandiseHomeCards() };
  },
};

async function moderatedIds() {
  const client = await db();
  const results = await Promise.all(
    ["partner_job_reports", "partner_vehicle_reports"].map((table) =>
      bounded(
        client
          .from(table)
          .select("listing_id", { count: "exact" })
          .eq("status", "reviewed")
          .limit(1000),
      ),
    ),
  );
  for (const [index, result] of results.entries()) {
    if (result.error)
      console.warn(
        `Homepage moderation read failed: ${index === 0 ? "partners" : "vehicles"} (${result.error.code ?? "timeout"})`,
      );
  }
  if (results.some((r) => r.error || (r.count ?? 0) > (r.data?.length ?? 0)))
    throw new Error("Homepage moderation could not be checked.");
  return new Set<string>(results.flatMap((r) => (r.data ?? []).map((row: any) => row.listing_id)));
}

/** Each source reads saved records only. One timeout cannot discard other
 * sources, and retains that source's own last-good timestamp and expiry. */
export async function buildHomepageSnapshot(
  previous: HomepageSnapshot | null,
  injected?: { sources: Sources; removed: () => Promise<Set<string>>; now?: number },
  fullInventory = false,
) {
  const now = injected?.now ?? Date.now();
  const loaders: Sources =
    injected?.sources ??
    (fullInventory
      ? {
          ...sources,
          async native() {
            const { loadNativeHomepageInventory } = await import("./classifieds.functions");
            const cards: ClassifiedCard[] = [];
            for (let offset = 0; ; offset += 1000) {
              const page = await loadNativeHomepageInventory(offset);
              cards.push(...page.listings);
              if (offset + 1000 >= page.total) break;
            }
            return { cards };
          },
          async vehicles() {
            const adapter = await import("./marketcheck.server");
            const prepared = adapter.prepareHomeMarketCheckCache(8000, true);
            const states: ClassifiedCard[][] = [];
            // Edge hosts bound simultaneous outgoing connections. Avoid queuing
            // four states plus every other inventory source behind short deadlines.
            for (const state of marketplaceStateCodes)
              states.push(
                await adapter.marketCheckCards(
                  { state },
                  { cacheOnly: true, cacheReadTimeoutMs: 8000, preparedHomeCache: prepared },
                ),
              );
            const direct = await (await import("./dealer-feed.server")).dealerFeedCards({});
            return {
              cards: mergeDealerFeedVehicles(direct.cards, states.flat(), direct.dealers),
            };
          },
          async homes() {
            return {
              cards: await (
                await import("./openwebninja-listings.server")
              ).openWebNinjaCards({ category: "other-real-estate" }),
            };
          },
        }
      : sources);
  // Moderation is required for both new cards and retained cards. Give those
  // reads their own connection window before starting any inventory work.
  const removed = await (injected?.removed ?? moderatedIds)();
  const results: PromiseSettledResult<Result>[] = [];
  const batchSize = fullInventory ? 1 : 2;
  for (let offset = 0; offset < HOME_SOURCE_KEYS.length; offset += batchSize) {
    // Individual sources can open multiple connections internally. A small
    // batch starts native inventory and vehicles first without queuing all
    // seven sources behind the worker's connection limit.
    const batch = HOME_SOURCE_KEYS.slice(offset, offset + batchSize);
    results.push(...(await Promise.allSettled(batch.map(async (key) => loaders[key]()))));
  }
  const sections: HomepageSnapshot["sections"] = {};
  const sourceFailures: NonNullable<HomepageSnapshot["sourceFailures"]> = {};
  for (const [index, key] of HOME_SOURCE_KEYS.entries()) {
    const result = results[index];
    const saved = previous?.sections[key];
    const usableSaved =
      saved &&
      now - saved.updatedAt <= HOME_MAX_STALE_MS &&
      (key !== "homes" || previous?.layoutVersion === HOME_CACHE_LAYOUT_VERSION)
        ? saved
        : undefined;
    let section: HomeSection | undefined;
    if (result.status === "fulfilled") {
      const value = result.value;
      if (value.partialFailure) {
        // A successful dealership read is authoritative, including when the feed
        // is empty. Keep only the still-usable aggregator cards from the old read.
        const direct = value.cards.map(homepageCard);
        const savedAggregated =
          usableSaved?.cards.filter(
            (card) => MARKETCHECK_ID.test(card.id) && !removed.has(card.id),
          ) ?? [];
        const merged = mergeDealerFeedVehicles(
          direct,
          savedAggregated,
          value.partialFailure.dealers,
        );
        const cards = fullInventory ? merged : selectLandingCoverage(merged, 200);
        const retainedAggregatorCards =
          usableSaved && cards.some((card) => MARKETCHECK_ID.test(card.id));
        if (cards.length)
          section = {
            updatedAt: retainedAggregatorCards ? usableSaved.updatedAt : now,
            cards,
          };
      } else {
        const cards = (
          fullInventory
            ? value.cards
            : selectLandingCoverage(
                value.cards,
                key === "native" ? 400 : key === "vehicles" ? 200 : 120,
              )
        ).map(homepageCard);
        section = {
          updatedAt: now,
          cards,
          total: value.total,
          categoryCounts: value.categoryCounts,
        };
      }
    } else {
      section = usableSaved;
    }
    const failure =
      result.status === "rejected" ? { cause: result.reason } : result.value.partialFailure;
    if (failure) {
      const message = failure.cause instanceof Error ? failure.cause.message : "";
      const reason = /subrequests|request limit/i.test(message)
        ? "request_limit"
        : /timeout|aborted|too long|deadline/i.test(message)
          ? "timeout"
          : "unavailable";
      sourceFailures[key] = { at: now, reason };
      // Keep diagnostics machine-readable without leaking provider payloads,
      // credentials, SQL, or raw database errors into the public snapshot.
      console.warn(`Homepage source temporarily unavailable: ${key} (${reason})`);
    }
    if (section)
      sections[key] = { ...section, cards: section.cards.filter((card) => !removed.has(card.id)) };
  }
  if (!Object.keys(sections).length) throw new Error("No homepage sources could be refreshed.");
  return {
    version: 1 as const,
    layoutVersion: HOME_CACHE_LAYOUT_VERSION,
    generatedAt: now,
    sections,
    sourceFailures,
  };
}
