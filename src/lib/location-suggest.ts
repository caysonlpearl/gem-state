import data from "@/config/location-places.json";
import { marketplaceCities, classifiedCoordinatesForCity } from "@/config/classifieds";
import { parseLocationSearch } from "./location-search";

export type LocationSuggestion = { value: string; label: string };

const zips = (data as { zips: [string, string, string][] }).zips;
/** Resolve known city/ZIP centers locally; no geocoding request or guessed pin. */
export function locationMapPoint(value: string) {
  const parsed = parseLocationSearch(value);
  const postal = parsed.postalCode
    ? zips.find(([zip]) => zip === parsed.postalCode?.slice(0, 5))
    : undefined;
  const city = parsed.city || postal?.[1];
  const state = parsed.state || postal?.[2];
  const center = classifiedCoordinatesForCity(city, state);
  return center ? { latitude: center[0], longitude: center[1], city } : undefined;
}
const featured = new Set<string>(marketplaceCities);
const cities = Array.from(
  new Map(zips.map(([, city, state]) => [`${city}|${state}`, { city, state }])).values(),
).sort(
  (a, b) =>
    Number(featured.has(b.city)) - Number(featured.has(a.city)) ||
    Number(b.state === "ID") - Number(a.state === "ID") ||
    a.city.localeCompare(b.city),
);

/** City or ZIP suggestions for anything typed into a location box. */
export function suggestLocations(query: string, limit = 10): LocationSuggestion[] {
  const q = query.trim().toLowerCase().replace(/,.*$/, "");
  if (!q) return marketplaceCities.slice(0, limit).map((city) => ({ value: city, label: city }));
  if (/^\d+$/.test(q))
    return zips
      .filter(([zip]) => zip.startsWith(q))
      .sort((a, b) => Number(b[2] === "ID") - Number(a[2] === "ID") || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([zip, city, state]) => ({ value: zip, label: `${zip} — ${city}, ${state}` }));
  const starts = cities.filter((c) => c.city.toLowerCase().startsWith(q));
  const contains = cities.filter(
    (c) => !c.city.toLowerCase().startsWith(q) && c.city.toLowerCase().includes(q),
  );
  return [...starts, ...contains]
    .slice(0, limit)
    .map(({ city, state }) => ({ value: city, label: `${city}, ${state}` }));
}
