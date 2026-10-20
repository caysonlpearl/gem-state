/** A claim is a bearer secret: never put it in query strings or telemetry. */
/** The seller page an import came from, in one canonical form per seller:
 * a Facebook Marketplace profile, KSL member page, Vinted member page or
 * Whatnot user page, or Diesel Depot inventory. */
export function canonicalSellerSourceProfile(value: string): string {
  const error = "Enter a Facebook Marketplace, KSL, Vinted, Whatnot or Diesel Depot inventory URL.";
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error(error);
  if (["diesel-depot.com", "www.diesel-depot.com"].includes(host)) {
    if (url.pathname !== "/inventory/") throw new Error(error);
    return "https://www.diesel-depot.com/inventory/";
  }
  if (host === "classifieds.ksl.com") {
    const ksl = url.pathname.match(/^\/search\/member\/(\d+)\/?$/);
    if (!ksl) throw new Error(error);
    return `https://classifieds.ksl.com/search/member/${ksl[1]}`;
  }
  if (host === "vinted.com" || host === "www.vinted.com") {
    const vinted = url.pathname.match(/^\/member\/(\d+)(?:-[^/]*)?\/?$/);
    if (!vinted) throw new Error(error);
    return `https://www.vinted.com/member/${vinted[1]}`;
  }
  if (host === "whatnot.com" || host === "www.whatnot.com") {
    const whatnot = url.pathname.match(/^\/user\/([a-zA-Z0-9._-]+)(?:\/shop)?\/?$/);
    if (!whatnot) throw new Error(error);
    return `https://www.whatnot.com/user/${whatnot[1].toLowerCase()}`;
  }
  if (!["facebook.com", "www.facebook.com", "m.facebook.com"].includes(host))
    throw new Error(error);
  const match = url.pathname.match(/^\/marketplace\/profile\/([^/]+)\/?$/);
  if (!match || !/^[a-zA-Z0-9._-]+$/.test(match[1])) throw new Error(error);
  return `https://www.facebook.com/marketplace/profile/${match[1]}/`;
}
/** Stable inventory ID; dealer query parameters and titles can change. */
export function dieselDepotListingId(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["diesel-depot.com", "www.diesel-depot.com"].includes(url.hostname) ||
      url.pathname !== "/inventory/"
    )
      return null;
    return url.search.match(/^\?\/listing\/for-sale\/(\d+)(?:[/?&]|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Catalogs may omit rental-only/unpriced listings. Only an explicit detail
 * page result may flag dealer stock unavailable; absence cannot prove it. */
export function importAbsenceCanFlagRemoved(profile: string, refresh: boolean): boolean {
  return !refresh && profile !== "https://www.diesel-depot.com/inventory/";
}

export function validClaimToken(value: unknown): string {
  const token = String(value ?? "");
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("This claim link is invalid. Ask Bluebird for a replacement.");
  return token;
}
export function claimLinkStatus(
  token: { consumed_at?: string | null; revoked_at?: string | null; expires_at: string } | null,
  claimed: boolean,
  now = Date.now(),
) {
  if (claimed || token?.consumed_at) return "Claimed";
  if (!token) return "Unclaimed";
  if (token.revoked_at) return "Revoked";
  if (Date.parse(token.expires_at) <= now) return "Expired";
  return "Unclaimed";
}
/** Supabase's implicit email return appends a second fragment marker when
 * redirect_to already carries a private claim token. Keep both secrets out of
 * query strings while recognizing this actual provider return format. */
export function parseSellerClaimFragment(hash: string) {
  const normalized = hash.replace(/^#/, "").replace(/(?:#|%23)(?=access_token=|error=)/g, "&");
  const params = new URLSearchParams(normalized);
  const token = params.get("token");
  return {
    token: token === null ? null : /^[a-f0-9]{64}$/.test(token) ? token : "",
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    authError: params.get("error"),
  };
}
