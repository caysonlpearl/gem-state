import { open, constants, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  parseAndNormalizeInventoryCsv,
  inventorySnapshotRejection,
  recordsForDatabase,
} from "../../src/lib/dealer-inventory.ts";

export async function readStableSftpFile(path, now = Date.now()) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size === 0n || before.size > 5_000_000n)
      throw Error("invalid_file_size");
    const age = now - Number(before.mtimeMs);
    if (age < 120_000) return null;
    if (age > 72 * 60 * 60_000) throw Error("expired_delivery");
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (
      before.ino !== after.ino ||
      before.mtimeNs !== after.mtimeNs ||
      before.size !== after.size ||
      before.ino !== current.ino ||
      BigInt(bytes.length) !== before.size
    )
      return null;
    return {
      payload: bytes.toString("utf8"),
      receivedAt: new Date(Number(before.mtimeMs)).toISOString(),
      fingerprint: `${before.dev}:${before.ino}:${before.mtimeNs}:${before.size}:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  } finally {
    await file.close();
  }
}

export function inventoryDatabase(config, request = fetch) {
  const origin = new URL(config.url);
  if (origin.protocol !== "https:" || !origin.hostname.endsWith(".supabase.co"))
    throw Error("invalid_database_origin");
  return async (path, body) => {
    const response = await request(new URL(`/rest/v1/${path}`, origin), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Error(`database_http_${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

export async function importSftpSource(config, { database, now = Date.now() }) {
  if (!/^[0-9a-f-]{36}$/.test(config.sourceId)) throw Error("invalid_source_id");
  const source = (
    await database(
      `dealer_inventory_sources?id=eq.${config.sourceId}&select=id,source_type,file_format,status,mapping_profile,minimum_row_count`,
    )
  )[0];
  if (!source || source.source_type !== "sftp" || source.file_format !== "csv")
    throw Error("invalid_sftp_source");
  if (source.status === "paused") return { status: "skipped", reason: "source_paused" };
  const file = await readStableSftpFile(config.path, now);
  if (!file) return { status: "skipped", reason: "upload_in_progress" };
  const deliveryId = createHash("sha256").update(`${source.id}:${file.fingerprint}`).digest("hex");
  const prior = await database(
    `dealer_inventory_sync_runs?source_id=eq.${source.id}&source_checksum=eq.sftp-v1:${deliveryId}&status=eq.completed&select=id&limit=1`,
  );
  if (prior.length) return { status: "skipped", reason: "already_imported", runId: prior[0].id };
  const parsed = parseAndNormalizeInventoryCsv(file.payload, source.mapping_profile);
  if (inventorySnapshotRejection(parsed, source.minimum_row_count))
    throw Error(`snapshot_rejected_${parsed.errors.length}_validation_errors`);
  const result = await database("rpc/apply_sftp_inventory_delivery", {
    _source_id: source.id,
    _delivery_id: deliveryId,
    _filename: basename(config.path),
    _received_at: file.receivedAt,
    _records: recordsForDatabase(parsed.records),
  });
  return {
    ...result,
    received: parsed.rows.length,
    priced: parsed.records.filter((r) => r.priceCents > 0).length,
    unpriced: parsed.records.filter((r) => r.inventoryStatus === "invalid").length,
    photos: parsed.records.reduce((n, r) => n + r.media.length, 0),
  };
}
