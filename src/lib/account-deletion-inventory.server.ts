import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";

type InventoryResponse = { data: unknown; error: unknown };
export type DeletionInventoryDatabase = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<InventoryResponse> & {
    abortSignal(signal: AbortSignal): PromiseLike<InventoryResponse>;
  };
};
export type DeletionInventoryPage = Readonly<{
  passDone: boolean;
  source?: string;
  sourceDone?: boolean;
  read: number;
  added: number;
}>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failed = () => new DeletionStepError("inventory_unavailable");

/** Database discovery is one part of inventory. A completed pass does not prove
 * provider coverage, exclusive ownership, retention decisions or erasure.
 * This adapter cannot advance the account-deletion phase or start a scheduler. */
export function createAccountDeletionReferenceInventory(db: DeletionInventoryDatabase) {
  const args = (job: DeletionJob) => {
    if (
      job?.phase !== "inventory" ||
      ![job.id, job.user_id, job.lease_token].every((id) => typeof id === "string" && uuid.test(id))
    )
      throw failed();
    return { _id: job.id, _user: job.user_id, _lease: job.lease_token };
  };
  async function call(name: string, input: Record<string, unknown>, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    try {
      deadline.throwIfAborted();
      const result = await db.rpc(name, input).abortSignal(deadline);
      deadline.throwIfAborted();
      if (!result || result.error !== null || result.data === undefined) throw failed();
      return result.data;
    } catch {
      // Database error/context may contain paths, signed URLs or private values.
      throw failed();
    }
  }
  return {
    async scan(job: DeletionJob, signal: AbortSignal, limit = 50): Promise<DeletionInventoryPage> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw failed();
      const value = await call(
        "scan_account_deletion_media_inventory",
        { ...args(job), _limit: limit },
        signal,
      );
      if (!value || typeof value !== "object" || Array.isArray(value)) throw failed();
      const row = value as Record<string, unknown>;
      const hasSource = row["source"] !== undefined;
      const fields = hasSource
        ? ["source", "source_done", "pass_done", "read", "added"]
        : ["pass_done", "read", "added"];
      if (
        Object.keys(row).length !== fields.length ||
        !fields.every((key) => Object.hasOwn(row, key)) ||
        typeof row["pass_done"] !== "boolean" ||
        ![row["read"], row["added"]].every(
          (n) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= limit,
        ) ||
        (row["added"] as number) > (row["read"] as number) ||
        (hasSource &&
          (typeof row["source"] !== "string" ||
            !/^[a-z_]{1,64}$/.test(row["source"]) ||
            typeof row["source_done"] !== "boolean")) ||
        (!hasSource && (row["pass_done"] !== true || row["read"] !== 0 || row["added"] !== 0))
      )
        throw failed();
      return Object.freeze({
        passDone: row["pass_done"] as boolean,
        ...(hasSource
          ? { source: row["source"] as string, sourceDone: row["source_done"] as boolean }
          : {}),
        read: row["read"] as number,
        added: row["added"] as number,
      });
    },
    async restart(job: DeletionJob, signal: AbortSignal): Promise<boolean> {
      const value = await call("restart_account_deletion_media_inventory", args(job), signal);
      if (typeof value !== "boolean") throw failed();
      return value;
    },
  };
}
