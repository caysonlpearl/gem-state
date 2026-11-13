import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
import {
  publishedFeedVehicle,
  mergeDealerFeedVehicles,
  type PublishedFeedDealer,
  type PublishedFeedVehicle,
} from "./dealer-feed-contract.ts";
import { dealerProductForFeed } from "./chatgpt-dealer-products.ts";
import type { MarketCheckListing } from "./marketcheck-contract.ts";
import type { FeedProduct } from "./chatgpt-product-feed.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types.ts";
export type DealerFeedResult = {
  products: FeedProduct[];
  scanned: number;
  excluded: Record<string, number>;
};
export async function readChatgptDealerProducts(
  db: SupabaseClient<Database>,
  now = Date.now(),
  readCached = async () => (await import("./marketcheck.server")).chatgptCachedDealerVehicles(now),
): Promise<DealerFeedResult> {
  const [result, cached] = await Promise.all([
    withCatalogReadDeadline<any>((signal) =>
      (db as any)
        .rpc("read_published_dealer_inventory", {
          _dealer_slug: null,
          _record_id: null,
          _full_photos: false,
        })
        .abortSignal(signal)
        .retry(false),
    ),
    readCached(),
  ]);
  const feed = result.data as {
    dealers: PublishedFeedDealer[];
    vehicles: PublishedFeedVehicle[];
  } | null;
  if (
    result.error ||
    !Array.isArray(feed?.dealers) ||
    !Array.isArray(feed?.vehicles) ||
    feed.vehicles.length >= 5000
  )
    throw new Error("Dealer inventory unavailable or truncated.");
  const dealers = new Map(feed.dealers.map((dealer) => [dealer.slug, dealer]));
  const direct = feed.vehicles.flatMap((row) => {
    const dealer = dealers.get(row.dealer_slug);
    const vehicle = dealer && publishedFeedVehicle(row, dealer);
    return vehicle
      ? [
          {
            vehicle: { vin: vehicle.vin },
            id: vehicle.id,
            externalVehicle: vehicle,
            sellerUrl: `https://onbluebird.com/dealers/${encodeURIComponent(dealer!.slug)}`,
          },
        ]
      : [];
  });
  // Suppress every older cached offer from a directly published dealer, including owner-held cars.
  const inventory = mergeDealerFeedVehicles(
    direct,
    cached.map((vehicle) => ({
      vehicle: { vin: vehicle.vin },
      id: vehicle.id,
      externalVehicle: vehicle,
      sellerUrl: "",
    })),
    feed.dealers,
  );
  const seenIds = new Set<string>(),
    seenVins = new Set<string>();
  const products: FeedProduct[] = [],
    excluded: Record<string, number> = {};
  for (const card of inventory) {
    const vehicle: MarketCheckListing = card.externalVehicle;
    const vin = vehicle.vin?.trim().toUpperCase();
    if (seenIds.has(vehicle.id) || (vin && seenVins.has(vin))) continue;
    const decision = dealerProductForFeed(vehicle, card.sellerUrl, now);
    if ("product" in decision) {
      products.push(decision.product);
      seenIds.add(vehicle.id);
      if (vin) seenVins.add(vin);
    } else excluded[decision.excluded] = (excluded[decision.excluded] ?? 0) + 1;
  }
  return { products, scanned: inventory.length, excluded };
}
