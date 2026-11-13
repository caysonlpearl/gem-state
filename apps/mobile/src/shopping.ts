import { api } from "./client";
import { installIdentifier, resetInstallIdentifier } from "./identity";
import { mobileShoppingEvent } from "../../../src/lib/mobile-shopping";
import type { MobileListing } from "../../../src/lib/mobile-contract";
import type { ShoppingKind } from "../../../src/lib/shopping-contract";
export type ShopperStatus = {
  personalization: boolean;
  trackingAvailable: boolean;
  recommendationsAvailable: boolean;
  version: string;
};
export type RecommendationRows = {
  recent: MobileListing[];
  continuing: MobileListing[];
  recommended: MobileListing[];
  model: string;
};
let userId: string | null | undefined,
  allowed = false,
  generation = 0,
  session = crypto.randomUUID();
let queue: ReturnType<typeof mobileShoppingEvent>[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const seen = new Set<string>();
export function setShopperIdentity(next: string | null) {
  if (userId !== undefined && next === userId) return;
  if (userId !== undefined) resetInstallIdentifier();
  userId = next;
  allowed = false;
  generation++;
  queue = [];
  seen.clear();
  session = crypto.randomUUID();
  if (timer) clearTimeout(timer);
  timer = undefined;
}
export function applyShopperStatus(status: ShopperStatus | null) {
  allowed = status?.personalization === true && status.trackingAvailable === true;
  if (!allowed) {
    generation++;
    queue = [];
    seen.clear();
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
}
const actor = () => ({ userId: userId ?? null, installId: installIdentifier() });
export async function shopperStatus() {
  return api<ShopperStatus>("shopping", "GET", undefined, undefined, actor());
}
export async function updatePersonalization(value: boolean) {
  applyShopperStatus(null);
  await api("shopping/privacy", "PUT", { personalization: value }, undefined, actor());
  const status = await shopperStatus();
  applyShopperStatus(status);
  return status;
}
export async function clearShoppingHistory() {
  applyShopperStatus(null);
  await api("shopping/clear", "POST", {}, undefined, actor());
  if (!userId) resetInstallIdentifier();
  session = crypto.randomUUID();
  const status = await shopperStatus();
  applyShopperStatus(status);
  return status;
}
export function trackShopping(
  kind: ShoppingKind,
  listingId?: string,
  context: Record<string, string | number | boolean> = {},
  search?: Record<string, string | number>,
) {
  if (!allowed || userId === undefined) return;
  const event = mobileShoppingEvent({
    id: crypto.randomUUID(),
    kind,
    listingId,
    session,
    context,
    search,
    at: new Date().toISOString(),
  });
  if (!event) return;
  if (kind === "impression") {
    const key = `${listingId}:${context.placement}:${context.model}:${context.position}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 1000) seen.delete(seen.values().next().value!);
  }
  queue.push(event);
  if (queue.length > 50) queue.shift();
  if (!timer) timer = setTimeout(() => void flushShopping(), 2500);
}
export async function flushShopping() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!allowed || !queue.length) return;
  const batch = queue;
  queue = [];
  const current = generation,
    expected = actor();
  try {
    if (current === generation)
      await api("activity", "POST", { events: batch }, undefined, expected);
  } catch {
    /* no persistent queue or replay after privacy/account changes */
  }
}
export function resetShoppingSession() {
  session = crypto.randomUUID();
  seen.clear();
  if (typeof document !== "undefined")
    document.dispatchEvent(new Event("bluebird-shopping-session"));
}
