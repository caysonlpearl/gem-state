import { brand } from "@/config/brand";

// Old public/preview domains can still be reached from bookmarks and search
// results. OAuth must return to the canonical site instead of a retired
// Lovable project shell with a stale callback state.
const LEGACY_AUTH_HOSTS = new Set([
  "gemstateclassifieds.lovable.app",
  "www.gemstateclassifieds.lovable.app",
  "gemstateclassifieds.com",
  "www.gemstateclassifieds.com",
]);

export function getAuthOrigin() {
  if (typeof window === "undefined") return brand.urls.siteUrl;
  return LEGACY_AUTH_HOSTS.has(window.location.hostname)
    ? brand.urls.siteUrl
    : window.location.origin;
}

export function getAuthRedirectUrl(path: string) {
  return `${getAuthOrigin()}${path}`;
}
