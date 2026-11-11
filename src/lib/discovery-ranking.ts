import type { ListingCardSummary } from "./listing-card-summary";

type DiscoveryCard = Pick<ListingCardSummary, "id" | "title"> &
  Partial<
    Pick<
      ListingCardSummary,
      | "state"
      | "discoverySellerKey"
      | "dealer"
      | "job"
      | "directory"
      | "externalPet"
      | "externalMerchandise"
      | "externalHome"
    >
  >;

/** Opaque grouping token; public cards never need the seller's account ID. */
export function discoverySellerToken(namespace: string, identity: string): string {
  let hash = 14695981039346656037n;
  for (const character of identity) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `${namespace}:${hash.toString(16).padStart(16, "0")}`;
}
const normalized = (value: string | null | undefined) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
function host(value: string | null | undefined) {
  try {
    return new URL(value!).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function discoverySellerKey(card: DiscoveryCard): string {
  if (card.dealer) {
    const identity =
      host(card.dealer.website) ||
      normalized(card.dealer.slug) ||
      normalized(card.dealer.displayName);
    if (identity) return `dealer:${identity}:${normalized(card.dealer.city)}`;
  }
  if (card.job?.employerName) return `employer:${normalized(card.job.employerName)}`;
  if (card.directory) return `business:${host(card.directory.website)}:${normalized(card.title)}`;
  if (card.externalPet?.orgName) return `rescue:${normalized(card.externalPet.orgName)}`;
  if (card.externalHome?.listedBy) {
    const agent = card.externalHome.listedBy;
    const name = normalized(agent.agentName) || normalized(agent.brokerName);
    if (name) return `agent:${name}`;
  }
  if (card.discoverySellerKey) return card.discoverySellerKey;
  if (card.externalMerchandise) return `retailer:${normalized(card.externalMerchandise.source)}`;
  // Unknown sellers are independent; neither a provider nor a whole city is a seller.
  return `listing:${card.id}`;
}

/** Idaho first, then round-robin known sellers. Caller ordering breaks ties and
 * is restored for display, preserving price/date intent within the chosen mix.
 * Shared counts balance exposure across consecutive rows without random churn. */
export function selectDiscoveryCards<T extends DiscoveryCard>(
  cards: readonly T[],
  count: number,
  sellerCounts = new Map<string, number>(),
): T[] {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const indices = new Map(unique.map((card, index) => [card.id, index]));
  const selected: T[] = [];
  const rowCounts = new Map<string, number>();
  for (const local of [true, false]) {
    const groups = new Map<string, T[]>();
    for (const card of unique) {
      if ((normalized(card.state) === "id") !== local) continue;
      const key = discoverySellerKey(card);
      const group = groups.get(key) ?? [];
      group.push(card);
      groups.set(key, group);
    }
    while (selected.length < count) {
      let winner: string | undefined;
      for (const [key, queue] of groups) {
        if (!queue.length) continue;
        if (
          winner === undefined ||
          (rowCounts.get(key) ?? 0) < (rowCounts.get(winner) ?? 0) ||
          ((rowCounts.get(key) ?? 0) === (rowCounts.get(winner) ?? 0) &&
            (sellerCounts.get(key) ?? 0) < (sellerCounts.get(winner) ?? 0))
        )
          winner = key;
      }
      if (winner === undefined) break;
      selected.push(groups.get(winner)!.shift()!);
      rowCounts.set(winner, (rowCounts.get(winner) ?? 0) + 1);
      sellerCounts.set(winner, (sellerCounts.get(winner) ?? 0) + 1);
    }
  }
  return selected.sort(
    (a, b) =>
      Number(normalized(b.state) === "id") - Number(normalized(a.state) === "id") ||
      indices.get(a.id)! - indices.get(b.id)! ||
      a.id.localeCompare(b.id),
  );
}
