/* eslint-disable @typescript-eslint/no-explicit-any -- cached provider schemas */
import {
  homepageCard,
  HOME_MAX_STALE_MS,
  HOME_SOURCE_KEYS,
  uniqueHomeCards,
  type HomeSection,
  type HomeSourceKey,
  type HomepageSnapshot,
} from "./homepage-snapshot-contract.ts";
import type { ClassifiedCard } from "./classifieds.functions";
type Result = { cards: ClassifiedCard[]; total?: number; categoryCounts?: Record<string, number> };
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

const sources: Sources = {
  async native() {
    const result = await (await import("./classifieds.functions")).loadNativeHomepageInventory();
    return { cards: result.listings, total: result.total, categoryCounts: result.categoryCounts };
  },
  async vehicles() {
    const adapter = await import("./marketcheck.server");
    return {
      cards: await adapter.marketCheckCards(
        { state: "ID" },
        { cacheOnly: true, preparedHomeCache: adapter.prepareHomeMarketCheckCache(8000, true) },
      ),
    };
  },
  async homes() {
    const { openWebNinjaCard } = await import("./openwebninja-listings.server");
    const rows = await cachedRows("openwebninja_cache", '%"kind":"area-search"%');
    return {
      cards: rows.flatMap((row: any) =>
        (row.payload?.homes ?? []).filter((home: any) => home.state === "ID").map(openWebNinjaCard),
      ),
    };
  },
  async jobs() {
    const { adzunaCard } = await import("./adzuna-listings.server");
    const rows = await cachedRows("adzuna_search_cache");
    return {
      cards: rows.flatMap((row: any) =>
        (row.payload?.jobs ?? []).filter((job: any) => job.state === "ID").map(adzunaCard),
      ),
    };
  },
  async services() {
    const { DIRECTORY_COLUMNS, directoryCard } = await import("./service-directory-contract");
    const { data, error } = await bounded(
      (await db())
        .from("service_directory")
        .select(DIRECTORY_COLUMNS)
        .eq("hidden", false)
        .eq("state", "ID")
        .order("priority")
        .order("source_refreshed_at", { ascending: false })
        .limit(64),
    );
    if (error) throw new Error("Services could not be read.");
    return { cards: (data ?? []).map((row: any) => directoryCard(row)) };
  },
  async pets() {
    const { rescueGroupsCard } = await import("./rescuegroups.server");
    const rows = await cachedRows("rescuegroups_cache", "rescuegroups:v1:%");
    return {
      cards: rows.flatMap((row: any) =>
        (row.payload?.pets ?? [])
          .filter((pet: any) => pet.org?.state === "ID")
          .map(rescueGroupsCard),
      ),
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
) {
  const now = injected?.now ?? Date.now();
  const loaders = injected?.sources ?? sources;
  const [results, removed] = await Promise.all([
    Promise.allSettled(HOME_SOURCE_KEYS.map((key) => loaders[key]())),
    (injected?.removed ?? moderatedIds)(),
  ]);
  const sections: HomepageSnapshot["sections"] = {};
  for (const [index, key] of HOME_SOURCE_KEYS.entries()) {
    const result = results[index];
    let section: HomeSection | undefined;
    if (result.status === "fulfilled") {
      const value = result.value;
      // Keep a useful category mix rather than filling all rows with one feed.
      const counts = new Map<string, number>();
      const cards = uniqueHomeCards(value.cards.map(homepageCard))
        .filter((card) => {
          const group = [card.categorySlug, card.home?.mode, card.job?.employmentType]
            .filter(Boolean)
            .join("/");
          const limit = key === "native" ? 16 : key === "vehicles" ? 80 : 24;
          if ((counts.get(group) ?? 0) >= limit) return false;
          counts.set(group, (counts.get(group) ?? 0) + 1);
          return true;
        })
        .slice(0, key === "native" ? 240 : 100);
      section = { updatedAt: now, cards, total: value.total, categoryCounts: value.categoryCounts };
    } else {
      const saved = previous?.sections[key];
      if (saved && now - saved.updatedAt <= HOME_MAX_STALE_MS) section = saved;
      console.warn(`Homepage source temporarily unavailable: ${key}`);
    }
    if (section)
      sections[key] = { ...section, cards: section.cards.filter((card) => !removed.has(card.id)) };
  }
  if (!Object.keys(sections).length) throw new Error("No homepage sources could be refreshed.");
  return { version: 1 as const, generatedAt: now, sections };
}
