import type { DeletionInventoryDatabase } from "./account-deletion-inventory.server";
import { DeletionStepError, type DeletionJob } from "./account-deletion-worker";

const sources = [
  "shopping_events",
  "shopping_choices",
  "shopping_favorites",
  "shopping_experiments",
  "shopping_ad_outbox",
  "shopping_privacy",
];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Erases one bounded chunk of owned shopping data. This is a records/identity
 * component, not a complete phase adapter. Financial/consent retention, other
 * account records and provider/media cleanup remain separate requirements. */
export function createAccountDeletionShoppingErasure(db: DeletionInventoryDatabase) {
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
          (value) => typeof value === "string" && uuid.test(value),
        ) ||
        (verify ? target.phase !== "verification" : !["records", "identity"].includes(target.phase))
      )
        throw fail();
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
      deadline.throwIfAborted();
      const result = await db
        .rpc(verify ? "verify_account_deletion_shopping" : "purge_account_deletion_shopping", {
          _id: target.id,
          _user: target.user_id,
          _lease: target.lease_token,
          ...(verify ? {} : { _phase: target.phase, _limit: 100 }),
        })
        .abortSignal(deadline);
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
      const data = await call(job, signal, false);
      if (
        !object(data) ||
        Object.keys(data).length !== 3 ||
        !(
          data["source"] === null ||
          (typeof data["source"] === "string" && sources.includes(data["source"]))
        ) ||
        typeof data["deleted"] !== "number" ||
        !Number.isSafeInteger(data["deleted"]) ||
        data["deleted"] < 0 ||
        data["deleted"] > 100 ||
        (data["source"] === null) !== (data["deleted"] === 0) ||
        typeof data["pass_done"] !== "boolean"
      )
        throw new DeletionStepError("records_unavailable");
      return Object.freeze({
        source: data["source"] as string | null,
        deleted: data["deleted"],
        passDone: data["pass_done"],
      });
    },
    async verify(job: DeletionJob, signal: AbortSignal): Promise<true> {
      if ((await call(job, signal, true)) !== true)
        throw new DeletionStepError("verification_failed");
      return true;
    },
  };
}
