export type MobileTrackingStatus =
  "authorized" | "denied" | "restricted" | "not_determined" | "not_applicable";
export type MobileAdConsent = {
  advertising: boolean;
  platform: "ios" | "android";
  att: MobileTrackingStatus;
};
export function mobileAdvertisingAllowed(consent: MobileAdConsent | null): boolean {
  return (
    consent?.advertising === true &&
    (consent.platform === "android"
      ? consent.att === "not_applicable"
      : consent.att === "authorized")
  );
}
const events = {
  listing_viewed: ["ViewContent", "view_item"],
  listing_saved: ["AddToWishlist", "add_to_wishlist"],
  seller_contacted: ["Contact", "generate_lead"],
} as const;
/** No arbitrary parameter bags, account matching data, queries, precise location or message text. */
export function mobileAdEvent(
  kind: string,
  id: string,
  category: string,
): { meta: string; google: string; parameters: Record<string, string> } | null {
  if (
    !Object.hasOwn(events, kind) ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !/^[a-z-]{1,60}$/.test(category) ||
    category === "firearms"
  )
    return null;
  const names = events[kind as keyof typeof events];
  return {
    meta: names[0],
    google: names[1],
    parameters: { event_id: id, item_category: category },
  };
}
