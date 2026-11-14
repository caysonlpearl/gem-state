import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_PHOTO_BYTES,
  MAX_THUMBNAIL_BYTES,
  photoBucket,
  photoPath,
  type PhotoWriteIntent,
} from "./photo-storage";

/** Required before a physical PUT or issuing an immutable upload URL. A plan
 * is durable write evidence, not a verified photo receipt or erasure authority. */
export function createSupabasePhotoWritePlanner(db: SupabaseClient) {
  return {
    async plan(supplied: readonly PhotoWriteIntent[]): Promise<void> {
      try {
        if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 3) throw Error();
        const intents = supplied.map((value) =>
          Object.freeze({
            bucket: photoBucket(value.bucket),
            path: photoPath(value.path),
            variant: value.variant,
            sha256: value.sha256,
            bytes: value.bytes,
            storeFingerprint: value.storeFingerprint,
          }),
        );
        const keys = new Set<string>();
        for (const intent of intents) {
          if (
            !["original", "thumbnail"].includes(intent.variant) ||
            (intent.variant === "thumbnail" && intent.bucket !== "listing-media") ||
            typeof intent.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/.test(intent.sha256) ||
            typeof intent.storeFingerprint !== "string" ||
            !/^[a-f0-9]{64}$/.test(intent.storeFingerprint) ||
            !Number.isSafeInteger(intent.bytes) ||
            intent.bytes <= 0 ||
            intent.bytes >
              (intent.variant === "thumbnail" ? MAX_THUMBNAIL_BYTES : MAX_PHOTO_BYTES) ||
            intent.path !== intents[0].path ||
            keys.has(`${intent.bucket}/${intent.variant}`)
          )
            throw Error();
          keys.add(`${intent.bucket}/${intent.variant}`);
        }
        const { data, error } = await db
          .rpc("plan_private_photo_writes", { _intents: Object.freeze(intents) })
          .abortSignal(AbortSignal.timeout(5000))
          .retry(false);
        if (error || data !== true) throw Error();
      } catch {
        throw new Error("Photo write planning is unavailable. Retry your upload.");
      }
    },
  };
}
