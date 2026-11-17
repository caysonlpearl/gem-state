import { api } from "./client";
import { installIdentifier, resetInstallIdentifier } from "./identity";
import { mobileShoppingEvent } from "../../../src/lib/mobile-shopping";
import type { MobileListing } from "../../../src/lib/mobile-contract";
import type { ShoppingKind } from "../../../src/lib/shopping-contract";
import { mobileListingAllowed } from "../../../src/lib/mobile-contract";
import { createRecommendationCache, type RecommendationOwner } from "./recommendation-cache";
export type ShopperStatus = {
  personalization: boolean;
  trackingAvailable: boolean;
  recommendationsAvailable: boolean;
  version: string;
  historyAfter?: string | null;
};
export type RecommendationRows = {
  recent: MobileListing[];
  continuing: MobileListing[];
  recommended: MobileListing[];
  model: string;
  vehicles?: MobileListing[];
};
let userId: string | null | undefined,
  allowed = false,
  generation = 0,
  session = crypto.randomUUID();
let queue: ReturnType<typeof mobileShoppingEvent>[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let sending: Promise<void> | undefined;
const seen = new Set<string>();
let recommendationOwner: RecommendationOwner | null = null;
const recommendationCache = createRecommendationCache<MobileListing>(
  (value): value is MobileListing => {
    if (!value || typeof value !== "object") return false;
    const card = value as MobileListing;
    return (
      typeof card.id === "string" &&
      typeof card.title === "string" &&
      Number.isSafeInteger(card.priceCents) &&
      card.priceCents >= 0 &&
      mobileListingAllowed(card) &&
      !["jobs", "services"].includes(card.categorySlug)
    );
  },
);
export const shoppingActor = () => ({ userId: userId ?? null, installId: installIdentifier() });
export const recommendationScope = () =>
  JSON.stringify([
    shoppingActor(),
    generation,
    recommendationOwner?.policy,
    recommendationOwner?.historyAfter,
  ]);
export const cachedRecommendations = () =>
  allowed && recommendationOwner ? recommendationCache.read(recommendationOwner) : null;
export function cacheRecommendations(scope: string, rows: RecommendationRows) {
  if (allowed && recommendationOwner && scope === recommendationScope())
    recommendationCache.write(recommendationOwner, rows);
}
export function setShopperIdentity(next: string | null) {
  if (userId !== undefined && next === userId) return;
  if (userId !== undefined) {
    resetInstallIdentifier();
    recommendationCache.clear();
  }
  userId = next;
  allowed = false;
  recommendationOwner = null;
  generation++;
  queue = [];
  sending = undefined;
  seen.clear();
  session = crypto.randomUUID();
  if (timer) clearTimeout(timer);
  timer = undefined;
}
export function applyShopperStatus(status: ShopperStatus | null) {
  if (!status?.personalization && typeof window !== "undefined")
    window.dispatchEvent(new Event("shopping-privacy-changed"));
  allowed = status?.personalization === true && status.trackingAvailable === true;
  recommendationOwner =
    allowed &&
    status?.recommendationsAvailable === true &&
    typeof status.historyAfter === "string" &&
    Number.isFinite(Date.parse(status.historyAfter))
      ? {
          actor: JSON.stringify(shoppingActor()),
          policy: status.version,
          historyAfter: status.historyAfter,
        }
      : null;
  if (!allowed || status?.recommendationsAvailable === false) recommendationCache.clear();
  if (!allowed) {
    generation++;
    queue = [];
    sending = undefined;
    seen.clear();
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
}
const actor = shoppingActor;
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
export function flushShopping(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const current = generation;
  // A foreground recommendation read must wait for a timer/background flush
  // already underway as well as the latest queued views. Serialize each flush.
  const task = (sending ?? Promise.resolve())
    .then(async () => {
      if (current !== generation || !allowed || !queue.length) return;
      const batch = queue,
        expected = actor();
      queue = [];
      try {
        await api("activity", "POST", { events: batch }, undefined, expected);
      } catch {
        /* no persistent queue or replay after privacy/account changes */
      }
    })
    .catch(() => {
      /* Activity remains best effort; never block browsing. */
    });
  sending = task;
  void task.finally(() => {
    if (sending === task) sending = undefined;
  });
  return task;
}
export function resetShoppingSession() {
  session = crypto.randomUUID();
  seen.clear();
  if (typeof document !== "undefined")
    document.dispatchEvent(new Event("bluebird-shopping-session"));
}
