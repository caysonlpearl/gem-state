export type DealerVisibility = "visible" | "hidden" | "sold";
export function dealerInventoryVisibilityLabel(
  visibility: DealerVisibility | undefined,
  feedStatus: string,
) {
  if (visibility === "hidden") return "Hidden by dealership";
  if (visibility === "sold") return "Marked sold by dealership";
  if (feedStatus === "sold") return "Sold in inventory feed";
  if (feedStatus === "active") return "Available";
  return feedStatus === "invalid" ? "Needs review" : feedStatus;
}

/** Discard cached dealer cards only after checking current holds; do not refresh providers. */
export async function filterDealerHomepageHolds<
  T extends {
    sections: Record<
      string,
      | {
          cards: { id: string; dealer?: unknown; categorySlug?: string | null }[];
          total?: number;
          categoryCounts?: Record<string, number>;
        }
      | undefined
    >;
  },
>(snapshot: T, read: (ids: string[]) => Promise<string[]>) {
  const ids = [
    ...new Set(
      Object.values(snapshot.sections).flatMap(
        (section) =>
          section?.cards
            .filter((card) => card.id.startsWith("dealerfeed-") || Boolean(card.dealer))
            .map((card) => card.id) ?? [],
      ),
    ),
  ];
  if (!ids.length) return snapshot;
  const blocked = new Set<string>();
  try {
    for (let offset = 0; offset < ids.length; offset += 500)
      for (const id of await read(ids.slice(offset, offset + 500))) blocked.add(id);
  } catch {
    // Fail closed for dealer candidates rather than re-expose a sold vehicle.
    for (const id of ids) blocked.add(id);
  }
  if (!blocked.size) return snapshot;
  const sections = Object.fromEntries(
    Object.entries(snapshot.sections).map(([key, section]) => {
      if (!section) return [key, section];
      const removed = section.cards.filter((card) => blocked.has(card.id));
      if (!removed.length) return [key, section];
      const cards = section.cards.filter((card) => !blocked.has(card.id));
      const categoryCounts = section.categoryCounts ? { ...section.categoryCounts } : undefined;
      for (const card of removed)
        if (categoryCounts && card.categorySlug && categoryCounts[card.categorySlug] != null)
          categoryCounts[card.categorySlug] = Math.max(0, categoryCounts[card.categorySlug] - 1);
      return [
        key,
        {
          ...section,
          cards,
          ...(section.total == null
            ? {}
            : { total: Math.max(cards.length, section.total - removed.length) }),
          ...(categoryCounts ? { categoryCounts } : {}),
        },
      ];
    }),
  );
  return { ...snapshot, sections } as T;
}
