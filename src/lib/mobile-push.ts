import { mobileLinkTarget, mobileListingAllowed } from "./mobile-contract.ts";

export type PushCandidate = {
  kind: string;
  readAt: string | null;
  createdAt: string;
  userId: string;
  deviceUserId: string;
  destination: string;
  listing: {
    available?: boolean;
    categorySlug?: string;
    title?: string;
    description?: string;
    externalMerchandise?: unknown;
  } | null;
  shoppingAlerts: boolean;
  messageAlerts: boolean;
  blocked: boolean;
  deletionRequested: boolean;
};
/** Re-evaluated immediately before dispatch, never trusting queued message text or URLs. */
export function prepareMobilePush(
  candidate: PushCandidate,
  now = Date.now(),
): { title: string; body: string; url: string } | null {
  if (
    candidate.userId !== candidate.deviceUserId ||
    candidate.readAt ||
    candidate.blocked ||
    candidate.deletionRequested ||
    !candidate.listing ||
    candidate.listing.available === false ||
    !mobileListingAllowed(candidate.listing)
  )
    return null;
  const age = now - Date.parse(candidate.createdAt);
  if (!Number.isFinite(age) || age < -60000 || age > 7 * 86400000) return null;
  const target = mobileLinkTarget(candidate.destination);
  if (!target || (candidate.kind !== "message" && candidate.kind !== "shopping_alert")) return null;
  if (
    (candidate.kind === "message" && !candidate.messageAlerts) ||
    (candidate.kind === "shopping_alert" && !candidate.shoppingAlerts)
  )
    return null;
  return {
    title: "Bluebird",
    body:
      candidate.kind === "message"
        ? "You have a new marketplace message."
        : "A shopping update is ready for you.",
    url: candidate.destination,
  };
}
export function pushRetryDelay(attempt: number): number {
  return Math.min(3600, 15 * 2 ** Math.max(0, attempt - 1));
}
