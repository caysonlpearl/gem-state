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
      const selected =
        index === 0 &&
        listing.externalVehicle &&
        listing.shareImageUrl &&
        listing.images.some((image) => image.url === listing.shareImageUrl)
          ? listing.shareImageUrl
          : photo.url;
      const url = new URL(selected);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }
  return `/media/listings/${listing.id}/${index}`;
}
