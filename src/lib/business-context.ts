import {
  businessForListing,
  businessProps,
  type BusinessIdentity,
  type BusinessListing,
} from "./business-performance.ts";
const listings = new Map<string, { business: BusinessIdentity; title: string; source: string }>();
export function rememberListingBusiness(listing: BusinessListing) {
  const business = businessForListing(listing);
  if (business)
    listings.set(listing.id, {
      business,
      title: business.kind === "dealer" ? (listing.title ?? "") : "",
      source: listing.id.startsWith("dealerfeed-")
        ? "Authorized feed"
        : listing.id.startsWith("marketcheck-")
          ? "MarketCheck API"
          : "Business listing",
    });
  else listings.delete(listing.id);
  if (listings.size > 500) listings.delete(listings.keys().next().value!);
  return business;
}
export function listingBusinessProps(listingId: unknown) {
  const entry = typeof listingId === "string" ? listings.get(listingId) : null;
  return entry
    ? {
        ...businessProps(entry.business),
        business_listing_title: entry.title,
        business_listing_source: entry.source,
      }
    : {};
}
