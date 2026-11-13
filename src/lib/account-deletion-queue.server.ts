import {
  deletionPhases,
  deletionFailureCodes,
  DeletionStepError,
  type DeletionJob,
  type DeletionQueue,
} from "./account-deletion-worker.ts";

type QueueRpc =
  | "claim_account_deletion"
  | "advance_account_deletion"
  | "retry_account_deletion"
  | "account_access_coverage";
type QueueResponse = { data: unknown; error: unknown };
export type AccountDeletionQueueDatabase = {
  rpc(
    name: QueueRpc,
    args?: Record<string, unknown>,
  ): PromiseLike<QueueResponse> & {
    abortSignal(signal: AbortSignal): PromiseLike<QueueResponse>;
  };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isJob(value: unknown): value is DeletionJob & { status?: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as DeletionJob;
  return (
    [job.id, job.user_id, job.lease_token].every((id) => typeof id === "string" && uuid.test(id)) &&
    deletionPhases.includes(job.phase) &&
    typeof job.lease_until === "string" &&
    Number.isFinite(Date.parse(job.lease_until))
  );
}
function jobArgs(job: DeletionJob) {
  if (!isJob(job)) throw new DeletionStepError("worker_failed");
  return { _id: job.id, _lease: job.lease_token, _phase: job.phase };
}

/** Bind only a privileged server client. The installed RPCs deny ordinary members.
 * Constructing this adapter never enables the worker or starts a cleanup. */
export function createAccountDeletionQueue(db: AccountDeletionQueueDatabase): DeletionQueue {
  const call = async (name: QueueRpc, args?: Record<string, unknown>, signal?: AbortSignal) => {
    const deadline = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000);
    try {
      deadline.throwIfAborted();
      const result = await db.rpc(name, args).abortSignal(deadline);
      deadline.throwIfAborted();
      if (!result || result.error !== null || result.data === undefined) throw new Error();
      return result.data;
    } catch {
      // Provider/SQL error text can contain identities, URLs or credentials.
      throw new DeletionStepError(
        name === "account_access_coverage" ? "verification_failed" : "worker_failed",
      );
    }
  };
  return {
    async claim() {
      const rows = await call("claim_account_deletion");
      if (!Array.isArray(rows) || rows.length > 1) throw new DeletionStepError("worker_failed");
      if (!rows.length) return null;
      if (!isJob(rows[0]) || rows[0].status !== "processing")
        throw new DeletionStepError("worker_failed");
      const { id, user_id, phase, lease_token, lease_until } = rows[0];
      // Pass only the fixed job contract to phase adapters, never arbitrary row fields.
      return Object.freeze({ id, user_id, phase, lease_token, lease_until });
    },
    async assertBoundaries(signal) {
      const value = await call("account_access_coverage", undefined, signal);
      const expected = ["unguarded_functions", "unguarded_tables", "helper_privilege_gaps"];
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length !== expected.length ||
        !expected.every((key) => (value as Record<string, unknown>)[key] === 0)
      )
        throw new DeletionStepError("verification_failed");
    },
    async advance(job, done) {
      const args = jobArgs(job);
      if (typeof done !== "boolean") throw new DeletionStepError("worker_failed");
      const saved = await call("advance_account_deletion", { ...args, _done: done });
      if (typeof saved !== "boolean") throw new DeletionStepError("worker_failed");
      return saved;
    },
    async retry(job, code) {
      const args = jobArgs(job);
      if (!deletionFailureCodes.includes(code)) throw new DeletionStepError("worker_failed");
      const saved = await call("retry_account_deletion", { ...args, _code: code });
      if (typeof saved !== "boolean") throw new DeletionStepError("worker_failed");
      return saved;
    },
  };
}
