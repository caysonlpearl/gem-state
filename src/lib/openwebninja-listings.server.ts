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
import { searchHomesArea } from "./openwebninja.server";

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
      new Map(responses.flatMap((response) => response.homes).map((home) => [home.id, home])).values(),
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
  const details = await propertyDetails(home.id, home.sourceUrl);
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
