import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES, photoPath } from "./photo-storage";
import {
  MAX_PREPARED_MIGRATION_SOURCE_BYTES,
  type PreparedMigrationPreview,
} from "./photo-migration";

const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  projectRef: z.string().regex(/^[a-z0-9]{20}$/),
  capturedAt: z.string().datetime({ offset: true }),
  objects: z
    .array(
      z.object({
        bucket: z.enum(["listing-media", "ask-evidence"]),
        path: z.string().max(1024).transform(photoPath),
        bytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
        etag: z.string().max(200).nullable(),
        contentType: z
          .string()
          .max(100)
          .regex(/^image\/[a-z0-9.+-]+$/i),
        updatedAt: z.string().datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(20000),
});
const adminRunner = createServerOnlyFn(
  async (context: { supabase: SupabaseClient; userId: string }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || data !== true) throw new Error("Administrator access required.");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPhotoMigrationRunner } = await import("./photo-migration.server");
    return createPhotoMigrationRunner(supabaseAdmin as unknown as SupabaseClient, context.userId);
  },
);

export const getPhotoMigrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ runs: await (await adminRunner(context)).list() }));
export const preparePhotoMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inventorySchema>) => inventorySchema.parse(input))
  .handler(async ({ data, context }) => (await adminRunner(context)).prepare(data));
export const stepPhotoMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; retry?: boolean; preparedPreview?: PreparedMigrationPreview }) =>
    z
      .object({
        id: z.string().guid(),
        retry: z.boolean().default(false),
        preparedPreview: z
          .object({
            ordinal: z.number().int().min(0).max(19999),
            sourceEtag: z.string().regex(/^[a-f0-9]{32}$/i),
            contentType: z.enum(["image/jpeg", "image/webp", "image/png"]),
            base64: z
              .string()
              .min(4)
              .max(4 * Math.ceil(MAX_THUMBNAIL_BYTES / 3))
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
            sourceBase64: z
              .string()
              .min(4)
              .max(4 * Math.ceil(MAX_PREPARED_MIGRATION_SOURCE_BYTES / 3))
              .regex(/^[A-Za-z0-9+/]+={0,2}$/)
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    (await adminRunner(context)).step(data.id, data.retry, data.preparedPreview),
  );

export const preparePhotoMigrationPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().guid() }).strict().parse(input))
  .handler(async ({ data, context }) => (await adminRunner(context)).preparePreview(data.id));
