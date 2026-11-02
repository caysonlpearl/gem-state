import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { buildPhotoMigrationPlan } from "./photo-migration-plan.server.mjs";
import { MAX_PREPARED_MIGRATION_SOURCE_BYTES } from "./photo-migration";
import type {
  PhotoInventory,
  PhotoInventoryObject,
  PhotoMigrationStatus,
  PreparedMigrationPreview,
} from "./photo-migration";
import { MAX_THUMBNAIL_BYTES, canonicalPhotoEtag } from "./photo-storage";
import { getPhotoStorage, createSupabasePhotoSource } from "./photo-storage.server";
import type { PhotoSource } from "./photo-storage-core.server";
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
type PhotoMigrationLease = {
  run_id: string;
  ordinal: number;
  status: string;
  lease_token: string;
  lease_until: string | null;
  source_bytes: number;
  lease_source_reserved: boolean;
  entries: PhotoInventoryObject[];
};
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
    previewSource?: () => Pick<PhotoSource, "sign">;
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
      if (name === "finish_photo_migration_item")
        throw new Error(
          "Copy completion was not confirmed. Refresh saved state before continuing.",
        );
      if (name === "lease_photo_migration_item")
        throw new Error("Copy lease was not confirmed. Refresh saved state before continuing.");
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
    if (error)
      throw new Error(
        "Saved photo-transfer reviews could not be read. Refresh saved reviews before continuing.",
      );
    return (data ?? []).map(status);
  }
  async function read(id: string) {
    let data: Record<string, unknown> | null = null;
    // Retry only this read-only SELECT, never a lease, source GET or copy step.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await db
          .from("photo_migration_runs")
          .select(columns)
          .eq("id", id)
          .abortSignal(AbortSignal.timeout(3000))
          .retry(false)
          .maybeSingle();
        if (result.error) throw result.error;
        data = result.data;
        break;
      } catch {
        if (attempt === 1)
          throw new Error(
            "Saved photo-transfer state could not be read. Refresh state before continuing.",
          );
      }
    }
    if (!data || data.project_ref !== sourceProject())
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
  async function confirmedLease(id: string, lease: string) {
    // Observe the exact token from this request. Never acquire another lease to
    // recover an acknowledgement, and never continue from a different token.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await db
          .from("photo_migration_items")
          .select(
            "run_id,ordinal,status,lease_token,lease_until,source_bytes,lease_source_reserved,entries",
          )
          .eq("run_id", id)
          .eq("lease_token", lease)
          .abortSignal(AbortSignal.timeout(3000))
          .retry(false)
          .maybeSingle();
        if (error) throw error;
        return data?.run_id === id && data.lease_token === lease
          ? (data as PhotoMigrationLease)
          : null;
      } catch {
        if (attempt === 1)
          throw new Error(
            "Saved copy lease could not be read. Refresh saved state before continuing.",
          );
      }
    }
    return null;
  }
  async function preparePreview(id: string) {
    const run = await read(id);
    const rawPermit = readPermit();
    const permit = photoMigrationPermit(rawPermit, id, run.digest);
    if (!permit) throw new Error("A matching, unexpired photo-copy permit is required.");
    // This mutation is never retried. The reservation remains charged if the
    // acknowledgement, signing or browser download fails.
    const item = (await rpc("reserve_photo_migration_preview", {
      _run: id,
      _actor: actor,
      _digest: run.digest,
      _max_groups: permit.maxGroups,
      _max_bytes: permit.maxSourceBytes,
      _expires: permit.expiresAt,
    })) as { ordinal: number; sourceBytes: number; entries: PhotoInventoryObject[] };
    const first = item.entries.find((entry) => entry.bucket === "listing-media") ?? item.entries[0];
    if (!first || first.bytes !== item.sourceBytes || !canonicalPhotoEtag(first.etag))
      throw new Error("Preview source metadata is incomplete. Stop and review.");
    // Always read the retained source here, independently of the serving mode.
    // Browser preparation must not require enabling R2 GET CORS/public access.
    const source = deps.previewSource?.() ?? createSupabasePhotoSource(db);
    const seconds = Math.min(60, Math.floor((Date.parse(permit.expiresAt) - Date.now()) / 1000));
    if (seconds < 1 || rawPermit !== readPermit())
      throw new Error("Photo-copy approval changed or expired.");
    const urls = await source.sign(first.bucket, [first.path], seconds, false);
    const url = urls.get(first.path);
    if (!url || rawPermit !== readPermit() || !photoMigrationPermit(readPermit(), id, run.digest))
      throw new Error("Preview source could not be prepared under the current approval.");
    return {
      ordinal: item.ordinal,
      sourceEtag: canonicalPhotoEtag(first.etag)!,
      bytes: first.bytes,
      contentType: first.contentType,
      url,
    };
  }
  async function step(id: string, retry = false, preparedPreview?: PreparedMigrationPreview) {
    let thumbnail;
    let preparedSource: Uint8Array | undefined;
    if (preparedPreview) {
      if (!retry) throw new Error("Prepared previews are only accepted for an explicit retry.");
      if (preparedPreview.sourceBase64 !== undefined) {
        if (
          preparedPreview.sourceBase64.length >
          4 * Math.ceil(MAX_PREPARED_MIGRATION_SOURCE_BYTES / 3)
        )
          throw new Error("Prepared source exceeds its size limit.");
        preparedSource = Uint8Array.from(Buffer.from(preparedPreview.sourceBase64, "base64"));
        if (!preparedSource.length || preparedSource.length > MAX_PREPARED_MIGRATION_SOURCE_BYTES)
          throw new Error("Prepared source exceeds its size limit.");
      }
      const bytes = Uint8Array.from(Buffer.from(preparedPreview.base64, "base64"));
      if (!bytes.length || bytes.length > MAX_THUMBNAIL_BYTES)
        throw new Error("Prepared preview exceeds its size limit.");
      const { makePhotoThumbnail } = await import("./photo-thumbnail.server");
      // Re-decode the small preview on the server. Original decoding remains
      // bounded at 8MP; client-supplied dimensions or MIME are never trusted.
      thumbnail = await makePhotoThumbnail(bytes, preparedPreview.contentType);
    }
    const run = await read(id);
    const rawPermit = readPermit();
    const permit = photoMigrationPermit(rawPermit, id, run.digest);
    if (!permit)
      throw new Error(
        "Photo copying is disabled. A matching, unexpired server permit is required.",
      );
    const lease = crypto.randomUUID();
    let result;
    try {
      result = await rpc("lease_photo_migration_item", {
        _run: id,
        _actor: actor,
        _lease: lease,
        _digest: run.digest,
        _max_groups: permit.maxGroups,
        _max_bytes: permit.maxSourceBytes,
        _expires: permit.expiresAt,
        _retry: retry,
      });
    } catch (error) {
      const saved = await confirmedLease(id, lease);
      if (
        !saved ||
        saved.status !== "running" ||
        Date.parse(saved.lease_until ?? "") <= Date.now() ||
        !Number.isFinite(Date.parse(saved.lease_until ?? "")) ||
        !Number.isInteger(saved.ordinal) ||
        saved.ordinal < 0 ||
        saved.ordinal >= permit.maxGroups ||
        readPermit() !== rawPermit ||
        !photoMigrationPermit(readPermit(), id, run.digest)
      )
        throw error;
      result = { state: "leased", item: saved };
    }
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
    let downloadedBytes: number;
    try {
      if (
        preparedPreview &&
        (preparedPreview.ordinal !== item.ordinal ||
          item.entries.some(
            (entry) => canonicalPhotoEtag(entry.etag) !== preparedPreview.sourceEtag,
          ))
      )
        throw new Error("Prepared preview source changed. Stop and review.");
      if (preparedSource && preparedSource.byteLength !== item.source_bytes)
        throw new Error("Prepared source photo size changed.");
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
        thumbnail,
        async (bytes) => {
          if (readPermit() !== rawPermit || !photoMigrationPermit(readPermit(), id, run.digest))
            throw new Error("Source download budget permit changed or expired.");
          const args = {
            ...identity,
            _digest: run.digest,
            _max_bytes: permit.maxSourceBytes,
            _expires: permit.expiresAt,
            _bytes: bytes,
          };
          if (preparedSource) {
            // The browser preparation was already charged. No second source
            // GET, refund or new allowance; acknowledge only this exact lease.
            try {
              await rpc("acknowledge_photo_migration_prepared_source", {
                ...args,
                _max_groups: permit.maxGroups,
              });
            } catch (error) {
              const saved = await confirmedLease(id, lease);
              if (
                !saved ||
                saved.ordinal !== item.ordinal ||
                saved.status !== "running" ||
                !saved.lease_source_reserved ||
                saved.source_bytes !== bytes ||
                !Number.isFinite(Date.parse(saved.lease_until ?? "")) ||
                Date.parse(saved.lease_until ?? "") <= Date.now() ||
                readPermit() !== rawPermit ||
                !photoMigrationPermit(readPermit(), id, run.digest)
              )
                throw error;
            }
          } else {
            await rpc("reserve_photo_migration_download", args);
          }
        },
        preparedSource,
      );
      downloadedBytes = migrated.downloadedBytes;
    } catch (error) {
      await rpc("fail_photo_migration_item", { ...identity, _reason: failureCode(error) });
      return { state: "stopped" as const, reason: null, status: await read(id) };
    }
    // A missing completion acknowledgement or subsequent status read is not a
    // failed photo copy. Leave uncertain leases/receipts for saved-state review.
    try {
      await rpc("finish_photo_migration_item", { ...identity, _downloaded: downloadedBytes });
    } catch (error) {
      const saved = await confirmedLease(id, lease);
      if (!saved || saved.ordinal !== item.ordinal || saved.status !== "complete") throw error;
    }
    return { state: "copied" as const, reason: null, status: await read(id) };
  }
  return { list, prepare, preparePreview, step };
}
