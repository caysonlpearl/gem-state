import { z } from "zod";
import { cleanupTargetSchema, type CleanupControls } from "./photo-source-cleanup";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime({ offset: true });
const image = z.string().regex(/^image\/[a-z0-9.+-]+$/);
const descriptor = z
  .object({
    key: z.string().max(200),
    bytes: z.number().int().positive().max(52428800),
    sha256: sha,
    contentType: image,
  })
  .strict();
const candidate = z
  .object({
    source: cleanupTargetSchema
      .extend({
        bytes: z.number().int().positive().max(52428800),
        etag: z.string().min(1).max(200),
        contentType: image,
        updatedAt: date,
      })
      .strict(),
    migration: z
      .object({ runId: z.string().uuid(), ordinal: z.number().int().min(0).max(19999) })
      .strict(),
    receipt: descriptor
      .extend({
        thumbnail: descriptor.extend({ bytes: z.number().int().positive().max(524288) }).nullable(),
      })
      .strict(),
    references: z
      .array(
        z
          .object({
            kind: z.enum([
              "ask_media",
              "listing_media",
              "import_evidence",
              "import_public",
              "claim_transfers",
              "upload_tickets",
              "migration_items",
            ]),
            count: z.number().int().positive(),
          })
          .strict(),
      )
      .max(7),
  })
  .strict();
export const removalPlanHeaderSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("photo-source-removal-plan"),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    runIds: z.array(z.string().uuid()).min(1).max(20),
    notBefore: date,
    removalScopeSha256: sha,
    rootSha256: sha,
    totalObjects: z.number().int().min(1).max(20000),
    totalBytes: z
      .number()
      .int()
      .positive()
      .max(20000 * 52428800),
    reviewReady: z.boolean(),
    sourceCapturedAt: date,
    generatedAt: date,
  })
  .strict();
export const removalEntrySchema = z
  .object({
    index: z.number().int().min(0).max(19999),
    candidate,
    proof: z.array(z.object({ side: z.enum(["left", "right"]), hash: sha }).strict()).max(15),
  })
  .strict();
export const removalInputSchema = z
  .object({
    header: removalPlanHeaderSchema,
    entries: z.array(removalEntrySchema).min(1).max(8),
    mode: z.enum(["check", "remove"]),
  })
  .strict();
export const removalPlanSchema = z
  .object({
    header: removalPlanHeaderSchema,
    entries: z.array(removalEntrySchema).min(1).max(20000),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (
      plan.entries.length !== plan.header.totalObjects ||
      plan.entries.reduce((n, e) => n + e.candidate.source.bytes, 0) !== plan.header.totalBytes ||
      plan.entries.some((entry, index) => entry.index !== index) ||
      new Set(
        plan.entries.map(
          (entry) => `${entry.candidate.source.bucket}/${entry.candidate.source.path}`,
        ),
      ).size !== plan.entries.length
    )
      ctx.addIssue({ code: "custom", message: "Removal packet does not match its header." });
  });
export type PhotoRemovalPlan = z.infer<typeof removalPlanSchema>;
export type PhotoRemovalInput = z.infer<typeof removalInputSchema>;
export type PhotoRemovalResult = {
  operatorId?: string;
  permitConfigured?: boolean;
  status: string;
  gates: string[];
  removalEnabled: boolean;
  removed: number;
  controls: CleanupControls;
  results: { index: number; status: string; reason: string | null }[];
};
