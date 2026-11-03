import type {
  CleanupTarget,
  CleanupProbeReceipt,
  CleanupObjectCheck,
} from "./photo-source-cleanup";
export function cleanupCopyPermitDisabled(raw: string): boolean;
export function probePhotoSourceCleanupTargets(
  input: { projectRef: string; targets: CleanupTarget[] },
  deps: {
    projectRef: string;
    receipts(targets: CleanupTarget[]): Promise<CleanupProbeReceipt[]>;
    matches(
      bucket: CleanupTarget["bucket"],
      key: string,
      bytes: number,
      sha256: string,
    ): Promise<boolean>;
    now?: () => Date;
  },
): Promise<{ checks: CleanupObjectCheck[]; verified: number }>;
