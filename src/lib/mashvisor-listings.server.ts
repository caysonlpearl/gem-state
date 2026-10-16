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
 * Cities fetched from Mashvisor. The free plan allows 30 requests a month,
 * so only these are ever requested (one call each, cached a week). Other
 * searches show Bluebird listings only.
 */
export const MASHVISOR_CITIES = ["Boise", "Meridian", "Nampa", "Idaho Falls", "Coeur d'Alene"];

export function canIncludeMashvisor(data: ClassifiedBrowseInput) {
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
        (!q || `${home.address} ${home.city} ${home.propertyType ?? ""}`.toLowerCase().includes(q)) &&
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
  const { cachedHome } = await import("./mashvisor.server");
  const found = await cachedHome(id);
  if (!found?.home) return null;
  const card = mashvisorCard(found.home);
  return {
    ...card,
    listingNumber: found.home.id,
    description: null,
    postalCode: found.home.zip,
    expiresAt: null,
    sellerNote: null,
    variantId: card.id,
    seller: null,
    images: found.home.imageUrl ? [{ url: found.home.imageUrl, alt: card.title }] : [],
  } as unknown as ClassifiedDetail;
}
