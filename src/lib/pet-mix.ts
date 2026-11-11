/** Round-robins pet listings by species so mixed rows aren't all cats. */
export function mixPetSpecies<T extends { pet?: { subcategory?: string | null } | null }>(
  listings: readonly T[],
): T[] {
  if (!listings.some((listing) => listing.pet)) return [...listings];
  const groups = new Map<string, T[]>();
  for (const listing of listings) {
    const key = listing.pet?.subcategory ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  }
  const queues = [...groups.values()];
  const mixed: T[] = [];
  while (mixed.length < listings.length)
    for (const queue of queues) {
      const next = queue.shift();
      if (next) mixed.push(next);
    }
  return mixed;
}

