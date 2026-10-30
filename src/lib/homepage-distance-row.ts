type LocatedCard = {
  id: string;
  city: string;
  state: string;
  externalMerchandise?: unknown;
};

/** Statewide browsing has no distance origin. Offer a spread of Idaho cities;
 * after a local area is selected, offer Idaho listings outside that area. */
export function homepageDistanceRow<T extends LocatedCard>(
  cards: T[],
  hasLocalArea: boolean,
  matchesLocation: (card: T) => boolean,
  shownIds: ReadonlySet<string>,
) {
  const seenIds = new Set(shownIds);
  const cities = new Set<string>();
  const firstInCity: T[] = [];
  const remaining: T[] = [];
  for (const card of cards) {
    if (
      card.state !== "ID" ||
      !card.city.trim() ||
      card.externalMerchandise ||
      seenIds.has(card.id) ||
      (hasLocalArea && matchesLocation(card))
    )
      continue;
    seenIds.add(card.id);
    const city = card.city.trim().toLowerCase();
    if (cities.has(city)) remaining.push(card);
    else {
      cities.add(city);
      firstInCity.push(card);
    }
  }
  return {
    title: hasLocalArea ? "Farther away" : "Around Idaho",
    action: "Browse all Idaho listings",
    // A wider destination must not inherit the city/ZIP/radius it expands.
    search: { allCategories: true, state: "ID" },
    listings: [...firstInCity, ...remaining],
  };
}
