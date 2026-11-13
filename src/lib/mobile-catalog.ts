import type { ListingCardSummary } from "./listing-card-summary";
import { mobileListingAllowed } from "./mobile-contract.ts";
type Filters = {
  q?: string;
  category?: string;
  city?: string;
  state?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: string;
  page?: number;
};
/** Match the website's existing snapshot freshness ceiling. This is a bounded
 * fallback, not a claim that all matching marketplace inventory was searched. */
export function mobileCachedBrowse(
  snapshot: {
    sections: Record<string, { cards: ListingCardSummary[]; updatedAt: number } | undefined>;
  },
  filters: Filters,
  now = Date.now(),
) {
  const cards = Object.values(snapshot.sections)
    .filter((section) => section && now - section.updatedAt <= 6 * 3600000)
    .flatMap((section) => section!.cards);
  const query = filters.q?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const matches = [...new Map(cards.map((c) => [c.id, c])).values()].filter(
    (card) =>
      mobileListingAllowed(card) &&
      (!card.externalHome?.cacheExpiresAt || Date.parse(card.externalHome.cacheExpiresAt) > now) &&
      (!filters.category || card.categorySlug === filters.category) &&
      (!filters.city || String(card.city).toLowerCase() === filters.city.toLowerCase()) &&
      (!filters.state || String(card.state).toLowerCase() === filters.state.toLowerCase()) &&
      (filters.priceMin == null || card.priceCents >= filters.priceMin * 100) &&
      (filters.priceMax == null || card.priceCents <= filters.priceMax * 100) &&
      query.every((term) => String(card.title).toLowerCase().includes(term)),
  );
  matches.sort(
    (a, b) =>
      (filters.sort === "price_low"
        ? a.priceCents - b.priceCents
        : filters.sort === "price_high"
          ? b.priceCents - a.priceCents
          : filters.sort === "mileage_low"
            ? (a.vehicle?.mileage ?? Infinity) - (b.vehicle?.mileage ?? Infinity)
            : Date.parse(b.createdAt) - Date.parse(a.createdAt)) ||
      String(a.id).localeCompare(String(b.id)),
  );
  const page = filters.page ?? 1,
    pageSize = 24;
  return {
    listings: matches.slice((page - 1) * pageSize, page * pageSize),
    total: matches.length,
    page,
    pageSize,
    incomplete: true,
  };
}
