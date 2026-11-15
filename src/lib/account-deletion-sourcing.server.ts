import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";
import type { PrivateRecordErasureDatabase } from "./account-deletion-private-records.server.ts";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sources = new Set([
  "events",
  "quote_links",
  "quotes",
  "request_quotes",
  "request_events",
  "media",
  "requests",
]);

/** Bounded request/quote/event cleanup, before owned catalog removal.
 * No provider-byte erasure, Auth removal or whole-records-phase authority. */
export function createAccountDeletionSourcingErasure(db: PrivateRecordErasureDatabase) {
  async function call(supplied: DeletionJob, signal: AbortSignal, verify: boolean) {
    const code = verify ? "verification_failed" : "records_unavailable";
    try {
      const job = Object.freeze({
        id: supplied.id,
        user_id: supplied.user_id,
        lease_token: supplied.lease_token,
        phase: supplied.phase,
      });
      if (
        ![job.id, job.user_id, job.lease_token].every(
          (value) => typeof value === "string" && uuid.test(value),
        ) ||
        job.phase !== (verify ? "verification" : "records")
      )
        throw new Error();
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      deadline.throwIfAborted();
      const result = await db
        .rpc(verify ? "verify_account_deletion_sourcing" : "purge_account_deletion_sourcing", {
          _id: job.id,
          _user: job.user_id,
          _lease: job.lease_token,
          ...(verify ? {} : { _limit: 100 }),
        })
        .abortSignal(deadline)
        .retry(false);
      deadline.throwIfAborted();
      if (!result || result.error !== null || result.data === undefined) throw new Error();
      return result.data;
    } catch {
      throw new DeletionStepError(code);
    }
  }
  return {
    async step(job: DeletionJob, signal: AbortSignal) {
      const value = await call(job, signal, false);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new DeletionStepError("records_unavailable");
      const row = value as Record<string, unknown>;
      if (
        Object.keys(row).length !== 3 ||
        !(row.source === null || (typeof row.source === "string" && sources.has(row.source))) ||
        !Number.isSafeInteger(row.changed) ||
        (row.changed as number) < 0 ||
        (row.changed as number) > 100 ||
        typeof row.pass_done !== "boolean" ||
        (row.source === null) !== (row.changed === 0) ||
        (row.source === null && !row.pass_done)
      )
        throw new DeletionStepError("records_unavailable");
      return Object.freeze({
        source: row.source as string | null,
        changed: row.changed as number,
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
