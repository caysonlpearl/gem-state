import {
  createAccountDeletionReferenceInventory,
  type DeletionInventoryDatabase,
} from "./account-deletion-inventory.server";
import {
  createAccountDeletionSupabaseInventory,
  type DeletionStorageBucket,
} from "./account-deletion-supabase-inventory.server";
import { DeletionStepError, type DeletionJob } from "./account-deletion-worker";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const failed = () => new DeletionStepError("inventory_unavailable");
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export type DeletionStorageInventoryProgress = Readonly<{
  stage: "references" | "supabase_versions";
  passDone: boolean;
  objects: number;
}>;

/** Bind database discovery and version-aware provider pages. This is one part
 * of the full inventory phase: R2, shared ownership, late copies, reconciliation
 * and erasure verification remain separate. It never returns a phase `done`. */
export function createAccountDeletionStorageInventory(
  db: DeletionInventoryDatabase,
  supplied: { url: string; serviceKey: string },
  fetcher: typeof fetch = fetch,
) {
  let config: Readonly<{ url: string; serviceKey: string }>;
  let validated: ReturnType<typeof createAccountDeletionSupabaseInventory>;
  try {
    config = Object.freeze({ url: supplied.url, serviceKey: supplied.serviceKey });
    validated = createAccountDeletionSupabaseInventory(config, async () => true, fetcher);
  } catch {
    throw failed();
  }
  const reference = createAccountDeletionReferenceInventory(db);
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
    ): Promise<DeletionStorageInventoryProgress> {
      try {
        const job = Object.freeze({
          id: suppliedJob.id,
          user_id: suppliedJob.user_id,
          phase: suppliedJob.phase,
          lease_token: suppliedJob.lease_token,
          lease_until: suppliedJob.lease_until,
        });
        const refs = await reference.scan(job, signal);
        if (!refs.passDone)
          return Object.freeze({ stage: "references", passDone: false, objects: 0 });
        const args = { _id: job.id, _user: job.user_id, _lease: job.lease_token };
        const prepared = await rpc("prepare_account_deletion_storage_inventory", args, signal);
        if (
          !isObject(prepared) ||
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
            stage: "supabase_versions",
            passDone: prepared["pass_done"],
            objects: 0,
          });
        }
        const row = prepared["target"];
        if (
          !isObject(row) ||
          prepared["pass_done"] !== false ||
          Object.keys(row).length !== 7 ||
          typeof row["id"] !== "string" ||
          !uuid.test(row["id"]) ||
          !Number.isSafeInteger(row["generation"]) ||
          (row["generation"] as number) < 1 ||
          !Number.isSafeInteger(row["page"]) ||
          (row["page"] as number) < 0 ||
          typeof row["bucket"] !== "string" ||
          typeof row["path"] !== "string" ||
          typeof row["store_fingerprint"] !== "string" ||
          (row["cursor"] !== null && typeof row["cursor"] !== "string")
        )
          throw failed();
        const task = Object.freeze({
          id: row["id"],
          generation: row["generation"] as number,
          page: row["page"] as number,
          bucket: row["bucket"] as DeletionStorageBucket,
          path: row["path"],
          storeFingerprint: row["store_fingerprint"],
          cursor: row["cursor"] as string | null,
        });
        if (task.storeFingerprint !== validated.fingerprint(task.bucket)) throw failed();
        const context = { ...args, _task: task.id, _generation: task.generation, _page: task.page };
        const provider = createAccountDeletionSupabaseInventory(
          config,
          async (target, deadline) => {
            if (
              target.bucket !== task.bucket ||
              target.path !== task.path ||
              target.storeFingerprint !== task.storeFingerprint
            )
              throw failed();
            if ((await rpc("account_deletion_storage_task_current", context, deadline)) !== true)
              throw failed();
            return true;
          },
          fetcher,
        );
        const page = await provider.scan(task, signal, task.cursor);
        const saved = await rpc(
          "commit_account_deletion_storage_page",
          {
            ...context,
            _cursor: task.cursor,
            _objects: page.objects,
            _next_cursor: page.nextCursor,
            _done: page.done,
          },
          signal,
        );
        if (saved !== true) throw failed();
        return Object.freeze({
          stage: "supabase_versions",
          passDone: false,
          objects: page.objects.length,
        });
      } catch {
        throw failed();
      }
    },
  };
}
