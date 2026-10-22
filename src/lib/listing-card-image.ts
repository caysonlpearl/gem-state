/** Use the provider's existing thumbnail variant only on listing cards.
 * Detail galleries keep the original image. Unknown/signed URLs stay untouched.
 */
export function listingCardImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "images.craigslist.org" ||
      url.search ||
      url.hash
    )
      return value;
    if (!/^\/[A-Za-z0-9_]+_1200x900\.jpg$/.test(url.pathname)) return value;
    url.pathname = url.pathname.replace(/_1200x900\.jpg$/, "_600x450.jpg");
    return url.toString();
  } catch {
    return value;
  }
}

/** Only the priority photo uses the same-origin cache; signed/unknown URLs never do. */
export function priorityListingCardImageUrl(value: string): string {
  const thumbnail = listingCardImageUrl(value);
  try {
    const url = new URL(thumbnail);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "images.craigslist.org" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^\/[A-Za-z0-9_]{1,160}_600x450\.jpg$/.test(url.pathname)
    )
      return thumbnail;
    return `/media/listing-card${url.pathname}`;
  } catch {
    return thumbnail;
  }
}

export function listingCardImageFallbacks(original: string, priority = false): string[] {
  const initial = priority ? priorityListingCardImageUrl(original) : listingCardImageUrl(original);
  return [...new Set([listingCardImageUrl(original), original])].filter((url) => url !== initial);
}
