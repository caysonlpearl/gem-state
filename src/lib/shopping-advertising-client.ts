import { shoppingPrivacy } from "./shopping-client";
let activePixel = false;
let pixel = "";
type PixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: PixelFunction;
  loaded: boolean;
  version: string;
};
const win = () => window as unknown as { fbq?: PixelFunction; gtag?: (...args: unknown[]) => void };
export function configureShoppingAdvertising(config: { metaPixel?: string; googleTag?: string }) {
  if (!shoppingPrivacy().advertising) return;
  activePixel = Boolean(config.metaPixel);
  if (activePixel) win().fbq?.("consent", "grant");
  if (config.metaPixel && /^\d{5,30}$/.test(config.metaPixel) && !pixel) {
    pixel = config.metaPixel;
    const w = win();
    const queue = function (...args: unknown[]) {
      if (queue.callMethod) queue.callMethod(...args);
      else queue.queue.push(args);
    } as PixelFunction;
    queue.queue = [];
    queue.push = queue;
    queue.loaded = true;
    queue.version = "2.0";
    w.fbq = w.fbq ?? queue;
    w.fbq("consent", "grant");
    w.fbq("init", pixel, {}, { autoConfig: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.shoppingAd = "true";
    document.head.append(script);
  }
  // Google measurement uses the allowlisted server adapter only.
}
export function shoppingAdvertisingEvent(kind: string, id: string) {
  if (!shoppingPrivacy().advertising || !pixel || !activePixel) return;
  const name = (
    { view: "ViewContent", save: "AddToWishlist", cart: "AddToCart", contact: "Contact" } as Record<
      string,
      string
    >
  )[kind];
  if (name) win().fbq?.("track", name, {}, { eventID: id });
}
export function revokeShoppingAdvertising() {
  activePixel = false;
  win().fbq?.("consent", "revoke");
  win().gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  document.querySelectorAll("script[data-shopping-ad]").forEach((s) => s.remove());
  if (!shoppingPrivacy().advertising)
    document.querySelectorAll("script[data-bluebird-dealer-pixel]").forEach((s) => s.remove());
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (/^(_ga|_gid|_gat|_fbp|_fbc)/.test(name))
      for (const domain of ["", `; Domain=${location.hostname}`, `; Domain=.${location.hostname}`])
        document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
  }
}

if (typeof window !== "undefined")
  window.addEventListener("shopping-account-changed", revokeShoppingAdvertising);
