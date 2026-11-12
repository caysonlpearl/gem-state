import { trackEvent, type AnalyticsEventName } from "./analytics";
import {
  businessForListing,
  businessHost,
  businessProps,
  type BusinessIdentity,
  type BusinessListing,
} from "./business-performance";
import { isInternalAnalyticsQuery, isKnownAutomatedAgent } from "./analytics-policy";
const QUEUE = "bluebird_business_events_v1";
type Pending = {
  id: string;
  name: AnalyticsEventName;
  props: Record<string, string | number | boolean | null>;
  at: number;
};
const inFlight = new Set<string>();
function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) || "[]")
      .filter(
        (p: Pending) =>
          p &&
          typeof p.id === "string" &&
          [
            "business_action",
            "business_profile_viewed",
            "business_inquiry_completed",
            "business_listing_clicked",
          ].includes(p.name) &&
          Date.now() - p.at < 2 * 3600000,
      )
      .slice(-80);
  } catch {
    return [];
  }
}
function save(pending: Pending[]) {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(pending));
  } catch {
    /* Optional telemetry must not block navigation. */
  }
}
async function deliver(pending: Pending) {
  if (inFlight.has(pending.id)) return;
  inFlight.add(pending.id);
  try {
    const recorded = await trackEvent(pending.name, pending.props);
    if (recorded) save(read().filter((p) => p.id !== pending.id));
  } finally {
    inFlight.delete(pending.id);
  }
}
export function flushBusinessEvents() {
  if (typeof window !== "undefined") for (const pending of read()) void deliver(pending);
}
export function trackBusinessEvent(
  name:
    | "business_action"
    | "business_profile_viewed"
    | "business_inquiry_completed"
    | "business_listing_clicked",
  business: BusinessIdentity | null,
  props: Record<string, string | number | boolean | null> = {},
) {
  if (typeof window === "undefined") return;
  if (
    !business &&
    !(
      typeof props.listing_id === "string" ||
      (name === "business_profile_viewed" && typeof props.seller_slug === "string")
    )
  )
    return;
  const id = typeof props.event_id === "string" ? props.event_id : crypto.randomUUID();
  let internal = isInternalAnalyticsQuery(window.location.search);
  try {
    internal ||= sessionStorage.getItem("bb_internal_traffic") === "1";
  } catch {
    /* Storage is optional. */
  }
  const pending: Pending = {
    id,
    name,
    at: Date.now(),
    props: {
      ...(business ? businessProps(business) : {}),
      ...props,
      event_id: id,
      is_internal: internal,
      is_bot: isKnownAutomatedAgent(navigator.userAgent),
    },
  };
  const stored = read();
  if (!stored.some((p) => p.id === id)) save([...stored, pending]);
  void deliver(pending);
}
/** Only explicit business destinations count. Gallery images, CARFAX links,
 * and unrelated external sites are not dealer referrals. */
export function trackBusinessAnchor(
  event: { target: EventTarget | null },
  listing: BusinessListing,
) {
  const anchor =
    event.target instanceof Element
      ? (event.target.closest("a[href]") as HTMLAnchorElement | null)
      : null;
  if (!anchor) return;
  const business = businessForListing(listing);
  let target: URL;
  try {
    target = new URL(anchor.href, window.location.origin);
  } catch {
    return;
  }
  let method: string | null = null;
  if (target.origin === window.location.origin) {
    if (
      (business?.dealerSlug && target.pathname === `/dealers/${business.dealerSlug}`) ||
      (listing.seller?.slug && target.pathname === `/sellers/${listing.seller.slug}`)
    )
      method = "dealer_profile";
  } else if (business && /^https?:$/.test(target.protocol)) {
    let original = "";
    try {
      if (listing.externalVehicle?.sourceUrl)
        original = new URL(listing.externalVehicle.sourceUrl, window.location.origin).href;
    } catch {
      /* Malformed provider URLs are not referrals. */
    }
    if (anchor.dataset.businessAction === "vehicle_source" && original && target.href === original)
      method = "vehicle_source";
    else if (business.website && businessHost(target.href) === business.website) method = "website";
    else if (original && target.href === original) method = "vehicle_source";
  }
  if (method) trackBusinessEvent("business_action", business, { method, listing_id: listing.id });
}

/** Card activation is distinct from a page view (which may arrive from search). */
export function trackBusinessListingOpen(
  listing: BusinessListing & { businessAttribution?: BusinessIdentity },
) {
  if (listing.isMock) return;
  const business = listing.businessAttribution ?? businessForListing(listing);
  if (!business && listing.externalVehicle) return;
  trackBusinessEvent("business_listing_clicked", business, {
    listing_id: listing.id,
    business_listing_title: business?.kind === "dealer" ? (listing.title ?? "") : "",
    business_listing_source: listing.id.startsWith("dealerfeed-")
      ? "Authorized feed"
      : listing.id.startsWith("marketcheck-")
        ? "MarketCheck API"
        : "Business listing",
  });
}
