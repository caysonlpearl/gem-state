import { storefrontDestination } from "./storefront-url.ts";
import { classifiedCategories } from "../config/classifieds.ts";
import type { ListingCardSummary } from "./listing-card-summary";

export const MOBILE_API_VERSION = 1;
export const MOBILE_POLICY_VERSION = "2026-11-12";
export const MOBILE_APP_ID = "com.onbluebird.marketplace";
export const MOBILE_AUTH_REDIRECT = "com.onbluebird.marketplace://auth/callback";
export function mobilePublishableKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(atob(key.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"
    );
  } catch {
    return false;
  }
}
export const mobileCategories = classifiedCategories.filter((c) => c.slug !== "firearms");
const allowedCategories = new Set<string>(mobileCategories.map((c) => c.slug));
const prohibited =
  /\b(firearms?|ammunition|ammo|rifles?|pistols?|revolvers?|shotguns?|glock|ar[ -]?15|ak[ -]?47|bump[ -]?stocks?|automatic[ -]?conversion|explosives?|silencers?)\b/i;
export function mobileCategoryAllowed(category: unknown): category is string {
  return typeof category === "string" && allowedCategories.has(category);
}
/** Fail closed on unknown taxonomy and firearm merchants, including misplaced listings. */
export function mobileListingAllowed(card: {
  categorySlug?: unknown;
  title?: unknown;
  description?: unknown;
  externalMerchandise?: unknown;
  isMock?: boolean;
}): boolean {
  return (
    mobileCategoryAllowed(card.categorySlug) &&
    !card.externalMerchandise &&
    !card.isMock &&
    !prohibited.test(`${card.title ?? ""} ${card.description ?? ""}`)
  );
}
export type MobileListing = {
  display?: Pick<
    ListingCardSummary,
    | "discoverySellerKey"
    | "productSlug"
    | "region"
    | "condition"
    | "fulfillmentMode"
    | "isFeatured"
    | "vehicle"
    | "pet"
    | "home"
    | "job"
    | "service"
    | "vehiclePricing"
    | "dealer"
    | "externalVehicle"
    | "externalJob"
    | "externalHome"
    | "externalPet"
    | "directory"
  >;
  shoppingFeatures?: Record<string, number>;
  available?: boolean;
  canSave?: boolean;
  canMessage?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
  id: string;
  productId: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  priceCents: number;
  priceLabel?: string;
  currency: string;
  city: string;
  state: string;
  imageUrl: string | null;
  createdAt: string;
  description?: string | null;
  images?: { url: string; alt: string }[];
  seller?: { displayName: string; contactPhone: string | null; contactEmail: string | null } | null;
};
export function mobileMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, "https://onbluebird.com");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export type MobileBrowse = {
  items: MobileListing[];
  nextPage: number | null;
  incomplete: boolean;
  selection?: boolean;
};
export type MobileHome = { motors: MobileListing[]; recent: MobileListing[] };
export type MobileError = { error: { code: string; message: string }; requestId: string };
/** Native origin headers are not proof of identity; every private API also verifies bearer auth. */
export function mobileOriginAllowed(origin: string | null, development = false): boolean {
  return (
    origin === null ||
    [
      "capacitor://localhost",
      "http://localhost",
      "https://localhost",
      "https://onbluebird.com",
    ].includes(origin) ||
    (development && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  );
}
export function mobileLinkTarget(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    if (
      url.protocol === "com.onbluebird.marketplace:" &&
      url.host === "auth" &&
      url.pathname === "/callback"
    )
      return "/auth/callback";
    if (
      url.username ||
      url.password ||
      url.protocol !== "https:" ||
      !["onbluebird.com", "www.onbluebird.com"].includes(url.hostname)
    )
      return null;
    if (/^\/listings\/[a-z0-9._:-]{1,200}$/i.test(url.pathname)) return url.pathname;
    if (/^\/(sellers|dealers)\//i.test(url.pathname)) {
      if (url.hash || new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length)
        return null;
      return storefrontDestination(url.pathname, Object.fromEntries(url.searchParams));
    }
    if (
      (url.pathname === "/notifications" && !url.search && !url.hash) ||
      (url.pathname === "/account" && url.search === "?section=notifications" && !url.hash)
    )
      return "/account/notifications";
    if (url.pathname === "/account" && url.searchParams.get("section") === "messages") {
      const conversation = url.searchParams.get("conversation");
      return conversation && /^[0-9a-f-]{36}$/i.test(conversation)
        ? `/messages/${conversation}`
        : "/messages";
    }
    return null;
  } catch {
    return null;
  }
}

/** The named firearm merchant stays outside native business/contact destinations. */
export function mobileCatalogLinkAllowed(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname !== "guns.com" &&
      !url.hostname.endsWith(".guns.com")
    );
  } catch {
    return false;
  }
}
