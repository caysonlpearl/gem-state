import { classifiedCategories } from "../config/classifieds.ts";
import type { ListingCardSummary } from "./listing-card-summary.ts";

const dedicatedCategories = new Set(["jobs", "services", "pets", "other-real-estate"]);
const itemCategories = new Set<string>(
  classifiedCategories
    .filter(
      (category) => category.group === "classifieds" && !dedicatedCategories.has(category.slug),
    )
    .map((category) => category.slug),
);

/** General-item rows must not consume cards belonging to a dedicated vertical,
 * including older cards whose structured details have not been populated. */
export function isGeneralHomepageListing(listing: ListingCardSummary): boolean {
  return (
    itemCategories.has(listing.categorySlug ?? "") &&
    !listing.vehicle &&
    !listing.home &&
    !listing.job &&
    !listing.service &&
    !listing.pet &&
    !listing.externalMerchandise
  );
}
