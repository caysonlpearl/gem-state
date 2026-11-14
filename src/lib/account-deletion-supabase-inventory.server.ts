import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { DeletionStepError } from "./account-deletion-worker";

export const deletionStorageBuckets = [
  "listing-media",
  "ask-evidence",
  "catalog-media",
  "request-media",
  "order-evidence",
  "profile-avatars",
  "seller-avatars",
  "shopper-avatars",
  "shopper-documents",
  "job-application-resumes",
  "conversation-attachments",
] as const;
export type DeletionStorageBucket = (typeof deletionStorageBuckets)[number];
export type DeletionStorageTarget = Readonly<{
  bucket: DeletionStorageBucket;
  path: string;
  storeFingerprint: string;
}>;
export type DeletionStorageVersion = Readonly<{
  objectId: string;
  key: string;
  versionId: string | null;
  bytes: number | null;
  archivedAt: string | null;
  deleteMarker: boolean | null;
  versioned: boolean | null;
}>;
export type DeletionStorageVersionPage = Readonly<{
  objects: readonly DeletionStorageVersion[];
  nextCursor: string | null;
  done: boolean;
}>;
const unavailable = () => new DeletionStepError("inventory_unavailable");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const cursorValid = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 4096 &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Read-only, version-aware Storage transport. Its caller must authorize the
 * live job and private target before/after the request. A page is discovery,
 * never proof of ownership, provider reconciliation or permission to erase. */
export function createAccountDeletionSupabaseInventory(
  supplied: { url: string; serviceKey: string },
  authorize: (target: DeletionStorageTarget, signal: AbortSignal) => Promise<true>,
  fetcher: typeof fetch = fetch,
) {
  let origin: string, key: string;
  try {
    const url = supplied?.url,
      suppliedKey = supplied?.serviceKey;
    if (
      typeof url !== "string" ||
      typeof suppliedKey !== "string" ||
      suppliedKey.length > 16384 ||
      typeof authorize !== "function" ||
      /[\r\n]/.test(suppliedKey)
    )
      throw unavailable();
    key = suppliedKey;
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      throw unavailable();
    origin = parsed.origin;
    if (!/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key)) {
      const pieces = key.split(".");
      if (pieces.length !== 3) throw unavailable();
      const claims = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8"));
      // This prevents accidental use of an anonymous/member credential. The
      // provider verifies the actual key/signature; this is not authentication.
      if (claims.role !== "service_role" || claims.ref !== parsed.hostname.split(".")[0])
        throw unavailable();
    }
  } catch {
    throw unavailable();
  }
  function bucket(value: string): DeletionStorageBucket {
    if (!(deletionStorageBuckets as readonly string[]).includes(value)) throw unavailable();
    return value as DeletionStorageBucket;
  }
  const fingerprint = (value: string) => hash(`supabase-inventory-v1\n${origin}\n${bucket(value)}`);

  return {
    fingerprint,
    async scan(
      suppliedTarget: DeletionStorageTarget,
      parentSignal: AbortSignal,
      cursor: string | null = null,
      limit = 50,
    ): Promise<DeletionStorageVersionPage> {
      try {
        const target = Object.freeze({
          bucket: bucket(suppliedTarget.bucket),
          path: suppliedTarget.path,
          storeFingerprint: suppliedTarget.storeFingerprint,
        });
        // This is an authoritative literal Storage key, passed in a JSON body;
        // it is never interpreted as a URL or normalized as a filesystem path.
        if (
          typeof target.path !== "string" ||
          !target.path ||
          Buffer.byteLength(target.path) > 1024 ||
          target.path.includes("\u0000") ||
          target.storeFingerprint !== fingerprint(target.bucket) ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 100 ||
          (cursor !== null && !cursorValid(cursor))
        )
          throw unavailable();
        const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(15000)]);
        const authorized = async () => {
          signal.throwIfAborted();
          if ((await authorize(target, signal)) !== true) throw unavailable();
          signal.throwIfAborted();
        };
        await authorized();
        const endpoint = `${origin}/storage/v1/object/list-v2/${target.bucket}`;
        const client = createClient(origin, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: {
            fetch: async (input, init) => {
              const request = new Request(input, {
                ...init,
                signal,
                redirect: "error",
                cache: "no-store",
              });
              if (request.url !== endpoint || request.method !== "POST") throw unavailable();
              const response = await fetcher(request);
              if (
                response.status !== 200 ||
                response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
                  "application/json" ||
                !response.body
              ) {
                await response.body?.cancel();
                throw unavailable();
              }
              const reader = response.body.getReader(),
                chunks: Uint8Array[] = [];
              let size = 0,
                complete = false;
              const cancel = () => {
                void reader.cancel().catch(() => undefined);
              };
              signal.addEventListener("abort", cancel, { once: true });
              try {
                while (true) {
                  signal.throwIfAborted();
                  const part = await reader.read();
                  signal.throwIfAborted();
                  if (part.done) {
                    complete = true;
                    break;
                  }
                  size += part.value.byteLength;
                  if (size > 1024 * 1024) throw unavailable();
                  chunks.push(part.value);
                }
                const bytes = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                  bytes.set(chunk, offset);
                  offset += chunk.byteLength;
                }
                return new Response(bytes, {
                  status: 200,
                  headers: { "content-type": "application/json", "cache-control": "no-store" },
                });
              } finally {
                signal.removeEventListener("abort", cancel);
                if (!complete) await reader.cancel().catch(() => undefined);
                reader.releaseLock();
              }
            },
          },
        });
        const { data, error } = await client.storage.from(target.bucket).listV2(
          {
            prefix: target.path,
            exactMatch: true,
            with_delimiter: false,
            limit,
            noncurrentVersions: "include",
            deleteMarkers: "include",
            sortBy: { column: "name", order: "asc" },
            ...(cursor === null ? {} : { cursor }),
          },
          { signal, cache: "no-store" },
        );
        signal.throwIfAborted();
        if (
          error !== null ||
          !object(data) ||
          typeof data["hasNext"] !== "boolean" ||
          !Array.isArray(data["objects"]) ||
          data["objects"].length > limit ||
          !Array.isArray(data["folders"]) ||
          data["folders"].length !== 0
        )
          throw unavailable();
        const done = !data["hasNext"];
        const next = data["nextCursor"];
        if (
          (!done && (!cursorValid(next) || next === cursor)) ||
          (done && next !== undefined && next !== null && next !== "")
        )
          throw unavailable();
        const ids = new Set<string>();
        const versions = data["objects"].map((row): DeletionStorageVersion => {
          if (
            !object(row) ||
            typeof row["id"] !== "string" ||
            !uuid.test(row["id"]) ||
            (row["key"] ?? row["name"]) !== target.path
          )
            throw unavailable();
          const version = row["version"] ?? null;
          if (
            version !== null &&
            (typeof version !== "string" || !/^[A-Za-z0-9._-]{1,256}$/.test(version))
          )
            throw unavailable();
          const id = JSON.stringify([row["id"], version]);
          if (ids.has(id)) throw unavailable();
          ids.add(id);
          const size = object(row["metadata"]) ? (row["metadata"]["size"] ?? null) : null;
          if (size !== null && (!Number.isSafeInteger(size) || size < 0)) throw unavailable();
          const archived = row["archived_at"] ?? null;
          if (
            archived !== null &&
            (typeof archived !== "string" ||
              archived.length > 40 ||
              !Number.isFinite(Date.parse(archived)))
          )
            throw unavailable();
          for (const flag of ["is_delete_marker", "is_versioned"]) {
            if (row[flag] !== undefined && row[flag] !== null && typeof row[flag] !== "boolean")
              throw unavailable();
          }
          return Object.freeze({
            objectId: row["id"],
            key: target.path,
            versionId: version,
            bytes: size,
            archivedAt: archived === null ? null : new Date(archived).toISOString(),
            deleteMarker: row["is_delete_marker"] ?? null,
            versioned: row["is_versioned"] ?? null,
          });
        });
        await authorized();
        return Object.freeze({
          objects: Object.freeze(versions),
          nextCursor: done ? null : (next as string),
          done,
        });
      } catch {
        throw unavailable();
      }
    },
  };
}
