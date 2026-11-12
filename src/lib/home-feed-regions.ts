import { findIdahoPlace, idahoPlaces } from "../config/idaho-places.ts";
import type { OpenWebNinjaHome } from "./openwebninja-contract.ts";

export type HomeProvider = "zillow" | "realestate" | "redfin";
export const HOME_FEED_REGIONS = [
  {
    key: "treasure-valley",
    label: "Treasure Valley",
    provider: "zillow",
    markets: ["Treasure Valley"],
    latitude: 43.615,
    longitude: -116.202,
    diameterMiles: 75,
    bounds: { south: 42.7, west: -117.5, north: 44.4, east: -115.4 },
    salePages: 2,
  },
  {
    key: "eastern-idaho",
    label: "Eastern Idaho",
    provider: "realestate",
    markets: ["Eastern Idaho", "Southeast Idaho"],
    latitude: 43.25,
    longitude: -112.15,
    diameterMiles: 100,
    bounds: { south: 41.95, west: -113.5, north: 44.7, east: -110.9 },
    salePages: 2,
  },
  {
    key: "north-idaho",
    label: "North Idaho",
    provider: "redfin",
    markets: ["North Idaho"],
    latitude: 47.9,
    longitude: -116.65,
    diameterMiles: 150,
    bounds: { south: 47.0, west: -117.2, north: 49.1, east: -115.1 },
    salePages: 1,
  },
] as const;

/** One deterministic owner, independent of which provider returned a home.
 * Known Idaho cities use Bluebird's county-based region taxonomy. Coordinates
 * can resolve an unknown locality, but never assign an out-of-state property. */
export function homeFeedRegion(
  home: Pick<OpenWebNinjaHome, "city" | "state" | "latitude" | "longitude">,
) {
  if (home.state.toUpperCase() !== "ID") return null;
  let market = findIdahoPlace(home.city)?.[1];
  if (!market && home.latitude != null && home.longitude != null) {
    const distance = (p: readonly [string, string, number, number]) => {
      const dy = (p[2] - home.latitude!) * 69;
      const dx = (p[3] - home.longitude!) * 69 * Math.cos((home.latitude! * Math.PI) / 180);
      return Math.hypot(dx, dy);
    };
    const nearest = [...idahoPlaces].sort((a, b) => distance(a) - distance(b))[0];
    if (nearest && distance(nearest) <= 40) market = nearest[1];
  }
  return (
    HOME_FEED_REGIONS.find((region) =>
      (region.markets as readonly string[]).includes(market ?? ""),
    ) ?? null
  );
}

export function homeInRegionalFeed(home: OpenWebNinjaHome) {
  const region = homeFeedRegion(home);
  if (!region) return false;
  if (home.provider) return home.provider === region.provider;
  // Unexpired legacy numeric-ID records may be reused during the migration.
  return !home.id.startsWith("redfin-") || region.provider === "redfin";
}

/** Preserve unit numbers; normalize common street spellings for migration and
 * overlapping sale/rental records, even when source property IDs differ. */
export function homeAddressIdentity(home: Pick<OpenWebNinjaHome, "address" | "city" | "state">) {
  const clean = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9# -]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const address = clean(home.address)
    .replace(/(?:\b(?:APT|APARTMENT|SUITE|STE)\s*#?|#)\s*/g, "UNIT ")
    .replace(
      /\b(STREET|ROAD|DRIVE|AVENUE|BOULEVARD|LANE|COURT|NORTH|SOUTH|EAST|WEST)\b/g,
      (word) =>
        ({
          STREET: "ST",
          ROAD: "RD",
          DRIVE: "DR",
          AVENUE: "AVE",
          BOULEVARD: "BLVD",
          LANE: "LN",
          COURT: "CT",
          NORTH: "N",
          SOUTH: "S",
          EAST: "E",
          WEST: "W",
        })[word]!,
    )
    .replace(/\s+/g, " ");
  return `${clean(home.state)}|${clean(home.city)}|${address}`;
}

/** Protect future weekly inventory refreshes before spending on details.
 * Multiple failed attempts at the same search within a week count as one
 * refresh slot, so failures cannot consume the reserve for later weeks. */
export function homeSearchReserve(
  region: (typeof HOME_FEED_REGIONS)[number],
  requests: { cache_key: string; created_at?: string }[],
  keys: Set<string>,
  now = Date.now(),
) {
  const weekly = 7 * 86_400_000;
  let completedSlots = 0;
  for (const key of keys) {
    const times = requests
      .filter((row) => row.cache_key === key)
      .map((row) => Date.parse(row.created_at ?? "") || now)
      .sort((a, b) => b - a);
    let newest = Infinity;
    for (const time of times)
      if (newest - time >= weekly) {
        completedSlots++;
        newest = time;
      }
  }
  return Math.max(0, Math.ceil(31 / 7) * (region.salePages + 1) - completedSlots);
}

export function homeFeedCapacity({
  days = 31,
  refreshDays = 7,
  modes = 2,
  callsPerProvider = 100,
  usableRate = 0.9,
} = {}) {
  const cycles = Math.ceil(days / refreshDays);
  const regions = HOME_FEED_REGIONS.map((region) => {
    const searchCalls = cycles * (region.salePages + (modes === 2 ? 1 : 0));
    return {
      region: region.label,
      provider: region.provider,
      searchCalls,
      detailCalls: Math.max(0, callsPerProvider - searchCalls),
    };
  });
  const totalSearchCalls = regions.reduce((sum, region) => sum + region.searchCalls, 0);
  const totalDetailCalls = regions.reduce((sum, region) => sum + region.detailCalls, 0);
  return {
    providers: HOME_FEED_REGIONS.length,
    regions,
    totalSearchCalls,
    totalDetailCalls,
    estimatedUsableHomes: Math.floor(totalDetailCalls * usableRate),
  };
}
