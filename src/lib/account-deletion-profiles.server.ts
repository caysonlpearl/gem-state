import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";
import type { PrivateRecordErasureDatabase } from "./account-deletion-private-records.server.ts";

const sources = new Set([
  "profiles",
  "seller_profiles",
  "shopper_service_profiles",
  "shopper_coverage",
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Owned profile rows only. A component pass cannot advance the whole records
 * phase, erase media, approve financial retention or remove an Auth identity. */
export function createAccountDeletionProfileErasure(db: PrivateRecordErasureDatabase) {
  async function call(supplied: DeletionJob, signal: AbortSignal, verify: boolean) {
    const fail = () =>
      new DeletionStepError(verify ? "verification_failed" : "records_unavailable");
    try {
      const job = Object.freeze({
        id: supplied.id,
        user_id: supplied.user_id,
        phase: supplied.phase,
        lease_token: supplied.lease_token,
      });
      if (
        ![job.id, job.user_id, job.lease_token].every(
          (v) => typeof v === "string" && uuid.test(v),
        ) ||
        (verify ? job.phase !== "verification" : !["records", "identity"].includes(job.phase))
      )
        throw fail();
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      deadline.throwIfAborted();
      const result = await db
        .rpc(verify ? "verify_account_deletion_profiles" : "purge_account_deletion_profiles", {
          _id: job.id,
          _user: job.user_id,
          _lease: job.lease_token,
          ...(verify ? {} : { _phase: job.phase, _limit: 100 }),
        })
        .abortSignal(deadline)
        .retry(false);
      deadline.throwIfAborted();
      if (!result || result.error !== null || result.data === undefined) throw fail();
      return result.data;
    } catch {
      throw fail();
    }
  }
  return {
    async step(
      job: DeletionJob,
      signal: AbortSignal,
    ): Promise<Readonly<{ source: string | null; deleted: number; passDone: boolean }>> {
      const value = await call(job, signal, false);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new DeletionStepError("records_unavailable");
      const row = value as Record<string, unknown>;
      if (
        Object.keys(row).length !== 3 ||
        !(row.source === null || (typeof row.source === "string" && sources.has(row.source))) ||
        !Number.isSafeInteger(row.deleted) ||
        (row.deleted as number) < 0 ||
        (row.deleted as number) > 100 ||
        typeof row.pass_done !== "boolean" ||
        (row.source === null) !== (row.deleted === 0) ||
        (row.source === null && !row.pass_done)
      )
        throw new DeletionStepError("records_unavailable");
      return Object.freeze({
        source: row.source as string | null,
        deleted: row.deleted as number,
        passDone: row.pass_done,
      });
    },
    async verify(job: DeletionJob, signal: AbortSignal): Promise<true> {
      if ((await call(job, signal, true)) !== true)
        throw new DeletionStepError("verification_failed");
      return true;
    },
  };
}
