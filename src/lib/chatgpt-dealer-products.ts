import { listingPath } from "./listing-url.ts";
import {
  CHATGPT_FEED_STATES,
  restrictedFeedItem,
  type FeedDecision,
} from "./chatgpt-product-feed.ts";
import {
  marketCheckDescription,
  marketCheckImages,
  PARTNER_VEHICLE_ID,
  type MarketCheckListing,
} from "./marketcheck-contract.ts";

const origin = "https://onbluebird.com";
const plain = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\u0000/g, "")
    .trim();
export function safeDealerFeedUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) =>
        /^(?:api_?key|key|token|access_token|signature|sig|x-amz-.+)$/i.test(key),
      )
      ? url.href
      : "";
  } catch {
    return "";
  }
}
/** Facts already shown on the vehicle page supply a useful description when dealer comments are absent. */
export function dealerVehicleDescription(vehicle: MarketCheckListing): string {
  const supplied = plain(marketCheckDescription(vehicle));
  if (supplied) return supplied;
  return [
    plain(vehicle.heading),
    vehicle.build.year ? `Year: ${vehicle.build.year}` : "",
    vehicle.build.make ? `Make: ${vehicle.build.make}` : "",
    vehicle.build.model ? `Model: ${vehicle.build.model}` : "",
    vehicle.build.trim ? `Trim: ${vehicle.build.trim}` : "",
    vehicle.miles != null ? `Mileage: ${vehicle.miles.toLocaleString("en-US")} miles` : "",
    vehicle.build.bodyType ? `Body style: ${vehicle.build.bodyType}` : "",
    vehicle.build.transmission ? `Transmission: ${vehicle.build.transmission}` : "",
    vehicle.build.drivetrain ? `Drivetrain: ${vehicle.build.drivetrain}` : "",
    vehicle.build.fuelType ? `Fuel: ${vehicle.build.fuelType}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}
export function dealerProductForFeed(
  vehicle: MarketCheckListing,
  sellerUrl?: string,
  now = Date.now(),
): FeedDecision {
  if (vehicle.sourceKind !== "dealer" || !PARTNER_VEHICLE_ID.test(vehicle.id))
    return { excluded: "not-dealer-inventory" };
  if (!CHATGPT_FEED_STATES.has(vehicle.location.state.toUpperCase()))
    return { excluded: "outside-marketplace" };
  // The direct publication RPC also enforces its stricter 72-hour window and owner controls.
  if (!vehicle.lastSeenAt || !(Date.parse(vehicle.lastSeenAt) > now - 7 * 86400000))
    return { excluded: "stale-dealer-inventory" };
  if (
    /\b(sold|removed|deleted|inactive|unavailable|out[ _-]?of[ _-]?stock)\b/i.test(
      `${vehicle.vehicleStatus ?? ""} ${vehicle.availabilityStatus ?? ""}`,
    )
  )
    return { excluded: "ended-dealer-inventory" };
  const title = plain(vehicle.heading),
    description = dealerVehicleDescription(vehicle);
  if (!title || title.length > 150 || !description || description.length > 5000)
    return { excluded: "missing-or-invalid-description" };
  if (restrictedFeedItem(title, description)) return { excluded: "restricted-or-uncertain-item" };
  const brand = plain(vehicle.build.make);
  if (!brand || brand.length > 100 || /^(unknown|generic|other|n\/?a|unbranded)$/i.test(brand))
    return { excluded: "missing-brand" };
  const cents = vehicle.price == null ? 0 : Math.round(vehicle.price * 100);
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(cents / 100 - vehicle.price!) > 0.000001
  )
    return { excluded: "missing-fixed-usd-price" };
  const condition = /^new$/i.test(vehicle.inventoryType ?? "")
    ? "new"
    : /^(used|pre[ -]?owned|certified|cpo)$/i.test(vehicle.inventoryType ?? "")
      ? "used"
      : "";
  if (!condition) return { excluded: "unknown-condition" };
  const seller = plain(vehicle.dealer?.name);
  if (!seller || /^(unknown|vehicle seller|dealer|n\/?a)$/i.test(seller))
    return { excluded: "missing-public-seller" };
  const image = marketCheckImages(vehicle).map(safeDealerFeedUrl).find(Boolean);
  if (!image) return { excluded: "missing-photo" };
  return {
    product: {
      item_id: `bluebird-${vehicle.id}`,
      title,
      description,
      url: origin + listingPath({ id: vehicle.id, title, city: vehicle.location.city }),
      brand,
      seller_name: seller,
      image_url: image,
      availability: "unknown",
      price: `${(cents / 100).toFixed(2)} USD`,
      condition,
      product_category: "Cars & Trucks",
      seller_url: safeDealerFeedUrl(sellerUrl) || safeDealerFeedUrl(vehicle.dealer?.website),
      target_countries: '["US"]',
      store_country: "US",
      is_eligible_search: "true",
      is_eligible_checkout: "false",
      is_ads_eligible: "false",
    },
  };
}
