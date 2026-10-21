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
