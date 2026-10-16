import type {
  ClassifiedBrowseInput,
  ClassifiedCard,
  ClassifiedDetail,
} from "./classifieds.functions";
import { isWithinClassifiedRadius, usStates } from "../config/classifieds.ts";
import {
  canIncludeMashvisorFilters,
  listedAt,
  MASHVISOR_ID,
  type MashvisorHome,
} from "./mashvisor-contract";

/**
 * Cities fetched from Mashvisor. Only these are ever requested (one call
 * each, cached two weeks). Other searches show Bluebird listings only.
 */
export const MASHVISOR_CITIES = ["Boise", "Meridian", "Nampa", "Idaho Falls", "Coeur d'Alene"];

// Keep the connector and cached responses available for rollback, but do not
// expose Mashvisor homes in public browse pages or related-listing rails.
// OpenWeb Ninja is the active external homes feed.
const MASHVISOR_PUBLIC_FEED_ENABLED = false;

export function canIncludeMashvisor(data: ClassifiedBrowseInput) {
  if (!MASHVISOR_PUBLIC_FEED_ENABLED) return false;
  if (data.includeAllMocks || data.sellerSlug || data.dealerSlug || data.group) return false;
  return canIncludeMashvisorFilters(data as Record<string, unknown>);
}

export function mashvisorCity(data: ClassifiedBrowseInput) {
  const state = usStates.find(([code, name]) => code === data.state || name === data.state);
  if (state && state[0] !== "ID") return null;
  if (!data.city) return "Boise";
  return MASHVISOR_CITIES.find((city) => city.toLowerCase() === data.city!.toLowerCase()) ?? null;
}

export function mashvisorCard(home: MashvisorHome): ClassifiedCard {
  return {
    id: `mashvisor-${home.id}`,
    productId: `mashvisor-${home.id}`,
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
    isFeatured: false,
    imageUrl: home.imageUrl,
    vehicle: null,
    externalHome: { source: "Mashvisor" },
    home: {
      mode: "buy",
      propertyType: home.propertyType ?? "Home",
      bedrooms: home.beds,
      bathrooms: home.baths,
      squareFeet: home.sqft,
    },
  };
}

export async function mashvisorCards(data: ClassifiedBrowseInput): Promise<ClassifiedCard[]> {
  const city = mashvisorCity(data);
  if (!city) return [];
  const { searchHomesForSale } = await import("./mashvisor.server");
  const result = await searchHomesForSale("ID", city);
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
    .map(mashvisorCard);
}

/** A Mashvisor home's page, from the cached city search that showed it. */
export async function mashvisorDetail(listingId: string): Promise<ClassifiedDetail | null> {
  const id = listingId.match(MASHVISOR_ID)?.[1];
  if (!id) return null;
  const { cachedHome, propertyDetails } = await import("./mashvisor.server");
  const found = await cachedHome(id);
  if (!found?.home) return null;
  const home = found.home;
  const details = await propertyDetails(home.state, home.id);
  const extra = details.ok ? details.value : null;
  const card = mashvisorCard(home);
  const images = extra?.images.length ? extra.images : home.imageUrl ? [home.imageUrl] : [];
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
    externalHome: { source: "Mashvisor", sourceUrl: extra?.url ?? null },
    listingNumber: found.home.id,
    description: extra?.description ?? null,
    postalCode: found.home.zip,
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
    },
    images: images.map((url) => ({ url, alt: card.title })),
  } as unknown as ClassifiedDetail;
}
