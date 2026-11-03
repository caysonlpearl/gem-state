import { getPhotoStorageModule } from "./photo-storage-access";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from "./photo-storage";
import { photoReceiptCheck } from "./photo-storage-status";
import { cleanupProbeInputSchema } from "./photo-source-cleanup";
import { removalInputSchema } from "./photo-source-removal";

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
    const { currentPhotoMode, currentPhotoUploadMode, currentPhotoSourceFallbackPolicy } =
      await getPhotoStorageModule();
    const { db, r2 } = await storageRuntime();
    const [listing, evidence, receipts] = await Promise.all([
      r2.available("listing-media").catch(() => false),
      r2.available("ask-evidence").catch(() => false),
      db
        .from("photo_object_receipts")
        .select("path", { count: "exact", head: true })
        .abortSignal(AbortSignal.timeout(3000))
        .retry(false)
        .then(photoReceiptCheck, () => photoReceiptCheck({ error: true })),
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
      sourceFallback: currentPhotoSourceFallbackPolicy(),
      uploadMode: currentPhotoUploadMode(),
      listing,
      evidence,
      thumbnails,
      ...receipts,
    };
  });

export const checkPhotoCleanupTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof cleanupProbeInputSchema>) =>
    cleanupProbeInputSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || isAdmin !== true) throw new Error("Administrator access required.");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { serverEnv } = await import("./runtime-env.server");
    const projectUrl = new URL(serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL"));
    const projectRef = projectUrl.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? "";
    if (projectUrl.protocol !== "https:" || !projectRef || projectRef !== data.projectRef)
      throw new Error("Photo project does not match.");
    const { probePhotoSourceCleanupTargets, cleanupCopyPermitDisabled } =
      await import("./photo-source-cleanup-probe.server.mjs");
    const { currentPhotoMode, currentPhotoUploadMode, currentPhotoSourceFallbackPolicy } =
      await getPhotoStorageModule();
    const { db, r2 } = await storageRuntime();
    const result = await probePhotoSourceCleanupTargets(data, {
      projectRef,
      receipts: async (targets) => {
        const { data: rows, error: readError } = await db
          .from("photo_object_receipts")
          .select("*")
          .in("path", [...new Set(targets.map((target) => target.path))])
          .abortSignal(AbortSignal.timeout(5000))
          .retry(false);
        if (readError || !rows) throw new Error("Photo receipts are unavailable.");
        const requested = new Set(targets.map((target) => `${target.bucket}/${target.path}`));
        return rows
          .filter((row) => requested.has(`${row["bucket"]}/${row["path"]}`))
          .map((row) => ({
            bucket: row["bucket"] as "listing-media" | "ask-evidence",
            path: String(row["path"]),
            key: String(row["r2_key"]),
            bytes: Number(row["byte_size"]),
            sha256: String(row["sha256"]),
            thumbnail:
              row["thumbnail_key"] == null
                ? null
                : {
                    key: String(row["thumbnail_key"]),
                    bytes: Number(row["thumbnail_bytes"]),
                    sha256: String(row["thumbnail_sha256"]),
                  },
          }));
      },
      matches: (bucket, key, bytes, sha256) => r2.matches(bucket, key, bytes, sha256),
    });
    const fallback = currentPhotoSourceFallbackPolicy();
    return {
      ...result,
      controls: {
        checkedAt: new Date().toISOString(),
        projectRef,
        readMode: currentPhotoMode(),
        uploadMode: currentPhotoUploadMode(),
        copyPermitDisabled: cleanupCopyPermitDisabled(serverEnv("BLUEBIRD_PHOTO_MIGRATION_PERMIT")),
        sourceFallbackUntil:
          fallback.expiresAt && Number.isFinite(fallback.expiresAt)
            ? new Date(fallback.expiresAt).toISOString()
            : null,
      },
    };
  });

export const processPhotoSourceCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof removalInputSchema>) => removalInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || isAdmin !== true) throw new Error("Administrator access required.");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { serverEnv } = await import("./runtime-env.server");
    const projectUrl = new URL(serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL"));
    const projectRef = projectUrl.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? "";
    if (projectUrl.protocol !== "https:" || !projectRef || projectRef !== data.header.projectRef)
      throw new Error("Photo project does not match.");
    const permit = serverEnv("BLUEBIRD_PHOTO_SOURCE_REMOVAL_PERMIT");
    const { photoRemovalPermitAllowed } = await import("./photo-source-removal-plan.server.mjs");
    // Keep disabled removal requests away from credentials and privileged reads.
    if (data.mode === "remove" && !photoRemovalPermitAllowed(permit, data.header, context.userId))
      throw new Error("Removal is not enabled for this exact review.");
    const { currentPhotoMode, currentPhotoUploadMode, currentPhotoSourceFallbackPolicy } =
      await getPhotoStorageModule();
    const { cleanupCopyPermitDisabled } = await import("./photo-source-cleanup-probe.server.mjs");
    const { processPhotoSourceRemoval } = await import("./photo-source-removal.server.mjs");
    const { db, r2 } = await storageRuntime();
    return processPhotoSourceRemoval(data, {
      projectRef,
      actorId: context.userId,
      permit,
      controls: async () => {
        const fallback = currentPhotoSourceFallbackPolicy();
        return {
          checkedAt: new Date().toISOString(),
          projectRef,
          readMode: currentPhotoMode(),
          uploadMode: currentPhotoUploadMode(),
          copyPermitDisabled: cleanupCopyPermitDisabled(
            serverEnv("BLUEBIRD_PHOTO_MIGRATION_PERMIT"),
          ),
          sourceFallbackUntil:
            fallback.expiresAt && Number.isFinite(fallback.expiresAt)
              ? new Date(fallback.expiresAt).toISOString()
              : null,
        };
      },
      snapshot: async (targets) => {
        const { data: snapshot, error: readError } = await db
          .rpc("photo_source_cleanup_targets", { _targets: targets })
          .abortSignal(AbortSignal.timeout(5000))
          .retry(false);
        if (readError || !snapshot) throw new Error("Current source evidence is unavailable.");
        return snapshot;
      },
      matches: (bucket, key, bytes, sha256) => r2.matches(bucket, key, bytes, sha256),
      remove: async (bucket, paths) => {
        // Deliberately bypass the R2 adapter: only retained Supabase copies go away.
        const { error: removeError } = await db.storage.from(bucket).remove(paths);
        if (removeError)
          throw new Error("Source removal was not acknowledged; reconcile before resuming.");
      },
    });
  });
