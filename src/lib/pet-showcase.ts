import type { ListingCardSummary } from "./listing-card-summary";

/** Keep newest order within each available species, without inventing variety. */
export function varietyOfPets<T extends ListingCardSummary>(cards: readonly T[], count: number): T[] {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const groups = new Map<string, T[]>();
  for (const card of unique) {
    const key = card.pet?.species?.toLowerCase() ?? card.pet?.subcategory ?? "other";
    const group = groups.get(key) ?? [];
    group.push(card);
    groups.set(key, group);
  }
  const selected: T[] = [];
  for (let index = 0; index < unique.length && selected.length < count; index++) {
    for (const group of groups.values()) {
      const card = group[index];
      if (card && selected.length < count) selected.push(card);
    }
  }
  return selected;
}