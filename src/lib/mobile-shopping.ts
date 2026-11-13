import { shoppingEvent, type ShoppingEvent } from "./shopping-contract.ts";
import { mobileCategoryAllowed } from "./mobile-contract.ts";
const contextKeys = new Set([
  "position",
  "placement",
  "model",
  "source",
  "method",
  "seconds",
  "photo",
  "visible",
  "rank_visual",
  "rank_budget",
  "rank_location",
  "rank_freshness",
]);
/** Native activity has a smaller contract than the website; no fingerprint,
 * hardware, IP, advertising identifiers, messages, or arbitrary metadata. */
export function mobileShoppingEvent(input: unknown): ShoppingEvent | null {
  const event = shoppingEvent(input);
  if (!event || (event.search?.category && !mobileCategoryAllowed(event.search.category)))
    return null;
  return {
    ...event,
    context: Object.fromEntries([
      ...Object.entries(event.context ?? {}).filter(([key]) => contextKeys.has(key)),
      ["platform", "native"],
    ]),
  };
}
export function mobileGuestSubject(value: string | null): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? `g:${value}`
    : null;
}
