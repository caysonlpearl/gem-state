import { classifiedCategories, idahoCities, idahoRegions } from "@/config/classifieds";

/**
 * URL shapes for the search landing pages:
 *   /idaho/{city | region | category}
 *   /idaho/{city | region}/{category}
 * Shared by the routes, the sitemap and every link that points at them.
 */

export function placeSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// "other-real-estate" is the internal slug; people search for homes.
const CATEGORY_URL_ALIASES: Record<string, string> = { "other-real-estate": "homes" };

export function categoryUrlSlug(slug: string) {
  return CATEGORY_URL_ALIASES[slug] ?? slug;
}

export function categoryFromUrlSlug(urlSlug: string) {
  const internal =
    Object.entries(CATEGORY_URL_ALIASES).find(([, alias]) => alias === urlSlug)?.[0] ?? urlSlug;
  return classifiedCategories.find((category) => category.slug === internal) ?? null;
}

export type ResolvedPlace = { kind: "city"; name: string } | { kind: "region"; name: string };

export function placeFromSlug(slug: string): ResolvedPlace | null {
  const city = idahoCities.find((name) => placeSlug(name) === slug);
  if (city) return { kind: "city", name: city };
  const region = idahoRegions.find((name) => placeSlug(name) === slug);
  if (region) return { kind: "region", name: region };
  return null;
}

export function placePath(place: string, categorySlug?: string) {
  const base = `/idaho/${placeSlug(place)}`;
  return categorySlug ? `${base}/${categoryUrlSlug(categorySlug)}` : base;
}

export function categoryPagePath(categorySlug: string) {
  return `/idaho/${categoryUrlSlug(categorySlug)}`;
}

/** The closest landing page for a listing: its city and category, else its category statewide. */
export function nearbyPagePath(
  categorySlug: string | null | undefined,
  city: string | null | undefined,
) {
  if (!categorySlug) return "/browse";
  const knownCity = idahoCities.find((name) => name === city);
  return knownCity ? placePath(knownCity, categorySlug) : categoryPagePath(categorySlug);
}

/** How a category reads in a sentence and a heading. */
export function categoryPhrase(slug: string, name: string) {
  if (slug === "jobs") return { noun: "jobs", heading: "Jobs" };
  if (slug === "services") return { noun: "local services", heading: "Local services" };
  if (slug === "other-real-estate") return { noun: "homes for sale and rent", heading: "Homes" };
  if (slug === "pets") return { noun: "pets", heading: "Pets" };
  return { noun: name.toLowerCase(), heading: name };
}

/** A page is only offered to search engines once it's worth landing on. */
export const PLACE_PAGE_MIN_LISTINGS = 5;
export const PLACE_PAGE_FRESH_DAYS = 30;
