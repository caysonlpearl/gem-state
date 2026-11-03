import type { ClassifiedDetail } from "./classifieds.functions";

/** Native photos need a fresh private-storage signature; partner photos are
 * already public gallery URLs and do not exist in Bluebird's listing-media. */
export function listingPhotoUrl(listing: ClassifiedDetail, index = 0): string | undefined {
  const photo = listing.images[index];
  if (!photo) return undefined;
  if (
    listing.externalHome ||
    listing.externalVehicle ||
    listing.externalPet ||
    listing.externalJob ||
    listing.externalMerchandise ||
    listing.directory
  ) {
    try {
      const url = new URL(photo.url);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }
  return `/media/listings/${listing.id}/${index}`;
}
