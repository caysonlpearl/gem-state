import type { ListingCardSummary } from "./listing-card-summary";

const homeTypeIs = (listing: ListingCardSummary, pattern: RegExp) =>
  pattern.test(listing.home?.propertyType ?? "");

/** What qualifies a home for each homes-landing row. Rows not listed here
 * (like price drops, which the listing data can't show yet) stay hidden. */
export const homeRowFilters: Record<string, (listing: ListingCardSummary) => boolean> = {
  "Featured homes for sale": (l) => l.isFeatured && l.home?.mode === "buy",
  "Starter homes": (l) => l.home?.mode === "buy" && l.priceCents > 0 && l.priceCents <= 40_000_000,
  "Condos & townhomes": (l) => l.home?.mode === "buy" && homeTypeIs(l, /condo|town/i),
  "Homes with space to grow": (l) =>
    l.home?.mode === "buy" && ((l.home.bedrooms ?? 0) >= 4 || (l.home.squareFeet ?? 0) >= 2500),
  "New builds to explore": (l) => l.home?.mode === "build",
  "New build communities": (l) => l.home?.mode === "build" && Boolean(l.home.community),
  "Rentals worth a look": (l) => l.home?.mode === "rent",
  "Pet-friendly rentals": (l) =>
    l.home?.mode === "rent" && /allowed|yes|cats?|dogs?|friendly/i.test(l.home.pets ?? ""),
  "Apartments under $1,800": (l) =>
    l.home?.mode === "rent" && homeTypeIs(l, /apartment|condo/i) && l.priceCents <= 180_000,
  "Rentals with room to spread out": (l) => l.home?.mode === "rent" && (l.home.bedrooms ?? 0) >= 3,
  "Short-term & flexible stays": (l) =>
    l.home?.mode === "rent" && /month-to-month|short/i.test(l.home.leaseLength ?? ""),
};
