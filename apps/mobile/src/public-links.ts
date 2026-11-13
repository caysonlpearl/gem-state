import { mobileCatalogLinkAllowed } from "../../../src/lib/mobile-contract";
import type { MouseEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { apiOrigin } from "./client";
import { nativeListingDestination } from "./listing-links";
export function handleNativePublicLink(event: MouseEvent<HTMLElement>) {
  const a = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
  if (!a || event.defaultPrevented) return;
  const raw = a.getAttribute("href");
  if (!raw || raw.startsWith("#/")) return;
  if (raw.startsWith("#")) {
    // Section fragments belong to this page; the hash is already the app router.
    event.preventDefault();
    try {
      document
        .getElementById(decodeURIComponent(raw.slice(1)))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* A malformed section identifier cannot replace the current route. */
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(raw, apiOrigin);
  } catch {
    event.preventDefault();
    return;
  }
  if (["tel:", "sms:", "mailto:"].includes(url.protocol)) return;
  if (!mobileCatalogLinkAllowed(url.href)) {
    event.preventDefault();
    toast.error("This link is unavailable.");
    return;
  }
  if (["onbluebird.com", "www.onbluebird.com"].includes(url.hostname)) {
    const dest = nativeListingDestination(url.pathname, {}, Object.fromEntries(url.searchParams));
    event.preventDefault();
    if (dest) location.hash = dest;
    else if (["/terms", "/privacy", "/support"].includes(url.pathname)) {
      if (Capacitor.isNativePlatform()) void Browser.open({ url: url.href });
      else window.open(url.href, "_blank", "noopener,noreferrer");
    } else toast.error("This destination is unavailable in the app.");
    return;
  }
  if (Capacitor.isNativePlatform()) {
    event.preventDefault();
    void Browser.open({ url: url.href }).catch(() => toast.error("This link could not be opened."));
  }
}
