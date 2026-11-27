import { classifiedCategories } from "../config/classifieds.ts";
import type { ListingCardSummary } from "./listing-card-summary.ts";

const dedicatedCategories = new Set(["jobs", "services", "pets", "other-real-estate"]);
export const homepageOnlineRows = [
  {
    category: "outdoor-sporting",
    title: "Outdoor gear available online",
    action: "Browse outdoor gear",
  },
  {
    category: "apparel-accessories",
    title: "Apparel available online",
    action: "Browse apparel",
  },
  {
    category: "tools-equipment",
    title: "Tools and supplies available online",
    action: "Browse tools and supplies",
  },
] as const;
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
    // Older dealer imports store trucks and tractors under Industrial with
    // this subtype rather than supplying the normalized vehicle object.
    !(
      listing.categorySlug === "industrial" &&
      listing.itemDetails?.itemType === "Heavy Equipment/Tractors"
    ) &&
    !listing.externalMerchandise
  );
}

const completeVehicleCategories = new Set([
  "cars-trucks",
  "motorcycles",
  "rvs-campers",
  "powersports",
  "trailers",
]);

/** Parts belong in Motors browsing, but never in rows offering whole vehicles. */
export function isHomepageVehicleListing(listing: ListingCardSummary): boolean {
  return completeVehicleCategories.has(listing.categorySlug ?? "") && !listing.externalMerchandise;
}
