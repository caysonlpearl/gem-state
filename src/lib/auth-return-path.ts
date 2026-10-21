/** Internal destinations only. Returning after login never grants access to a route. */
export const AUTH_STATIC_REDIRECTS = [
  "/claim-seller",
  "/account",
  "/selling",
  "/seller-setup",
  "/dealer-setup",
  "/create-listing",
  "/create-missing-listing",
  "/buying",
  "/notifications",
  "/onboarding",
  "/shopper",
  "/shopper-payouts",
  "/suggest",
  "/watchlist",
  "/messages",
  "/admin",
  "/admin/classifieds",
  "/admin/catalog",
  "/admin/products",
  "/admin/members",
  "/admin/dealers",
  "/admin/validation",
  "/admin/traffic",
  "/admin/dealer-inventory",
  "/admin/review-flags",
  "/admin/conversation-reports",
  "/admin/fb-import",
] as const;

export type StaticAuthRedirect = (typeof AUTH_STATIC_REDIRECTS)[number];
export type ListingAuthRedirect = `/listings/${string}`;
export type AuthReturnPath = StaticAuthRedirect | ListingAuthRedirect;

const LISTING_PATH =
  /^\/listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/edit)?$/i;

export function safeAuthReturnPath(value: unknown): AuthReturnPath {
  if (typeof value !== "string") return "/account";
  if (LISTING_PATH.test(value)) return value as ListingAuthRedirect;
  return AUTH_STATIC_REDIRECTS.includes(value as StaticAuthRedirect)
    ? (value as StaticAuthRedirect)
    : "/account";
}

export function listingReturnTarget(
  path: AuthReturnPath,
): { listingId: string; edit: boolean } | null {
  if (!LISTING_PATH.test(path)) return null;
  return { listingId: path.split("/")[2]!, edit: path.endsWith("/edit") };
}
