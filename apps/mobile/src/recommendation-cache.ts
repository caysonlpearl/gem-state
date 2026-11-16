export type RecommendationOwner = { actor: string; policy: string; historyAfter: string };
type Rows<T> = { recent: T[]; continuing: T[]; recommended: T[]; vehicles?: T[]; model: string };
const KEY = "bluebird-personalized-feed-v1";
const TTL = 15 * 60_000;

/** One device snapshot of public recommendation cards, never browsing history.
 * Callers must supply a freshly confirmed permission/history boundary to read it. */
export function createRecommendationCache<T>(
  isCard: (value: unknown) => value is T,
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> = () => localStorage,
  clock = Date.now,
) {
  const clear = () => {
    try {
      storage().removeItem(KEY);
    } catch {
      /* optional cache */
    }
  };
  const validOwner = (owner: RecommendationOwner) =>
    Boolean(owner.actor && owner.policy && Number.isFinite(Date.parse(owner.historyAfter)));
  const read = (owner: RecommendationOwner): Rows<T> | null => {
    if (!validOwner(owner)) return null;
    try {
      const raw = storage().getItem(KEY);
      if (!raw) return null;
      if (raw.length > 256_000) {
        clear();
        return null;
      }
      const value = JSON.parse(raw);
      if (
        value.actor !== owner.actor ||
        value.policy !== owner.policy ||
        value.historyAfter !== owner.historyAfter ||
        !Number.isFinite(value.savedAt) ||
        clock() < value.savedAt ||
        clock() - value.savedAt > TTL ||
        typeof value.model !== "string" ||
        value.model.length > 300 ||
        !Array.isArray(value.recommended) ||
        value.recommended.length > 8 ||
        !Array.isArray(value.vehicles) ||
        value.vehicles.length > 8 ||
        ![...value.recommended, ...value.vehicles].every(isCard)
      ) {
        clear();
        return null;
      }
      return {
        recent: [],
        continuing: [],
        recommended: value.recommended,
        vehicles: value.vehicles,
        model: value.model,
      };
    } catch {
      clear();
      return null;
    }
  };
  const write = (owner: RecommendationOwner, rows: Rows<T>) => {
    if (!validOwner(owner)) return;
    if (!rows.recommended.length) {
      clear();
      return;
    }
    try {
      const value = JSON.stringify({
        ...owner,
        savedAt: clock(),
        model: rows.model,
        recommended: rows.recommended.filter(isCard).slice(0, 8),
        vehicles: (rows.vehicles ?? []).filter(isCard).slice(0, 8),
      });
      if (value.length <= 256_000) storage().setItem(KEY, value);
      else clear();
    } catch {
      /* A full or disabled cache must not block live recommendations. */
    }
  };
  return { read, write, clear };
}
