type WeeklyTopCandidate = {
  id: string;
  categorySlug?: string | null;
};

export function getUtcWeekKey(date = new Date()) {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

function hashWeeklyValue(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Selects one stable, category-diverse group for the current UTC week.
 * The order changes automatically each Monday without storing fake activity.
 */
export function selectWeeklyTopTen<T extends WeeklyTopCandidate>(
  candidates: T[],
  date = new Date(),
  limit = 10,
) {
  const weekKey = getUtcWeekKey(date);
  const random = createSeededRandom(hashWeeklyValue(weekKey));
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const categoryCounts = new Map<string, number>();

  const addWithCategoryLimit = (categoryLimit: number) => {
    for (const product of shuffled) {
      if (selected.length >= limit) break;
      if (selectedIds.has(product.id)) continue;

      const category = product.categorySlug || "other";
      if ((categoryCounts.get(category) ?? 0) >= categoryLimit) continue;

      selected.push(product);
      selectedIds.add(product.id);
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  };

  addWithCategoryLimit(1);
  addWithCategoryLimit(2);

  for (const product of shuffled) {
    if (selected.length >= limit) break;
    if (selectedIds.has(product.id)) continue;
    selected.push(product);
    selectedIds.add(product.id);
  }

  return selected;
}
