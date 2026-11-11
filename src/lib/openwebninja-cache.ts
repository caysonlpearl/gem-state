import type { OpenWebNinjaHome } from "./openwebninja-contract.ts";
import { canonicalHomeCity, dedupeImageUrls } from "./openwebninja-contract.ts";

export type SavedHomeSearch = {
  cache_key: string;
  payload: { homes?: OpenWebNinjaHome[] };
  expires_at: string;
};

/** Read paid-for regional and city searches, newest copy first. Detail rows
 * cannot become inventory and an expired search cannot silently stay live. */
export function homesFromSavedSearches(rows: SavedHomeSearch[], now = Date.now()) {
  const homes = new Map<string, OpenWebNinjaHome>();
  for (const row of [...rows].sort((a, b) => b.expires_at.localeCompare(a.expires_at))) {
    if (!(Date.parse(row.expires_at) > now)) continue;
    let key: { kind?: string; mode?: string };
    try {
      key = JSON.parse(row.cache_key);
    } catch {
      continue;
    }
    if (!["search", "area-search"].includes(key.kind ?? "")) continue;
    if (!["buy", "rent"].includes(key.mode ?? "")) continue;
    if (!Array.isArray(row.payload?.homes)) throw new Error("Saved homes are unavailable.");
    for (const home of row.payload.homes) {
      if (!home || home.mode !== key.mode || !home.id || !home.city || !home.state) continue;
      // The public detail route is keyed by property id, so even a property
      // moving between sale and rent must appear only once, in its newest mode.
      const identity = home.id;
      if (!homes.has(identity))
        homes.set(identity, {
          ...home,
          city: canonicalHomeCity(home.city, home.state),
          cacheExpiresAt: row.expires_at,
        });
    }
  }
  return [...homes.values()];
}

/** A preview is not a publishable home. Count unique photos, not resized
 * variants, and require a description plus meaningful property specifications. */
export function hasCompleteHomeDetails(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const detail = value as Record<string, unknown>;
  const images = Array.isArray(detail.images)
    ? detail.images.filter((image): image is string => typeof image === "string")
    : [];
  const facts = [detail.bedrooms, detail.bathrooms, detail.squareFeet, detail.yearBuilt].filter(
    (fact) => typeof fact === "number" && fact > 0,
  );
  return (
    dedupeImageUrls(images).length >= 2 &&
    typeof detail.description === "string" &&
    detail.description.trim().length > 0 &&
    facts.length >= 2
  );
}
