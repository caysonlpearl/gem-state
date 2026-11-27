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

/** Give a card with an unavailable rendition one chance to show its original. */
export function listingCardImageFallbackUrl(value: string): string | null {
  if (listingCardImageUrl(value) !== value) return value;
  const [path, query] = value.split("?", 2);
  if (
    !/^\/media\/listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/0$/i.test(
      path,
    )
  )
    return null;
  const params = new URLSearchParams(query);
  if (params.get("size") !== "card") return null;
  params.delete("size");
  return params.size ? `${path}?${params}` : path;
}

/** Stable public resolver rechecks publication before signing private bytes.
 * Cached cards must not depend on a thumbnail signer succeeding at build time. */
export function nativeListingCoverUrl(id: string, revision?: string): string | null {
  if (revision !== undefined && !/^[0-9a-f]{64}$/.test(revision)) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `/media/listings/${id}/0?size=card${revision ? `&rev=${revision}` : ""}`
    : null;
}
