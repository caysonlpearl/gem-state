import type { ListingCardSummary } from "./listing-card-summary";

type DiscoveryCard = Pick<ListingCardSummary, "id" | "title"> &
  Partial<
    Pick<
      ListingCardSummary,
      | "state"
      | "categorySlug"
      | "discoverySellerKey"
      | "dealer"
      | "pet"
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

/** Unknown ownership gets one discovery budget, not a fresh fairness bonus
 * for every vehicle. This is a selection cohort, never an asserted owner. */
export function discoveryExposureKey(card: DiscoveryCard): string {
  const seller = discoverySellerKey(card);
  return seller.startsWith("listing:") ? `unidentified:${card.categorySlug ?? "unknown"}` : seller;
}

/** Idaho first, then round-robin known sellers. Caller ordering breaks ties and
 * is restored for display, preserving price/date intent within the chosen mix.
 * Shared counts balance exposure across consecutive rows without random churn. */
export function selectDiscoveryCards<T extends DiscoveryCard>(
  cards: readonly T[],
  count: number,
  sellerCounts = new Map<string, number>(),
  seenIds?: ReadonlySet<string>,
): T[] {
  let unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  if (seenIds?.size) {
    const fresh = unique.filter((card) => !seenIds.has(card.id));
    if (!fresh.length) return [];
    const tier = (card: T) => `${normalized(card.state) === "id"}:${discoverySellerKey(card)}`;
    const freshSellers = new Set(fresh.map(tier));
    // Reuse only a known seller who would otherwise disappear from this local
    // mix. A seller with unseen matching stock always supplies an unseen card.
    unique = unique.filter(
      (card) =>
        !seenIds.has(card.id) ||
        (!discoverySellerKey(card).startsWith("listing:") && !freshSellers.has(tier(card))),
    );
  }
  const indices = new Map(unique.map((card, index) => [card.id, index]));
  const selected: T[] = [];
  const rowCounts = new Map<string, number>();
  for (const local of [true, false]) {
    const groups = new Map<string, T[]>();
    for (const card of unique) {
      if ((normalized(card.state) === "id") !== local) continue;
      const key = discoveryExposureKey(card);
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
  if (count > 1 && unique.length && unique.every((card) => card.pet)) {
    const species = (card: T) => card.pet?.subcategory ?? "other";
    const available = [...new Set(unique.map(species))];
    for (const kind of available) {
      if (selected.some((card) => species(card) === kind)) continue;
      const speciesCounts = new Map<string, number>();
      for (const card of selected)
        speciesCounts.set(species(card), (speciesCounts.get(species(card)) ?? 0) + 1);
      const candidates = unique
        .filter((card) => species(card) === kind && !selected.some((pick) => pick.id === card.id))
        .sort(
          (a, b) =>
            Number(normalized(b.state) === "id") - Number(normalized(a.state) === "id") ||
            Number(selected.some((pick) => discoverySellerKey(pick) === discoverySellerKey(a))) -
              Number(selected.some((pick) => discoverySellerKey(pick) === discoverySellerKey(b))),
        );
      const replacement = candidates[0];
      if (!replacement) continue;
      const localCount = selected.filter((card) => normalized(card.state) === "id").length;
      const removable = selected
        .filter(
          (card) =>
            (speciesCounts.get(species(card)) ?? 0) > 1 &&
            !(
              selected.some(
                (pick) => discoverySellerKey(pick) === discoverySellerKey(replacement),
              ) &&
              discoverySellerKey(card) !== discoverySellerKey(replacement) &&
              selected.filter((pick) => discoverySellerKey(pick) === discoverySellerKey(card))
                .length === 1
            ) &&
            !(
              localCount === 1 &&
              normalized(card.state) === "id" &&
              normalized(replacement.state) !== "id"
            ),
        )
        .sort(
          (a, b) =>
            Number(discoverySellerKey(b) === discoverySellerKey(replacement)) -
              Number(discoverySellerKey(a) === discoverySellerKey(replacement)) ||
            Number(normalized(a.state) === "id") - Number(normalized(b.state) === "id") ||
            (sellerCounts.get(discoveryExposureKey(b)) ?? 0) -
              (sellerCounts.get(discoveryExposureKey(a)) ?? 0),
        );
      const previous = removable[0];
      if (!previous) continue;
      selected[selected.indexOf(previous)] = replacement;
      const oldKey = discoveryExposureKey(previous),
        newKey = discoveryExposureKey(replacement);
      sellerCounts.set(oldKey, (sellerCounts.get(oldKey) ?? 1) - 1);
      sellerCounts.set(newKey, (sellerCounts.get(newKey) ?? 0) + 1);
    }
  }
  return selected.sort(
    (a, b) =>
      Number(normalized(b.state) === "id") - Number(normalized(a.state) === "id") ||
      indices.get(a.id)! - indices.get(b.id)! ||
      a.id.localeCompare(b.id),
  );
}
