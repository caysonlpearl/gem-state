import { z } from "zod";
import { photoPath, type PhotoBucket } from "./photo-storage";

export const cleanupTargetSchema = z
  .object({
    bucket: z.enum(["listing-media", "ask-evidence"]),
    path: z.string().max(1024).transform(photoPath),
  })
  .strict();
export const cleanupProbeInputSchema = z
  .object({
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    targets: z.array(cleanupTargetSchema).min(1).max(16),
  })
  .strict();
export type CleanupTarget = z.infer<typeof cleanupTargetSchema>;
export type CleanupDescriptor = { key: string; bytes: number; sha256: string };
export type CleanupProbeReceipt = CleanupTarget &
  CleanupDescriptor & { thumbnail: CleanupDescriptor | null };
export type CleanupObjectCheck = CleanupTarget & {
  checkedAt: string;
  original: (CleanupDescriptor & { matched: boolean; unavailable?: boolean }) | null;
  thumbnail: (CleanupDescriptor & { matched: boolean; unavailable?: boolean }) | null;
  error?: string;
};
export type CleanupControls = {
  checkedAt: string;
  projectRef: string;
  readMode: string;
  uploadMode: string;
  copyPermitDisabled: boolean;
  sourceFallbackUntil: string | null;
};
const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("photo-source-cleanup-snapshot"),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    capturedAt: z.string().datetime({ offset: true }),
    objects: z
      .array(z.object({ source: cleanupTargetSchema.passthrough() }).passthrough())
      .max(20000),
  })
  .passthrough();
export type CleanupSnapshot = z.infer<typeof snapshotSchema>;
export function parseCleanupSnapshot(value: unknown) {
  return snapshotSchema.parse(value);
}
export function cleanupSnapshotTargets(snapshot: CleanupSnapshot): CleanupTarget[] {
  return snapshot.objects
    .filter((row) => {
      const approvals = row["approvals"] as { status?: string }[] | undefined;
      return (
        Array.isArray(approvals) &&
        approvals.length === 1 &&
        approvals[0]?.status === "complete" &&
        row["receipt"] != null
      );
    })
    .map((row) => ({ bucket: row.source.bucket as PhotoBucket, path: row.source.path }));
}
