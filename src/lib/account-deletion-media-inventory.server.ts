import {
  createAccountDeletionStorageInventory,
  type DeletionStorageInventoryProgress,
} from "./account-deletion-storage-inventory.server";
import { createAccountDeletionR2Inventory } from "./account-deletion-r2-inventory.server";
import type { DeletionInventoryDatabase } from "./account-deletion-inventory.server";
import { DeletionStepError, type DeletionJob } from "./account-deletion-worker";
import type { R2PhotoConfig } from "./r2-photo-storage.server";
import type { PhotoBucket } from "./photo-storage";

const failed = () => new DeletionStepError("inventory_unavailable");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Shared bounded discovery: database references, Supabase versions, then R2
 * hash copies. A finished pass is not stable closure or a deletion-phase done.
 * Ownership, retention, late/incomplete uploads and final verification remain
 * mandatory before anything can be erased. No request route schedules this. */
export function createAccountDeletionMediaInventory(
  db: DeletionInventoryDatabase,
  supplied: { supabase: { url: string; serviceKey: string }; r2: R2PhotoConfig },
  fetcher: typeof fetch = fetch,
) {
  let config: R2PhotoConfig;
  let storage: ReturnType<typeof createAccountDeletionStorageInventory>;
  let validated: ReturnType<typeof createAccountDeletionR2Inventory>;
  try {
    storage = createAccountDeletionStorageInventory(db, supplied.supabase, fetcher);
    config = Object.freeze({ ...supplied.r2, buckets: Object.freeze({ ...supplied.r2.buckets }) });
    validated = createAccountDeletionR2Inventory(config, async () => true, fetcher);
  } catch {
    throw failed();
  }
  const rpc = async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    try {
      deadline.throwIfAborted();
      const result = await db.rpc(name, args).abortSignal(deadline);
      deadline.throwIfAborted();
      if (!result || result.error !== null || result.data === undefined) throw failed();
      return result.data;
    } catch {
      throw failed();
    }
  };
  return {
    async step(
      suppliedJob: DeletionJob,
      signal: AbortSignal,
    ): Promise<
      | DeletionStorageInventoryProgress
      | Readonly<{
          stage: "r2_hash_copies";
          passDone: boolean;
          objects: number;
        }>
    > {
      try {
        const job = Object.freeze({
          id: suppliedJob.id,
          user_id: suppliedJob.user_id,
          phase: suppliedJob.phase,
          lease_token: suppliedJob.lease_token,
          lease_until: suppliedJob.lease_until,
        });
        const previous = await storage.step(job, signal);
        if (previous.stage !== "supabase_versions" || !previous.passDone) return previous;
        const args = { _id: job.id, _user: job.user_id, _lease: job.lease_token };
        const prepared = await rpc("prepare_account_deletion_r2_inventory", args, signal);
        if (
          !object(prepared) ||
          Object.keys(prepared).length !== 3 ||
          !Number.isSafeInteger(prepared["prepared"]) ||
          (prepared["prepared"] as number) < 0 ||
          (prepared["prepared"] as number) > 50 ||
          typeof prepared["pass_done"] !== "boolean" ||
          !Object.hasOwn(prepared, "target")
        )
          throw failed();
        if (prepared["target"] === null) {
          if (prepared["prepared"] !== 0) throw failed();
          return Object.freeze({
            stage: "r2_hash_copies",
            passDone: prepared["pass_done"],
            objects: 0,
          });
        }
        const row = prepared["target"];
        if (
          !object(row) ||
          Object.keys(row).length !== 9 ||
          prepared["pass_done"] !== false ||
          typeof row["id"] !== "string" ||
          !uuid.test(row["id"]) ||
          !Number.isSafeInteger(row["generation"]) ||
          (row["generation"] as number) < 1 ||
          !Number.isSafeInteger(row["page"]) ||
          (row["page"] as number) < 0 ||
          typeof row["bucket"] !== "string" ||
          typeof row["path"] !== "string" ||
          typeof row["path_hash"] !== "string" ||
          (row["variant"] !== "original" && row["variant"] !== "thumbnail") ||
          typeof row["store_fingerprint"] !== "string" ||
          (row["cursor"] !== null && typeof row["cursor"] !== "string")
        )
          throw failed();
        const task = Object.freeze({
          id: row["id"],
          generation: row["generation"] as number,
          page: row["page"] as number,
          bucket: row["bucket"] as PhotoBucket,
          path: row["path"],
          pathHash: row["path_hash"],
          variant: row["variant"],
          storeFingerprint: row["store_fingerprint"],
          cursor: row["cursor"] as string | null,
        });
        if (task.storeFingerprint !== validated.fingerprint(task.bucket)) throw failed();
        const context = { ...args, _task: task.id, _generation: task.generation, _page: task.page };
        const provider = createAccountDeletionR2Inventory(
          config,
          async (target, deadline) => {
            if (
              target.bucket !== task.bucket ||
              target.path !== task.path ||
              target.pathHash !== task.pathHash ||
              target.variant !== task.variant ||
              target.storeFingerprint !== task.storeFingerprint ||
              (await rpc("account_deletion_r2_task_current", context, deadline)) !== true
            )
              throw failed();
            return true;
          },
          fetcher,
        );
        const page = await provider.scan(task, signal, task.cursor);
        if (
          (await rpc(
            "commit_account_deletion_r2_page",
            {
              ...context,
              _cursor: task.cursor,
              _objects: page.objects,
              _next_cursor: page.nextCursor,
              _done: page.done,
            },
            signal,
          )) !== true
        )
          throw failed();
        return Object.freeze({
          stage: "r2_hash_copies",
          passDone: false,
          objects: page.objects.length,
        });
      } catch {
        throw failed();
      }
    },
  };
}
