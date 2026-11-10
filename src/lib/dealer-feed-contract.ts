import { normalizeMarketCheckListing, type MarketCheckListing } from "./marketcheck-contract.ts";

export const DEALER_FEED_ID =
  /^dealerfeed-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type PublishedFeedDealer = {
  slug: string;
  display_name: string;
  website: string;
  phone: string | null;
  address_line1: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  dealer_id?: string | null;
  owner_user_id?: string | null;
  email?: string | null;
  logo_url?: string | null;
  inbox_enabled?: boolean;
};
export type PublishedFeedVehicle = Record<string, unknown> & { id: string; dealer_slug: string };

/** Shared vehicle presentation, with explicit direct-dealer provenance. */
export function publishedFeedVehicle(
  row: PublishedFeedVehicle,
  dealer: PublishedFeedDealer,
): MarketCheckListing | null {
  if (
    !DEALER_FEED_ID.test(`dealerfeed-${row.id}`) ||
    !Number.isFinite(Number(row.price_cents)) ||
    Number(row.price_cents) <= 0
  )
    return null;
  const listing = normalizeMarketCheckListing(
    {
      id: row.id,
      heading: row.title,
      description: row.description,
      price: Number(row.price_cents) / 100,
      vin: row.vin,
      stock_no: row.stock_number,
      miles: row.vehicle_mileage ?? undefined,
      inventory_type: String(row.condition ?? "").toLowerCase(),
      is_certified: /^(true|1|yes)$/i.test(String(row.certified ?? "")),
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      vdp_url: row.source_url,
      source: dealer.website,
      data_source: "Authorized dealer feed",
      exterior_color: row.vehicle_exterior_color,
      build: {
        year: row.vehicle_year ?? undefined,
        make: row.vehicle_make,
        model: row.vehicle_model,
        trim: row.vehicle_trim,
        body_type: row.vehicle_body_style,
        transmission: row.vehicle_transmission,
        drivetrain: row.vehicle_drivetrain,
        fuel_type: row.vehicle_fuel_type,
      },
      dealer: {
        name: dealer.display_name,
        website: dealer.website,
        phone: dealer.phone,
        street: dealer.address_line1,
        city: row.city || dealer.city,
        state: row.state || dealer.state,
        zip: row.postal_code || dealer.postal_code,
      },
      media: { photo_links: row.photos ?? [] },
    },
    "dealer",
  );
  return listing ? { ...listing, id: `dealerfeed-${row.id}` } : null;
}

/** A directly authorized dealer feed wins over older aggregator inventory. */
export function mergeDealerFeedVehicles<
  T extends {
    id: string;
    vehicle?: { vin?: string | null } | null;
    externalVehicle?: MarketCheckListing;
  },
>(direct: T[], aggregated: T[], dealers: PublishedFeedDealer[]): T[] {
  const vins = new Set(direct.map((v) => v.vehicle?.vin).filter(Boolean));
  const hosts = new Set(dealers.map((d) => new URL(d.website).hostname.replace(/^www\./, "")));
  return [
    ...direct,
    ...aggregated.filter((card) => {
      if (card.vehicle?.vin && vins.has(card.vehicle.vin)) return false;
      const url = card.externalVehicle?.sourceUrl;
      if (url) {
        try {
          if (hosts.has(new URL(url).hostname.replace(/^www\./, ""))) return false;
        } catch {
          /* ignore invalid aggregator links */
        }
      }
      return true;
    }),
  ];
}
