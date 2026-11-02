import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildPhotoMigrationPlan } from "./photo-migration-plan.server.mjs";
import type { PhotoInventory, PhotoInventoryObject, PhotoMigrationStatus } from "./photo-migration";
import { getPhotoStorage } from "./photo-storage.server";
import { serverEnv } from "./runtime-env.server";

const permitSchema = z
  .object({
    runId: z.string().uuid(),
    inventorySha256: z.string().regex(/^[a-f0-9]{64}$/),
    maxGroups: z.number().int().min(1).max(20000),
    maxSourceBytes: z.number().int().min(1).max(5_000_000_000),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export function photoMigrationPermit(raw: string, runId: string, digest: string, now = Date.now()) {
  try {
    const value = permitSchema.parse(JSON.parse(raw));
    if (
      value.runId !== runId ||
      value.inventorySha256 !== digest ||
      Date.parse(value.expiresAt) <= now
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

function projectRef() {
  try {
    const url = new URL(serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL"));
    const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    if (url.protocol === "https:" && match) return match[1];
  } catch {
    /* Stop rather than guessing the deployment's source project. */
  }
  throw new Error("A verified source project is required for photo migration.");
}
function failureCode(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  return /source.*changed|ETag|receipt differs/i.test(text)
    ? "source-changed"
    : /source.*budget|download.*budget/i.test(text)
      ? "source-budget"
      : /storage.*budget/i.test(text)
        ? "photo-budget"
        : /thumbnail|preview|processing/i.test(text)
          ? "processing"
          : "copy-failed";
}

export function createPhotoMigrationRunner(
  db: SupabaseClient,
  actor: string,
  deps: {
    permit?: () => string;
    project?: () => string;
    store?: typeof getPhotoStorage;
  } = {},
) {
  const readPermit = deps.permit ?? (() => serverEnv("BLUEBIRD_PHOTO_MIGRATION_PERMIT"));
  const sourceProject = deps.project ?? projectRef;
  const store = deps.store ?? getPhotoStorage;
  async function rpc(name: string, args: Record<string, unknown>, timeout = 5000) {
    const { data, error } = await db
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(timeout))
      .retry(false);
    if (error) {
      if (name === "prepare_photo_migration")
        throw new Error(
          "Preparation was not confirmed. Refresh saved reviews before retrying; this operation does not copy photos.",
        );
      if (name === "reserve_photo_migration_download")
        throw new Error("Approved source download budget or lease is unavailable.");
      throw new Error("Photo transfer state is unavailable. Stop and review before retrying.");
    }
    return data;
  }
  function status(row: Record<string, unknown>): PhotoMigrationStatus {
    const id = String(row["id"]),
      digest = String(row["inventory_sha256"]);
    const permit = photoMigrationPermit(readPermit(), id, digest);
    return {
      id,
      projectRef: String(row["project_ref"]),
      digest,
      createdAt: String(row["created_at"]),
      totalGroups: Number(row["total_groups"]),
      totalSourceBytes: Number(row["total_source_bytes"]),
      sourceBytesReserved: Number(row["source_bytes_reserved"]),
      confirmedDownloadBytes: Number(row["confirmed_download_bytes"]),
      completedGroups: Number(row["completed_groups"]),
      failedGroups: Number(row["failed_groups"]),
      runningGroups: Number(row["running_groups"]),
      lastFailure: row["last_failure"] as string | null,
      permit: permit
        ? {
            maxGroups: permit.maxGroups,
            maxSourceBytes: permit.maxSourceBytes,
            expiresAt: permit.expiresAt,
          }
        : null,
    };
  }
  const columns =
    "id,project_ref,created_at,inventory_sha256,total_groups,total_source_bytes,source_bytes_reserved,confirmed_download_bytes,completed_groups,failed_groups,running_groups,last_failure";
  async function list() {
    const { data, error } = await db
      .from("photo_migration_runs")
      .select(columns)
      .eq("project_ref", sourceProject())
      .order("created_at", { ascending: false })
      .limit(5)
      .abortSignal(AbortSignal.timeout(3000))
      .retry(false);
    if (error) throw new Error("The photo-transfer review tables are not available yet.");
    return (data ?? []).map(status);
  }
  async function read(id: string) {
    const { data, error } = await db
      .from("photo_migration_runs")
      .select(columns)
      .eq("id", id)
      .abortSignal(AbortSignal.timeout(3000))
      .retry(false)
      .maybeSingle();
    if (error || !data || data.project_ref !== sourceProject())
      throw new Error("Photo-transfer review is unavailable for this source project.");
    return status(data);
  }
  async function prepare(inventory: PhotoInventory) {
    const plan = buildPhotoMigrationPlan(inventory, sourceProject());
    // A full metadata-ledger insert can outlast a small control request.
    // Copy leases and source reservations retain their shorter deadlines.
    const id = await rpc(
      "prepare_photo_migration",
      {
        _id: crypto.randomUUID(),
        _actor: actor,
        _project: plan.projectRef,
        _digest: plan.inventorySha256,
        _captured: plan.capturedAt,
        _groups: plan.groups,
      },
      20_000,
    );
    return read(String(id));
  }
  async function step(id: string, retry = false) {
    const run = await read(id);
    const rawPermit = readPermit();
    const permit = photoMigrationPermit(rawPermit, id, run.digest);
    if (!permit)
      throw new Error(
        "Photo copying is disabled. A matching, unexpired server permit is required.",
      );
    const lease = crypto.randomUUID();
    const result = await rpc("lease_photo_migration_item", {
      _run: id,
      _actor: actor,
      _lease: lease,
      _digest: run.digest,
      _max_groups: permit.maxGroups,
      _max_bytes: permit.maxSourceBytes,
      _expires: permit.expiresAt,
      _retry: retry,
    });
    if (result.state !== "leased")
      return {
        state: result.state as "busy" | "stopped" | "complete",
        reason: (result.reason ?? null) as string | null,
        status: await read(id),
      };
    const item = result.item as {
      ordinal: number;
      source_bytes: number;
      entries: PhotoInventoryObject[];
    };
    const identity = { _run: id, _ordinal: item.ordinal, _lease: lease, _actor: actor };
    try {
      const photos = await store(true);
      const ready = await Promise.all(
        [...new Set(item.entries.map((entry) => entry.bucket))].map((bucket) =>
          photos.available(bucket),
        ),
      );
      if (ready.some((value) => !value)) throw new Error("Private photo storage is unavailable.");
      const migrated = await photos.migrate(
        item.entries.map(({ bucket, path, ...expected }) => ({ bucket, path, expected })),
        item.source_bytes,
        undefined,
        async (bytes) => {
          if (readPermit() !== rawPermit || !photoMigrationPermit(readPermit(), id, run.digest))
            throw new Error("Source download budget permit changed or expired.");
          await rpc("reserve_photo_migration_download", {
            ...identity,
            _digest: run.digest,
            _max_bytes: permit.maxSourceBytes,
            _expires: permit.expiresAt,
            _bytes: bytes,
          });
        },
      );
      await rpc("finish_photo_migration_item", {
        ...identity,
        _downloaded: migrated.downloadedBytes,
      });
      return { state: "copied" as const, reason: null, status: await read(id) };
    } catch (error) {
      await rpc("fail_photo_migration_item", { ...identity, _reason: failureCode(error) });
      return { state: "stopped" as const, reason: null, status: await read(id) };
    }
  }
  return { list, prepare, step };
}
