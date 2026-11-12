import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import { hasCompleteHomeDetails } from "./openwebninja-cache";
import { matchesLandingCard } from "./landing-card-pool";
import {
  dedupeImageUrls,
  OPENWEBNINJA_ID,
  listedAt,
  canonicalHomePropertyType,
  type OpenWebNinjaHome,
} from "./openwebninja-contract";
import { searchHomesArea, type HomeProvider } from "./openwebninja.server";

/** Legacy city searches can still be refreshed by an operator. Public
 * inventory is selected from all saved searches rather than this allowlist. */
export const OPENWEBNINJA_CITIES = ["Boise", "Meridian", "Nampa", "Idaho Falls", "Coeur d'Alene"];

/** Geographic areas included in the statewide home feed. Each area is one
 * provider search per mode and is cached for 30 days. */
export const OPENWEBNINJA_AREAS = [
  {
    key: "treasure-valley",
    latitude: 43.615,
    longitude: -116.202,
    diameterMiles: 45,
  },
  {
    key: "magic-valley",
    latitude: 42.56297,
    longitude: -114.46102,
    diameterMiles: 45,
  },
  {
    key: "eastern-idaho",
    latitude: 43.49165,
    longitude: -112.03396,
    diameterMiles: 45,
  },
  {
    key: "southeast-idaho",
    latitude: 42.8713,
    longitude: -112.4455,
    diameterMiles: 45,
  },
  {
    key: "north-idaho",
    latitude: 47.67768,
    longitude: -116.78047,
    diameterMiles: 45,
  },
  {
    key: "western-idaho",
    latitude: 43.13295,
    longitude: -115.69198,
    diameterMiles: 45,
  },
  {
    key: "north-central-idaho",
    latitude: 46.41655,
    longitude: -117.01766,
    diameterMiles: 45,
  },
] as const;

export function canIncludeOpenWebNinja(data: ClassifiedBrowseInput) {
  if (data.includeAllMocks || data.sellerSlug || data.dealerSlug || data.group) return false;
  return data.category === "other-real-estate" && data.homeTab !== "build";
}

export function openWebNinjaCard(home: OpenWebNinjaHome): ClassifiedCard {
  return {
    id: `openwebninja-${home.id}`,
    productId: `openwebninja-${home.id}`,
    productSlug: "",
    title: home.address,
    city: home.city,
    state: home.state,
    region: "",
    postalCode: home.zip,
    priceCents: home.priceCents,
    currency: "USD",
    categorySlug: "other-real-estate",
    categoryName: "Homes",
    condition: "",
    fulfillmentMode: "",
    createdAt: listedAt(home),
    isFeatured: home.isFeatured,
    imageUrl: home.imageUrl,
    vehicle: null,
    externalHome: {
      source: "OpenWeb Ninja",
      sourceUrl: home.sourceUrl,
      cacheExpiresAt: home.cacheExpiresAt,
    },
    home: {
      mode: home.mode,
      propertyType: canonicalHomePropertyType(home.propertyType) ?? "Home",
      bedrooms: home.beds,
      bathrooms: home.baths,
      squareFeet: home.sqft,
      openHouse: home.openHouse,
      zestimate: home.zestimate,
      rentZestimate: home.rentZestimate,
    },
  };
}

export async function openWebNinjaCards(data: ClassifiedBrowseInput): Promise<ClassifiedCard[]> {
  if (!canIncludeOpenWebNinja(data)) return [];
  const ninja = await import("./openwebninja.server");
  const [homes, completeIds] = await Promise.all([
    ninja.cachedHomes(),
    ninja.completeHomeDetailIds(),
  ]);
  const q = data.q?.trim().toLowerCase();
  return homes
    .filter((home) => completeIds.has(home.id))
    .filter(
      (home) =>
        !q || `${home.address} ${home.city} ${home.propertyType ?? ""}`.toLowerCase().includes(q),
    )
    .map(openWebNinjaCard)
    .filter((card) => matchesLandingCard(card, { ...data, q: undefined }));
}

/** Refresh published inventory weekly. Regions without publishable homes
 * need fewer preview searches, leaving more requests for full property details. */
export const PUBLISHED_AREA_REFRESH_DAYS = 7;
export const PREVIEW_AREA_REFRESH_DAYS = 25;
const AREA_PROVIDER: Record<string, HomeProvider> = {
  "treasure-valley": "zillow",
  "western-idaho": "zillow",
  "magic-valley": "zillow",
  "north-central-idaho": "zillow",
  "eastern-idaho": "realestate",
  "southeast-idaho": "realestate",
  "north-idaho": "realestate",
};
const PROVIDERS: HomeProvider[] = ["zillow", "realestate"];
/** Match the existing database daily ceiling; the independent 100-call monthly
 * guard remains authoritative. Available credits can fill full homes promptly. */
export const HOME_DETAIL_DAILY_PACE = 25;

/**
 * One step of the scheduled homes job for each subscription, at most one
 * call each: refresh one of its area lists that is due, otherwise fetch full
 * details for one home that doesn't have them yet (any area; both
 * subscriptions return the same homes). Details are fetched once per home.
 */
export async function advanceHomeFeed() {
  const results: Record<string, unknown> = {};
  const sweep = { attempted: new Set<string>(), completed: new Set<string>() };
  for (const provider of PROVIDERS) {
    results[provider] = await advanceHomeFeedFor(provider, sweep).catch((error) => ({
      error: String(error?.message ?? error),
    }));
  }
  return results;
}

async function advanceHomeFeedFor(
  provider: HomeProvider,
  sweep: { attempted: Set<string>; completed: Set<string> },
) {
  const ninja = await import("./openwebninja.server");
  const db = ninja.cacheDb();
  if (!db || !ninja.openWebNinjaConfigured()) return { skipped: "not configured" };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRequests, error: paceError } = await db
    .from("openwebninja_api_requests")
    .select("cache_key,provider")
    .gte("created_at", since)
    .limit(100);
  const count = (recentRequests ?? []).filter((row) => row.provider === provider).length;
  // Before the per-provider migration only the original subscription runs.
  if (paceError) return { skipped: "per-provider budgets not set up" };
  if (count >= HOME_DETAIL_DAILY_PACE) return { skipped: "daily pace reached", usedToday: count };
  // A failed/partial property must not monopolize the queue or be retried by
  // the other subscription immediately. Retry it after a day, within DB caps.
  const attempted = new Set<string>();
  for (const row of recentRequests ?? []) {
    try {
      const key = JSON.parse(row.cache_key);
      if (key.kind === "property") attempted.add(String(key.id));
    } catch {
      /* Old malformed diagnostics are not property candidates. */
    }
  }
  const have = await ninja.completeHomeDetailIds();

  const searchKeys = OPENWEBNINJA_AREAS.flatMap((area) =>
    (["buy", "rent"] as const).map((mode) => ({
      area,
      mode,
      key: ninja.areaSearchKey("ID", area.key, mode),
    })),
  );
  const { data: searchRows, error: searchError } = await db
    .from("openwebninja_cache")
    .select("cache_key,payload,expires_at")
    // A pattern, not .in(): the JSON keys contain commas, which break
    // PostgREST's in-list and silently match nothing.
    .like("cache_key", '%"kind":"area-search"%');
  if (searchError) return { skipped: "saved searches unavailable" };
  const rowByKey = new Map((searchRows ?? []).map((row) => [row.cache_key, row]));

  // 1. This subscription's most overdue area list.
  const due = searchKeys
    .filter((entry) => (AREA_PROVIDER[entry.area.key] ?? "zillow") === provider)
    .map((entry) => {
      const row = rowByKey.get(entry.key);
      const fetchedAt = row ? Date.parse(row.expires_at) - ninja.CACHE_MS : 0;
      const published = (row?.payload?.homes ?? []).some((home: { id: string }) =>
        have.has(home.id),
      );
      const refreshDays = published ? PUBLISHED_AREA_REFRESH_DAYS : PREVIEW_AREA_REFRESH_DAYS;
      return { ...entry, overdueBy: Date.now() - fetchedAt - refreshDays * 86_400_000 };
    })
    .filter((entry) => entry.overdueBy > 0)
    .sort((a, b) => b.overdueBy - a.overdueBy)[0];
  if (due) {
    const result = await searchHomesArea("ID", due.area, due.mode, {
      forceRefresh: true,
      provider,
    });
    return { refreshed: `${due.area.key} ${due.mode}`, homes: result.homes.length };
  }

  // 2. One home without full details, newest first.
  const homes = await ninja.cachedHomes();
  const ids = [...new Set(homes.map((home) => home.id))];
  const next = ids.find((id) => !have.has(id) && !attempted.has(id) && !sweep.attempted.has(id));
  if (!next)
    return {
      done: ids.every((id) => have.has(id)),
      homes: ids.length,
      skipped: "no eligible detail candidates",
    };
  sweep.attempted.add(next);
  const detail = await ninja.propertyDetails(next, null, { provider });
  // A budget rejection reserves no call; the other subscription may still
  // fetch this home. Upstream attempts are also protected by the DB ledger.
  if (!detail.ok && detail.status === "limited") sweep.attempted.delete(next);
  // Skip duplicate work within this sweep without modifying the public
  // eligibility cache; public visibility still requires a saved detail row.
  if (detail.ok) sweep.completed.add(next);
  return {
    detailed: next,
    ok: detail.ok,
    remaining: ids.filter((id) => !have.has(id) && !sweep.completed.has(id)).length,
  };
}

/** Operator-only refresh of all statewide geographic feeds. */
export async function refreshOpenWebNinjaSearches() {
  const { searchHomesArea: searchArea } = await import("./openwebninja.server");
  const responses = await Promise.all(
    OPENWEBNINJA_AREAS.flatMap((area) =>
      (["buy", "rent"] as const).map((mode) =>
        searchArea("ID", area, mode, { forceRefresh: true }),
      ),
    ),
  );
  return {
    areas: OPENWEBNINJA_AREAS.length,
    modes: 2,
    refreshed: responses.filter((response) => response.homes.length > 0).length,
  };
}

export async function openWebNinjaDetail(listingId: string): Promise<ClassifiedDetail | null> {
  const match = listingId.match(OPENWEBNINJA_ID);
  const id = match?.[0].slice("openwebninja-".length);
  if (!id) return null;
  const { cachedHome, propertyDetails } = await import("./openwebninja.server");
  const found = await cachedHome(id);
  if (!found?.home) return null;
  const home = found.home;
  const details = await propertyDetails(home.id, home.sourceUrl, { cacheOnly: true });
  const extra = details.ok ? details.value : null;
  // Direct links follow the same completeness gate as public browse.
  if (!hasCompleteHomeDetails(extra)) return null;
  const card = openWebNinjaCard(home);
  // Cached property payloads may predate the provider-variant normalizer, so
  // apply the same dedupe when reading them instead of spending another API
  // request just to rewrite an existing cache entry.
  const images = extra?.images.length
    ? dedupeImageUrls(extra.images)
    : home.imageUrl
      ? [home.imageUrl]
      : [];
  const priceHistory = [
    ...(extra?.priceHistory ?? []),
    ...(extra?.originalListPrice
      ? [{ label: "Original list price", amount: extra.originalListPrice, date: null }]
      : []),
    ...(extra?.lastSalePrice
      ? [{ label: "Last recorded sale", amount: extra.lastSalePrice, date: extra.lastSaleDate }]
      : []),
    ...(extra?.priceReducedAt
      ? [
          {
            label: "Recent price reduction",
            amount: home.priceCents / 100,
            date: extra.priceReducedAt,
          },
        ]
      : []),
    { label: "Current list price", amount: home.priceCents / 100, date: null },
  ].filter(
    (entry, index, all) =>
      index === 0 || entry.amount !== all[index - 1]?.amount || entry.date !== all[index - 1]?.date,
  );
  const acreage = extra?.lotSize && extra.lotSize > 0 ? extra.lotSize / 43_560 : null;
  return {
    ...card,
    externalHome: {
      ...card.externalHome,
      source: "OpenWeb Ninja",
      sourceUrl: extra?.url ?? home.sourceUrl,
      // Details cached before attribution was kept have none.
      listedBy: extra?.listedBy ?? null,
    },
    listingNumber: home.id,
    description: extra?.description ?? null,
    postalCode: home.zip,
    expiresAt: null,
    sellerNote: null,
    variantId: card.id,
    seller: null,
    home: {
      ...card.home!,
      propertyType: extra?.propertyType ?? card.home!.propertyType,
      bedrooms: extra?.bedrooms && extra.bedrooms > 0 ? extra.bedrooms : card.home!.bedrooms,
      bathrooms: extra?.bathrooms && extra.bathrooms > 0 ? extra.bathrooms : card.home!.bathrooms,
      squareFeet:
        extra?.squareFeet && extra.squareFeet > 0 ? extra.squareFeet : card.home!.squareFeet,
      yearBuilt: extra?.yearBuilt ?? null,
      acreage: acreage ? `${acreage.toFixed(2)} acres` : null,
      heating: extra?.heating ?? null,
      cooling: extra?.cooling ?? null,
      garageParking: extra?.parking ?? null,
      hoaFees: extra?.hoaFees ?? null,
      schoolDistrict: extra?.schoolDistrict ?? null,
      amenities: extra?.amenities ?? [],
      appliancesIncluded: extra?.appliances ?? null,
      exteriorMaterial: extra?.exteriorMaterial ?? null,
      specialFeatures: extra?.specialFeatures ?? null,
      priceHistory,
      taxHistory: extra?.taxHistory ?? [],
      zestimate: extra?.zestimate ?? home.zestimate ?? null,
      rentZestimate: extra?.rentZestimate ?? home.rentZestimate ?? null,
      openHouse: extra?.openHouse ?? home.openHouse ?? null,
    },
    images: images.map((url) => ({ url, alt: card.title })),
  } as unknown as ClassifiedDetail;
}
