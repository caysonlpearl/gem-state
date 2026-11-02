import { getPhotoStorageModule } from "./photo-storage-access";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from "./photo-storage";

const imageType = z
  .string()
  .max(100)
  .regex(/^image\/[a-z0-9.+-]+$/i)
  .transform((value) => value.toLowerCase().replace(/^image\/jpg$/, "image/jpeg"));
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const uploadInput = z.object({
  extension: z.string().regex(/^[a-z0-9]{1,12}$/),
  bytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
  contentType: imageType,
  sha256: checksum,
  evidence: z.boolean(),
  thumbnail: z.object({
    bytes: z.number().int().positive().max(MAX_THUMBNAIL_BYTES),
    contentType: imageType,
    sha256: checksum,
  }),
});

const storageRuntime = createServerOnlyFn(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { serverEnv } = await import("./runtime-env.server");
  const { createR2PhotoStore, readR2PhotoConfig } = await import("./r2-photo-storage.server");
  const names = [
    "BLUEBIRD_R2_ACCOUNT_ID",
    "BLUEBIRD_R2_ACCESS_KEY_ID",
    "BLUEBIRD_R2_SECRET_ACCESS_KEY",
    "BLUEBIRD_R2_LISTING_BUCKET",
    "BLUEBIRD_R2_EVIDENCE_BUCKET",
  ];
  return {
    db: supabaseAdmin as unknown as SupabaseClient,
    r2: createR2PhotoStore(
      readR2PhotoConfig(Object.fromEntries(names.map((name) => [name, serverEnv(name)]))),
    ),
  };
});

export const getPhotoUploadMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    mode: (await getPhotoStorageModule()).currentPhotoUploadMode(),
  }));

export const beginPrivatePhotoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof uploadInput>) => uploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { createPrivatePhotoUpload } = await import("./photo-upload.server");
    const { currentPhotoUploadMode } = await getPhotoStorageModule();
    const mode = currentPhotoUploadMode();
    if (mode === "supabase") throw new Error("Photo storage changed; retry the upload.");
    const { db, r2 } = await storageRuntime();
    return createPrivatePhotoUpload(db, r2, context.userId, data, mode);
  });

export const finishPrivatePhotoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { completePrivatePhotoUpload } = await import("./photo-upload.server");
    const { db, r2 } = await storageRuntime();
    return completePrivatePhotoUpload(db, r2, context.userId, data.id);
  });

export const checkPrivatePhotoStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Administrator access required.");
    const { currentPhotoMode, currentPhotoUploadMode } = await getPhotoStorageModule();
    const { db, r2 } = await storageRuntime();
    const [listing, evidence, receipts] = await Promise.all([
      r2.available("listing-media").catch(() => false),
      r2.available("ask-evidence").catch(() => false),
      db
        .from("photo_object_receipts")
        .select("path", { count: "exact", head: true })
        .abortSignal(AbortSignal.timeout(3000))
        .retry(false),
    ]);
    let thumbnails = false;
    try {
      const { makePhotoThumbnail } = await import("./photo-thumbnail.server");
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AACVz/8EYQJkPACksAAAAABJRU5ErkJggg==",
        ),
        (letter) => letter.charCodeAt(0),
      );
      thumbnails = (await makePhotoThumbnail(png, "image/png")).bytes.byteLength > 0;
    } catch {
      /* Report capability without returning underlying platform errors. */
    }
    return {
      mode: currentPhotoMode(),
      uploadMode: currentPhotoUploadMode(),
      listing,
      evidence,
      thumbnails,
      receiptsReady: !receipts.error,
      verifiedCopies: receipts.count ?? 0,
    };
  });
