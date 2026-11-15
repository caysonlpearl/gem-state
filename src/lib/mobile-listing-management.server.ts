/* eslint-disable @typescript-eslint/no-explicit-any -- closed private RPC projections; never a public raw-row endpoint */
import { MobileApiError } from "./mobile-api.ts";
import { mobileListingAllowed } from "./mobile-contract.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revision = /^[0-9a-f]{64}$/;
const unavailable = () =>
  new MobileApiError(
    503,
    "listing_management_unavailable",
    "Your listing could not be confirmed. Please retry the same action.",
  );
export type MobileListingManagementAttempt = {
  requestId: string;
  listingId: string;
  action: "edit" | "archive" | "relist";
  version: string;
  input: Record<string, unknown>;
};
/** A caller must be the already-verified member client. This read stays private
 * until the API projects domain editor fields and signs owned media. */
export async function readOwnedMobileListingSnapshot(
  client: any,
  ownerId: string,
  listingId: string,
) {
  if (!uuid.test(ownerId) || !uuid.test(listingId))
    throw new MobileApiError(400, "invalid_listing", "Choose a listing.");
  try {
    const signal = AbortSignal.timeout(8000);
    const r = await client
      .rpc("mobile_listing_editor_snapshot", { _listing: listingId })
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (r.error !== null || r.data === undefined) throw unavailable();
    if (r.data === null)
      throw new MobileApiError(
        404,
        "listing_unavailable",
        "This listing is unavailable in the app.",
      );
    const s = r.data.snapshot;
    if (
      r.data.ownerId !== ownerId ||
      !revision.test(r.data.version) ||
      !s ||
      s.id !== listingId ||
      !s.classified_listing_details ||
      !Array.isArray(s.listing_media) ||
      s.listing_media.length > 32 ||
      !mobileListingAllowed({
        categorySlug: s.products?.categories?.slug,
        title: s.products?.name,
        description: s.products?.description,
      }) ||
      s.listing_media.some(
        (m: any) => !m || typeof m.storage_path !== "string" || !Number.isInteger(m.position),
      )
    )
      throw unavailable();
    return { ownerId, version: r.data.version as string, snapshot: s };
  } catch (e) {
    if (e instanceof MobileApiError) throw e;
    throw unavailable();
  }
}
/** Exactly one SDK attempt. A timeout is uncertain, so callers retain the same
 * request ID and payload; the database receipt decides whether it committed. */
export async function commitOwnedMobileListing(
  client: any,
  attempt: MobileListingManagementAttempt,
) {
  let inputBytes = Infinity;
  try {
    const serialized = JSON.stringify(attempt?.input);
    if (typeof serialized === "string") inputBytes = new TextEncoder().encode(serialized).length;
  } catch {
    // Invalid in-memory values must not become a transport error or a queued write.
  }
  if (
    !attempt ||
    !uuid.test(attempt.requestId) ||
    !uuid.test(attempt.listingId) ||
    !revision.test(attempt.version) ||
    !["edit", "archive", "relist"].includes(attempt.action) ||
    !attempt.input ||
    typeof attempt.input !== "object" ||
    Array.isArray(attempt.input) ||
    inputBytes > 65536 ||
    (attempt.action !== "edit" && Object.keys(attempt.input).length)
  )
    throw new MobileApiError(400, "invalid_listing_action", "Check the listing action.");
  if (
    attempt.action === "edit" &&
    !mobileListingAllowed({
      categorySlug: attempt.input.category,
      title: attempt.input.title,
      description: attempt.input.description,
    })
  )
    throw new MobileApiError(
      400,
      "listing_restricted",
      "This listing is not supported in the mobile app.",
    );
  try {
    const signal = AbortSignal.timeout(15000);
    const r = await client
      .rpc("mobile_manage_listing", {
        _request: attempt.requestId,
        _listing: attempt.listingId,
        _action: attempt.action,
        _expected: attempt.version,
        _input: attempt.input,
      })
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (r.error) {
      if (
        r.error.code === "P0001" &&
        r.error.message === "Listing changed; reload before trying again"
      )
        throw new MobileApiError(
          409,
          "listing_changed",
          "This listing changed. Reload it before making another change.",
        );
      if (r.error.code === "P0001" && r.error.message === "Listing unavailable")
        throw new MobileApiError(
          404,
          "listing_unavailable",
          "This listing is no longer available.",
        );
      if (
        r.error.code === "P0001" &&
        [
          "Only open listings can be edited",
          "Only removed or expired listings can be relisted",
        ].includes(r.error.message)
      )
        throw new MobileApiError(
          409,
          "listing_state_changed",
          "This listing's status changed. Reload your listings before trying again.",
        );
      // These exact domain rejections occur after the atomic receipt lookup.
      // A committed retry would already have returned its receipt. They therefore
      // prove no commit, unlike authentication, transport or unknown SQL failures.
      if (
        r.error.code === "P0001" &&
        r.error.message === "This import was removed. Restore it before importing or refreshing"
      )
        throw new MobileApiError(
          409,
          "listing_source_removed",
          "This listing's import source was removed. Restore the source on the website before changing this listing.",
        );
      if (
        r.error.code === "P0001" &&
        r.error.message === "Private evidence and a public listing photo are required"
      )
        throw new MobileApiError(
          409,
          "listing_photos_required",
          "This listing needs its original photo evidence and a public photo before it can be relisted. Restore its photos on the website first.",
        );
      throw unavailable();
    }
    const d = r.data;
    if (
      !d ||
      d.listingId !== attempt.listingId ||
      d.action !== attempt.action ||
      !revision.test(d.version) ||
      typeof d.status !== "string" ||
      !["active", "pending_review", "cancelled", "expired", "matched"].includes(d.status) ||
      typeof d.replayed !== "boolean" ||
      (d.approvedAt !== null &&
        (typeof d.approvedAt !== "string" || !Number.isFinite(Date.parse(d.approvedAt))))
    )
      throw unavailable();
    return {
      listingId: d.listingId as string,
      action: attempt.action,
      version: d.version as string,
      status: d.status as string,
      approvedAt: d.approvedAt as string | null,
      replayed: d.replayed as boolean,
    };
  } catch (e) {
    if (e instanceof MobileApiError) throw e;
    throw unavailable();
  }
}
