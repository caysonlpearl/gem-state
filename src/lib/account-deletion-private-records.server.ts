import { DeletionStepError, type DeletionJob } from "./account-deletion-worker.ts";
const sources = new Set([
  "saved_search_matches",
  "mobile_push_outbox",
  "notifications",
  "mobile_push_devices",
  "mobile_message_receipts",
  "watchlist",
  "saved_partner_homes",
  "saved_partner_jobs",
  "saved_partner_vehicles",
  "saved_searches",
  "account_contact_preferences",
  "account_notification_preferences",
]);
type Response = { data: unknown; error: unknown };
export type PrivateRecordErasureDatabase = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): {
    abortSignal(signal: AbortSignal): { retry(enabled: boolean): PromiseLike<Response> };
  };
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
/** One private-records component. Financial/consent retention, public content,
 * shared conversations, analytics, media and identity still require their own steps. */
export function createAccountDeletionPrivateRecordErasure(db: PrivateRecordErasureDatabase) {
  async function call(job: DeletionJob, signal: AbortSignal, verify: boolean) {
    const code = verify ? "verification_failed" : "records_unavailable";
    const fail = () => new DeletionStepError(code);
    try {
      const target = Object.freeze({
        id: job.id,
        user_id: job.user_id,
        lease_token: job.lease_token,
        phase: job.phase,
      });
      if (
        ![target.id, target.user_id, target.lease_token].every(
          (id) => typeof id === "string" && uuid.test(id),
        ) ||
        (verify ? target.phase !== "verification" : !["records", "identity"].includes(target.phase))
      )
        throw fail();
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      deadline.throwIfAborted();
      const result = await db
        .rpc(
          verify
            ? "verify_account_deletion_private_records"
            : "purge_account_deletion_private_records",
          {
            _id: target.id,
            _user: target.user_id,
            _lease: target.lease_token,
            ...(verify ? {} : { _phase: target.phase, _limit: 100 }),
          },
        )
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
      if (
        !object(value) ||
        Object.keys(value).length !== 3 ||
        !(
          value.source === null ||
          (typeof value.source === "string" && sources.has(value.source))
        ) ||
        typeof value.deleted !== "number" ||
        !Number.isSafeInteger(value.deleted) ||
        value.deleted < 0 ||
        value.deleted > 100 ||
        (value.source === null) !== (value.deleted === 0) ||
        typeof value.pass_done !== "boolean" ||
        (value.source === null && !value.pass_done)
      )
        throw new DeletionStepError("records_unavailable");
      return Object.freeze({
        source: value.source as string | null,
        deleted: value.deleted,
        passDone: value.pass_done,
      });
    },
    async verify(job: DeletionJob, signal: AbortSignal): Promise<true> {
      if ((await call(job, signal, true)) !== true)
        throw new DeletionStepError("verification_failed");
      return true;
    },
  };
}
