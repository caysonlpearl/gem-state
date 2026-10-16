/**
 * Listings imported from Vinted and Whatnot are sold there: the buyer pays
 * and messages on the original listing, so Bluebird's contact buttons send
 * them to it. Facebook and KSL imports keep Bluebird messaging.
 */
export type OriginalListing = { platform: "Vinted" | "Whatnot"; url: string };

export function originalListingFor(sourceUrl: string | null | undefined): OriginalListing | null {
  let url: URL;
  try {
    url = new URL(String(sourceUrl ?? ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (/^vinted\.(com|[a-z]{2}|co\.uk)$/.test(host) && /^\/items\/\d+/.test(url.pathname))
    return { platform: "Vinted", url: url.toString() };
  if (host === "whatnot.com" && /^\/listing\/[A-Za-z0-9=_-]+/.test(url.pathname))
    return { platform: "Whatnot", url: url.toString() };
  return null;
}
