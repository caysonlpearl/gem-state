import { api, ApiError } from "./client";
import { installIdentifier } from "./identity";
import type { MobileListingManagementAttempt } from "../../../src/lib/mobile-listing-management.server";
import { mobileListingAllowed } from "../../../src/lib/mobile-contract";
import { classifiedListingSchema } from "../../../src/lib/classified-listing-contracts";
export type ListingAttempt = MobileListingManagementAttempt;
const key = (owner: string) => `bb-draft-listing-action-${owner}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readListingAttempt(owner: string): ListingAttempt | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key(owner)) ?? "null");
    if (
      !v ||
      !uuid.test(v.requestId) ||
      !uuid.test(v.listingId) ||
      !/^[0-9a-f]{64}$/.test(v.version) ||
      !["edit", "archive", "relist"].includes(v.action) ||
      !v.input ||
      typeof v.input !== "object" ||
      Array.isArray(v.input)
    )
      return null;
    if (v.action !== "edit" && Object.keys(v.input).length) return null;
    if (
      v.action === "edit" &&
      (!classifiedListingSchema.safeParse(v.input).success ||
        !mobileListingAllowed({
          categorySlug: v.input.category,
          title: v.input.title,
          description: v.input.description,
        }))
    )
      return null;
    const paths = v.input.publicMediaPaths;
    if (
      paths !== undefined &&
      (!Array.isArray(paths) ||
        paths.length > 8 ||
        paths.some(
          (p: unknown) => typeof p !== "string" || !p.startsWith(owner + "/") || p.includes(".."),
        ))
    )
      return null;
    return v;
  } catch {
    return null;
  }
}
export function storeListingAttempt(owner: string, value: ListingAttempt) {
  try {
    sessionStorage.setItem(key(owner), JSON.stringify(value));
  } catch {
    /* In-memory receipt still protects this session. */
  }
}
export function clearListingAttempt(owner: string) {
  try {
    sessionStorage.removeItem(key(owner));
  } catch {
    /* Optional storage. */
  }
}
export function submitListingAttempt(owner: string, value: ListingAttempt) {
  return api<{ listingId: string; replayed: boolean }>(
    `account/listings/${value.listingId}/manage`,
    "POST",
    { action: value.action, version: value.version, input: value.input },
    undefined,
    { userId: owner, installId: installIdentifier() },
    value.requestId,
  );
}
/** These responses occur after the receipt lookup and prove this atomic write did not commit. */
export const listingChanged = (e: unknown) =>
  e instanceof ApiError &&
  [
    "listing_changed",
    "listing_state_changed",
    "listing_unavailable",
    "listing_source_removed",
    "listing_photos_required",
  ].includes(e.code);
export const listingDefinitelyRejected = (e: unknown) =>
  e instanceof ApiError && [400, 401, 403, 404, 409, 415].includes(e.status);
