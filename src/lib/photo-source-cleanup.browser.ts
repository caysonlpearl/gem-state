import type { CleanupTarget, CleanupObjectCheck, CleanupControls } from "./photo-source-cleanup";

export async function runPhotoCleanupChecks(input: {
  projectRef: string;
  targets: CleanupTarget[];
  probe(data: { projectRef: string; targets: CleanupTarget[] }): Promise<{
    checks: CleanupObjectCheck[];
    controls: CleanupControls;
  }>;
  shouldStop(): boolean;
  progress(value: { checked: number; verified: number }): void;
}) {
  const checks: CleanupObjectCheck[] = [];
  let controls: CleanupControls | null = null;
  let verified = 0;
  try {
    for (let offset = 0; offset < input.targets.length; offset += 16) {
      if (input.shouldStop()) return { status: "stopped" as const, checks, controls, verified };
      const batch = input.targets.slice(offset, offset + 16);
      const result = await input.probe({ projectRef: input.projectRef, targets: batch });
      if (
        result.controls.projectRef !== input.projectRef ||
        result.checks.length !== batch.length ||
        result.checks.some(
          (row, index) => row.bucket !== batch[index].bucket || row.path !== batch[index].path,
        )
      )
        throw new Error("Cleanup probe response does not match the requested scope.");
      const passed = result.checks.filter(
        (row) =>
          row.original?.matched === true &&
          (row.thumbnail == null ? row.bucket !== "listing-media" : row.thumbnail.matched === true),
      ).length;
      checks.push(...result.checks);
      controls = result.controls;
      verified += passed;
      input.progress({ checked: checks.length, verified });
      if (passed !== batch.length)
        return { status: "unverified" as const, checks, controls, verified };
    }
    return {
      status: input.shouldStop() ? ("stopped" as const) : ("complete" as const),
      checks,
      controls,
      verified,
    };
  } catch {
    return { status: "error" as const, checks, controls, verified };
  }
}
