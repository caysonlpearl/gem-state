import type { SupabaseClient } from "@supabase/supabase-js";
import { imageSize } from "image-size";

import type { PrivatePhotoUploadInput, PrivatePhotoUploadTicket } from "./photo-upload";
import {
  photoContentType,
  PHOTO_THUMBNAIL_WIDTH,
  PHOTO_THUMBNAIL_MAX_HEIGHT,
  type PhotoBucket,
  type PhotoReceipt,
  type PhotoStorageMode,
} from "./photo-storage";
import { photoObjectKey, photoSha256, type R2PhotoStore } from "./r2-photo-storage.server";
import { createSupabasePhotoReceipts, createSupabasePhotoSource } from "./photo-storage.server";

type UploadPayload = PrivatePhotoUploadInput & { key: string; thumbnailKey: string };

export async function createPrivatePhotoUpload(
  db: SupabaseClient,
  r2: R2PhotoStore,
  userId: string,
  input: PrivatePhotoUploadInput,
  mode: PhotoStorageMode,
): Promise<PrivatePhotoUploadTicket> {
  if (mode === "supabase") throw new Error("Photo storage changed; retry your upload.");
  const id = crypto.randomUUID();
  const path = `${userId}/${crypto.randomUUID()}.${input.extension}`;
  const key = photoObjectKey(path, input.sha256);
  const thumbnailKey = photoObjectKey(path, input.thumbnail.sha256, true);
  const buckets: PhotoBucket[] = input.evidence
    ? ["ask-evidence", "listing-media"]
    : ["listing-media"];
  const payload: UploadPayload = { ...input, key, thumbnailKey };
  const reservations = buckets.map((bucket) => ({
    id: photoSha256(`${bucket}/${path}/${input.sha256}`),
    bytes: input.bytes + (bucket === "listing-media" ? input.thumbnail.bytes : 0),
  }));
  const { error } = await db
    .rpc("begin_private_photo_upload", {
      _ticket: { id, user_id: userId, path, mode, payload, reservations },
    })
    .abortSignal(AbortSignal.timeout(5000))
    .retry(false);
  if (error) throw new Error("The photo-upload allowance is unavailable. Try again later.");
  const uploads: PrivatePhotoUploadTicket["uploads"] = [];
  for (const bucket of buckets) {
    uploads.push({
      bucket,
      kind: "original",
      ...(await r2.signUpload(bucket, key, input.bytes, input.contentType, input.sha256)),
    });
  }
  uploads.push({
    bucket: "listing-media",
    kind: "thumbnail",
    ...(await r2.signUpload(
      "listing-media",
      thumbnailKey,
      input.thumbnail.bytes,
      input.thumbnail.contentType,
      input.thumbnail.sha256,
    )),
  });
  return { id, path, mode, uploads };
}

export async function completePrivatePhotoUpload(
  db: SupabaseClient,
  r2: R2PhotoStore,
  userId: string,
  id: string,
) {
  const { data: ticket, error } = await db
    .rpc("lease_private_photo_upload", { _id: id, _user: userId })
    .abortSignal(AbortSignal.timeout(3000))
    .retry(false);
  if (error || !ticket || Date.parse(ticket.expires_at) <= Date.now())
    throw new Error("Photo upload expired. Retry uploading it.");
  if (ticket.verified_at) return { path: String(ticket.path) };
  const payload = ticket.payload as UploadPayload;
  const buckets: PhotoBucket[] = payload.evidence
    ? ["ask-evidence", "listing-media"]
    : ["listing-media"];
  const receipts = createSupabasePhotoReceipts(db);
  // Stream large originals through the checksum; only the <=512KiB thumbnail
  // is collected for dimensional validation. No original is re-encoded.
  for (const bucket of buckets) await r2.verify(bucket, payload.key, payload.bytes, payload.sha256);
  const small = await r2.verify(
    "listing-media",
    payload.thumbnailKey,
    payload.thumbnail.bytes,
    payload.thumbnail.sha256,
    true,
  );
  if (!small) throw new Error("Photo preview is unavailable.");
  if (payload.thumbnail.contentType !== "image/svg+xml") {
    const dimensions = imageSize(small);
    if (
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width > PHOTO_THUMBNAIL_WIDTH ||
      dimensions.height > PHOTO_THUMBNAIL_MAX_HEIGHT
    )
      throw new Error("Photo preview dimensions are invalid.");
  }
  for (const bucket of buckets) {
    const source =
      ticket.mode === "mirror"
        ? await createSupabasePhotoSource(db).info(bucket, ticket.path)
        : null;
    const receipt: PhotoReceipt = {
      bucket,
      path: ticket.path,
      key: payload.key,
      sha256: payload.sha256,
      bytes: payload.bytes,
      contentType: photoContentType(payload.contentType),
      thumbnailKey: bucket === "listing-media" ? payload.thumbnailKey : null,
      thumbnailSha256: bucket === "listing-media" ? payload.thumbnail.sha256 : null,
      thumbnailBytes: bucket === "listing-media" ? payload.thumbnail.bytes : null,
      thumbnailContentType: bucket === "listing-media" ? payload.thumbnail.contentType : null,
      sourceEtag: source?.etag ?? null,
      sourceUpdatedAt: source?.updatedAt ?? null,
      verifiedAt: new Date().toISOString(),
    };
    await receipts.record(receipt);
  }
  const { error: finishError } = await db
    .from("photo_upload_tickets")
    .update({ verified_at: new Date().toISOString(), verification_lease_until: null })
    .eq("id", id)
    .eq("user_id", userId)
    .abortSignal(AbortSignal.timeout(3000))
    .retry(false);
  if (finishError) throw new Error("Photo verification could not be completed. Retry.");
  return { path: String(ticket.path) };
}
