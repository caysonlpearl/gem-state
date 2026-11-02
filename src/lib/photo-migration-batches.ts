import type { PhotoMigrationStatus } from "./photo-migration";

type StepResult = {
  state: "copied" | "busy" | "stopped" | "complete";
  reason: string | null;
  status: PhotoMigrationStatus;
};

export type PhotoBatchStop =
  | "complete"
  | "busy"
  | "stopped"
  | "retry-limit"
  | "user-stop"
  | "permit-changed"
  | "batch-finished";

/** Continue only the selected approval, with a saved-state checkpoint every 25 groups. */
export async function runPhotoMigrationBatches(options: {
  run: PhotoMigrationStatus;
  retry: boolean;
  continuous?: boolean;
  step: (input: { id: string; retry: boolean }) => Promise<StepResult>;
  refresh: () => Promise<PhotoMigrationStatus>;
  onStatus: (status: PhotoMigrationStatus) => void;
  shouldStop: () => boolean;
  now?: () => number;
}): Promise<PhotoBatchStop> {
  const { run, retry, step, refresh, onStatus, shouldStop } = options;
  const now = options.now ?? Date.now;
  const approval = JSON.stringify(run.permit);
  let current = run;
  function validateStatus(status: PhotoMigrationStatus) {
    if (status.id !== run.id || status.digest !== run.digest)
      throw new Error("The selected photo-transfer review changed. Stop and refresh it.");
    current = status;
    onStatus(status);
  }
  function hasApproval() {
    return (
      !!current.permit &&
      JSON.stringify(current.permit) === approval &&
      Date.parse(current.permit.expiresAt) > now()
    );
  }
  for (;;) {
    if (shouldStop()) return "user-stop";
    if (!hasApproval()) return "permit-changed";
    for (let group = 0; group < (retry ? 1 : 25); group++) {
      if (shouldStop()) return "user-stop";
      if (!hasApproval()) return "permit-changed";
      const result = await step({ id: run.id, retry });
      validateStatus(result.status);
      if (result.state !== "copied")
        return result.state === "complete"
          ? "complete"
          : result.state === "busy"
            ? "busy"
            : result.reason === "retry-limit"
              ? "retry-limit"
              : "stopped";
    }
    if (shouldStop()) return "user-stop";
    if (!options.continuous || retry) return "batch-finished";
    // Do not silently widen, renew or reset an approval between bounded batches.
    validateStatus(await refresh());
    if (current.failedGroups > 0) return "stopped";
    if (current.runningGroups > 0) return "busy";
  }
}
