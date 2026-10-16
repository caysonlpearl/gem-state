import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import { isWithinClassifiedRadius, usStates } from "../config/classifieds.ts";
import {
  dedupeImageUrls,
  OPENWEBNINJA_ID,
  listedAt,
  type OpenWebNinjaHome,
  type OpenWebNinjaMode,
} from "./openwebninja-contract";
import { searchHomesArea, type HomeProvider } from "./openwebninja.server";

/** City/mode searches remain available for an explicitly selected city. */
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
  return (
    data.category === "other-real-estate" && (data.homeTab === "buy" || data.homeTab === "rent")
  );
}

function providerCity(data: ClassifiedBrowseInput) {
  const state = usStates.find(([code, name]) => code === data.state || name === data.state);
  if (state && state[0] !== "ID") return null;
  if (!data.city) return null;
  return (
    OPENWEBNINJA_CITIES.find((city) => city.toLowerCase() === data.city!.toLowerCase()) ?? null
  );
}

function modeFor(data: ClassifiedBrowseInput): OpenWebNinjaMode {
  return data.homeTab === "rent" ? "rent" : "buy";
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
    externalHome: { source: "OpenWeb Ninja", sourceUrl: home.sourceUrl },
    home: {
      mode: home.mode,
      propertyType: home.propertyType ?? "Home",
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
  const city = providerCity(data);
  const state = usStates.find(([code, name]) => code === data.state || name === data.state);
  const areas = !data.city && (!state || state[0] === "ID") ? OPENWEBNINJA_AREAS : [];
  let result;
  if (city) {
    result = await (await import("./openwebninja.server")).searchHomes("ID", city, modeFor(data));
  } else {
    if (!areas.length) return [];
    const responses = await Promise.all(
      areas.map((area) => searchHomesArea("ID", area, modeFor(data))),
    );
    const homes = Array.from(
      new Map(
        responses.flatMap((response) => response.homes).map((home) => [home.id, home]),
      ).values(),
    );
    result = { homes };
  }
  const q = data.q?.trim().toLowerCase();
  return result.homes
    .filter(
      (home) =>
        (data.priceMin == null || home.priceCents >= data.priceMin * 100) &&
        (data.priceMax == null || home.priceCents <= data.priceMax * 100) &&
        (data.homeBedroomsMin == null || (home.beds ?? -1) >= data.homeBedroomsMin) &&
        (data.homeBathroomsMin == null || (home.baths ?? -1) >= data.homeBathroomsMin) &&
        (data.homeSquareFeetMin == null || (home.sqft ?? -1) >= data.homeSquareFeetMin) &&
        (!data.postalCode || home.zip === data.postalCode) &&
        (!q ||
          `${home.address} ${home.city} ${home.propertyType ?? ""}`.toLowerCase().includes(q)) &&
        isWithinClassifiedRadius({
          city: data.city,
          listingCity: home.city,
          latitude: data.latitude,
          longitude: data.longitude,
          radiusMiles: data.radiusMiles,
        }),
    )
    .map(openWebNinjaCard);
}

/** Each area's for-sale and rental lists refresh weekly (prices, new and
 * sold homes), each area on one subscription so their budgets split the work. */
const AREA_REFRESH_DAYS = 7;
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
/** Calls per rolling day each subscription's job may use (~90 a month). */
const DAILY_PACE = 3;

/**
 * One step of the scheduled homes job for each subscription, at most one
 * call each: refresh one of its area lists that is due, otherwise fetch full
 * details for one home that doesn't have them yet (any area; both
 * subscriptions return the same homes). Details are fetched once per home.
 */
export async function advanceHomeFeed() {
  const results: Record<string, unknown> = {};
  for (const provider of PROVIDERS) {
    results[provider] = await advanceHomeFeedFor(provider).catch((error) => ({
      error: String(error?.message ?? error),
    }));
  }
  return results;
}

async function advanceHomeFeedFor(provider: HomeProvider) {
  const ninja = await import("./openwebninja.server");
  const db = ninja.cacheDb() as any;
  if (!db || !ninja.openWebNinjaConfigured()) return { skipped: "not configured" };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: paceError } = await db
    .from("openwebninja_api_requests")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider)
    .gte("created_at", since);
  // Before the per-provider migration only the original subscription runs.
  if (paceError) return { skipped: "per-provider budgets not set up" };
  if ((count ?? 0) >= DAILY_PACE) return { skipped: "daily pace reached", usedToday: count };

  const searchKeys = OPENWEBNINJA_AREAS.flatMap((area) =>
    (["buy", "rent"] as const).map((mode) => ({
      area,
      mode,
      key: ninja.areaSearchKey("ID", area.key, mode),
    })),
  );
  const { data: searchRows } = await db
    .from("openwebninja_cache")
    .select("cache_key,payload,expires_at")
    .in(
      "cache_key",
      searchKeys.map((entry) => entry.key),
    );
  const rowByKey = new Map<string, any>((searchRows ?? []).map((row: any) => [row.cache_key, row]));

  // 1. This subscription's most overdue area list.
  const due = searchKeys
    .filter((entry) => (AREA_PROVIDER[entry.area.key] ?? "zillow") === provider)
    .map((entry) => {
      const row = rowByKey.get(entry.key);
      const fetchedAt = row ? Date.parse(row.expires_at) - ninja.CACHE_MS : 0;
      return { ...entry, overdueBy: Date.now() - fetchedAt - AREA_REFRESH_DAYS * 86_400_000 };
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
  const homes = searchKeys.flatMap(
    (entry) => (rowByKey.get(entry.key)?.payload?.homes ?? []) as { id: string }[],
  );
  const ids = [...new Set(homes.map((home) => home.id))];
  const detailKeys = (id: string) => [
    ninja.propertyKey(id),
    JSON.stringify({ v: 2, kind: "property", id }),
    JSON.stringify({ v: 1, kind: "property", id }),
  ];
  const have = new Set<string>();
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    const { data: rows } = await db
      .from("openwebninja_cache")
      .select("cache_key")
      .in("cache_key", chunk.flatMap(detailKeys));
    for (const row of rows ?? []) have.add(JSON.parse(row.cache_key).id);
  }
  const next = ids.find((id) => !have.has(id));
  if (!next) return { done: true, homes: ids.length };
  const detail = await ninja.propertyDetails(next, null, { provider });
  return { detailed: next, ok: detail.ok, remaining: ids.length - have.size - 1 };
}

/** Refresh all statewide geographic feeds on the weekly provider schedule. */
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
