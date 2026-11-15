import { mobileListingAllowed } from "./mobile-contract.ts";
import { discoverySellerKey } from "./discovery-ranking.ts";
import type { ListingCardSummary } from "./listing-card-summary";

/** The mixed shopping feed sells things; jobs/services keep their own pages. */
export function mobileSaleItem(card: Partial<ListingCardSummary>) {
  return (
    mobileListingAllowed(card) &&
    card.categorySlug !== "jobs" &&
    card.categorySlug !== "services" &&
    !card.job &&
    !card.service &&
    !card.directory
  );
}
export function mobileSaleScope(filters: { category?: string; group?: string }) {
  return !filters.category && !filters.group;
}

/** Stable category rotation before pagination, with permitted recommendation
 * preferences inside the mix. Never adds candidates or changes search filters. */
export function mixMobileSaleFeed<T extends ListingCardSummary>(
  cards: readonly T[],
  preferredIds: readonly string[] = [],
  limit = cards.length,
): T[] {
  const preference = new Map(preferredIds.map((id, i) => [id, i]));
  const indices = new Map(cards.map((card, i) => [card.id, i]));
  const groups = new Map<string, Map<string, T[]>>();
  const unique = [...new Map(cards.filter(mobileSaleItem).map((c) => [c.id, c])).values()];
  const priority = (a: T, b: T) =>
    (preference.get(a.id) ?? Infinity) - (preference.get(b.id) ?? Infinity) ||
    indices.get(a.id)! - indices.get(b.id)!;
  unique.sort(priority);
  for (const card of unique) {
    const category = card.categorySlug!;
    const sellers = groups.get(category) ?? new Map<string, T[]>();
    const seller = discoverySellerKey(card);
    const queue = sellers.get(seller) ?? [];
    queue.push(card);
    sellers.set(seller, queue);
    groups.set(category, sellers);
  }
  const categoryCounts = new Map<string, number>(),
    sellerCounts = new Map<string, number>();
  const result: T[] = [];
  while (groups.size && result.length < limit) {
    const candidates = [...groups.entries()].map(([category, sellers]) => {
      const choices = [...sellers.entries()].map(([seller, queue]) => ({
        seller,
        card: queue[0]!,
      }));
      choices.sort(
        (a, b) =>
          (sellerCounts.get(a.seller) ?? 0) - (sellerCounts.get(b.seller) ?? 0) ||
          priority(a.card, b.card),
      );
      return { category, ...choices[0]! };
    });
    candidates.sort(
      (a, b) =>
        (categoryCounts.get(a.category) ?? 0) - (categoryCounts.get(b.category) ?? 0) ||
        priority(a.card, b.card),
    );
    const { category, seller, card } = candidates[0]!;
    result.push(card);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    sellerCounts.set(seller, (sellerCounts.get(seller) ?? 0) + 1);
    const sellers = groups.get(category)!;
    sellers.get(seller)!.shift();
    if (!sellers.get(seller)!.length) sellers.delete(seller);
    if (!sellers.size) groups.delete(category);
  }
  return result;
}
