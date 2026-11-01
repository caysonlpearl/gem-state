import type { ClassifiedCard } from "./classifieds.functions";

/** Provider ownership alone is not an indexing decision. Evaluate whether a
 * directory detail has recently verified, useful information. Job snippets
 * remain followed/noindex until full, accurate job descriptions are available. */
export function isIndexablePartnerDetail(
  listing: Pick<
    ClassifiedCard,
    "directory" | "service" | "externalJob" | "externalMerchandise" | "city" | "state"
  >,
  now = Date.now(),
) {
  if (listing.externalJob || listing.externalMerchandise) return false;
  if (!listing.directory) return true;
  const business = listing.directory;
  const verified = Date.parse(business.verifiedAt ?? "");
  return (
    listing.state === "ID" &&
    Boolean(listing.city) &&
    Number.isFinite(verified) &&
    verified <= now &&
    verified >= now - 90 * 86400000 &&
    Boolean(business.phone || business.website) &&
    Boolean(business.address?.trim()) &&
    business.trades.length > 0 &&
    (business.hours.length > 0 ||
      (listing.service?.serviceSummary?.trim().length ?? 0) >= 80 ||
      (listing.service?.offerings?.length ?? 0) >= 2)
  );
}
