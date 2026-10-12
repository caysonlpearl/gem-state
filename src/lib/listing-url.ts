// Listing URLs read like what's for sale and where:
//   /listings/2019-toyota-tacoma-trd-off-road-meridian-<uuid>
// The UUID at the end is what identifies the listing; the words in front are
// for people and search engines, and an outdated or missing slug redirects.
const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MAX_SLUG = 70;

export function listingIdFromParam(param: string) {
  return param.match(UUID_AT_END)?.[1] ?? param;
}

export function listingParam(listing: { id: string; title: string; city?: string | null }) {
  // Preview listings use readable non-UUID ids; leave those as they are.
  if (!UUID_AT_END.test(listing.id)) return listing.id;
  const words = `${listing.title} ${listing.city ?? ""}`
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = words.length > MAX_SLUG ? words.slice(0, MAX_SLUG).replace(/-[^-]*$/, "") : words;
  return slug ? `${slug}-${listing.id}` : listing.id;
}

export function listingPath(listing: { id: string; title: string; city?: string | null }) {
  return `/listings/${listingParam(listing)}`;
}
