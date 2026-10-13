/** A claim is a bearer secret: never put it in query strings or telemetry. */
export function canonicalFacebookProfile(value: string): string {
  const url = new URL(value);
  if (!["facebook.com", "www.facebook.com", "m.facebook.com"].includes(url.hostname.toLowerCase()))
    throw new Error("Enter a Facebook Marketplace seller profile URL.");
  const match = url.pathname.match(/^\/marketplace\/profile\/([^/]+)\/?$/);
  if (!match || !/^[a-zA-Z0-9._-]+$/.test(match[1]))
    throw new Error("Enter a Facebook Marketplace seller profile URL.");
  return `https://www.facebook.com/marketplace/profile/${match[1]}/`;
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
