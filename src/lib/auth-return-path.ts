import { ACCOUNT_SECTIONS } from "../components/account/account-sections.ts";

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
export type AuthReturnPath =
  StaticAuthRedirect | ListingAuthRedirect | `/account?${string}` | `/create-listing?${string}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LISTING_PATH =
  /^\/listings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/edit)?$/i;

export function safeAuthReturnPath(value: unknown): AuthReturnPath {
  if (typeof value !== "string") return "/account";
  if (value.includes("?")) {
    const [pathname, query, extra] = value.split("?");
    if (extra !== undefined || value.includes("#") || /[\\\s]/.test(value)) return "/account";
    if (pathname !== "/account" && pathname !== "/create-listing") return "/account";
    const params = new URLSearchParams(query);
    const allowed = pathname === "/account" ? ["section", "conversation"] : ["duplicateFrom"];
    for (const [key, entry] of params) {
      if (!allowed.includes(key) || params.getAll(key).length !== 1) return "/account";
      if (key === "section") {
        if (!(ACCOUNT_SECTIONS as readonly string[]).includes(entry)) return "/account";
      } else if (!UUID.test(entry)) return "/account";
    }
    if (params.size === 0) return pathname;
    // A conversation always opens the inbox, rather than a hidden panel.
    if (params.has("conversation")) params.set("section", "messages");
    params.sort();
    return `${pathname}?${params.toString()}` as AuthReturnPath;
  }
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

/** Typed search values for the only query-bearing return destinations. */
export function authReturnSearch(path: AuthReturnPath) {
  const params = new URLSearchParams(path.split("?")[1]);
  return {
    section: params.get("section") as (typeof ACCOUNT_SECTIONS)[number] | null,
    conversation: params.get("conversation") ?? undefined,
    duplicateFrom: params.get("duplicateFrom") ?? undefined,
  };
}
