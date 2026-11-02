import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PHOTO_BUCKETS = new Set(["listing-media", "ask-evidence"]);

function fail(message) {
  throw new Error(`Invalid photo inventory: ${message}`);
}

function normalizeObject(row) {
  if (!row || typeof row !== "object") fail("object row is missing");
  if (!PHOTO_BUCKETS.has(row.bucket)) fail("unexpected source bucket");
  if (
    typeof row.path !== "string" ||
    !row.path ||
    row.path.startsWith("/") ||
    /[\\\u0000-\u001f\u007f]/.test(row.path) ||
    row.path.split("/").some((part) => !part || part === "." || part === "..")
  )
    fail("unsafe or empty object path");
  if (!Number.isSafeInteger(row.bytes) || row.bytes <= 0) fail("object size is missing");
  if (typeof row.contentType !== "string" || !/^image\/[a-z0-9.+-]+$/i.test(row.contentType))
    fail("object content type is not an image");
  if (typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt)))
    fail("object modification timestamp is missing");
  // An ETag is metadata, not a verified SHA-256. Missing ETags simply disable
  // the proposed paired-download saving; they never imply identical bytes.
  const etag = typeof row.etag === "string" ? row.etag.trim().replace(/^"|"$/g, "") : null;
  return {
    bucket: row.bucket,
    path: row.path,
    bytes: row.bytes,
    etag: etag || null,
    contentType: row.contentType.toLowerCase(),
    updatedAt: row.updatedAt,
  };
}

/** Metadata-only preflight. It deliberately has no network or deletion code. */
export function buildPhotoMigrationPlan(inventory, expectedProject, now = new Date()) {
  if (!/^[a-z0-9]{20}$/.test(expectedProject ?? "")) fail("expected project is required");
  if (inventory?.schemaVersion !== 1 || inventory.projectRef !== expectedProject)
    fail("schema or project does not match");
  if (
    typeof inventory.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(inventory.capturedAt))
  )
    fail("capture timestamp is missing");
  if (!Array.isArray(inventory.objects) || inventory.objects.length === 0)
    fail("no photo objects were exported");
  const objects = inventory.objects
    .map(normalizeObject)
    .sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`, "en"));
  const seen = new Set();
  const paths = new Map();
  const buckets = {};
  let totalBytes = 0;
  for (const object of objects) {
    const id = `${object.bucket}/${object.path}`;
    if (seen.has(id)) fail("duplicate bucket/path row");
    seen.add(id);
    totalBytes += object.bytes;
    if (!Number.isSafeInteger(totalBytes)) fail("total size exceeds safe precision");
    buckets[object.bucket] ??= { objects: 0, bytes: 0 };
    buckets[object.bucket].objects++;
    buckets[object.bucket].bytes += object.bytes;
    const atPath = paths.get(object.path) ?? [];
    atPath.push(object);
    paths.set(object.path, atPath);
  }
  const groups = [];
  for (const atPath of paths.values()) {
    const [first, second] = atPath;
    const paired =
      atPath.length === 2 &&
      first.bucket !== second.bucket &&
      first.etag !== null &&
      first.etag === second.etag &&
      first.bytes === second.bytes &&
      first.contentType === second.contentType;
    // Only pair the same object path across the two logical photo stores.
    // Never collapse unrelated paths merely because their ETags match.
    for (const candidates of paired ? [atPath] : atPath.map((object) => [object])) {
      const source =
        candidates.find((object) => object.bucket === "listing-media") ?? candidates[0];
      groups.push({
        source,
        targets: candidates.map((object) => ({ bucket: object.bucket, path: object.path })),
        expectedSourceMetadata: candidates,
        pairedMetadataMatch: paired,
        verification: "not-downloaded-or-verified",
      });
    }
  }
  groups.sort((a, b) =>
    `${a.source.bucket}/${a.source.path}`.localeCompare(
      `${b.source.bucket}/${b.source.path}`,
      "en",
    ),
  );
  const proposedDownloadBytes = groups.reduce((sum, group) => sum + group.source.bytes, 0);
  const inventorySha256 = createHash("sha256")
    .update(JSON.stringify({ projectRef: expectedProject, objects }))
    .digest("hex");
  return {
    schemaVersion: 1,
    kind: "photo-migration-preflight-only",
    generatedAt: now.toISOString(),
    capturedAt: inventory.capturedAt,
    projectRef: expectedProject,
    inventorySha256,
    summary: {
      sourceObjects: objects.length,
      sourceBytes: totalBytes,
      proposedDownloads: groups.length,
      proposedDownloadBytes,
      pairedMetadataGroups: groups.filter((group) => group.pairedMetadataMatch).length,
      candidateTransferSavingsBytes: totalBytes - proposedDownloadBytes,
      targetObjects: objects.length,
      targetBytes: totalBytes,
      buckets,
    },
    gates: [
      "No bucket, credential, transfer, live cutover or deletion is authorized by this plan.",
      "Re-read source metadata immediately before copying; reject changed objects.",
      "ETags and matching metadata are not byte verification. SHA-256 verification is still required.",
      "Resolve Supabase egress headroom and billing-period/grace timing before downloading photos.",
      "Retain source copies and separate listing/evidence authorization until verified cutover.",
      "Permanent deletion requires a separate reviewed manifest and owner approval.",
    ],
    groups,
  };
}

async function main(args) {
  const usage =
    "Usage: node scripts/storage-migration-plan.mjs --inventory <local.json> --project <project-ref> --output <new-plan.json>";
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      `${usage}\nMetadata-only: no network calls, bucket changes, photo copies or deletions.`,
    );
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!["--inventory", "--project", "--output"].includes(key) || !args[i + 1] || options[key])
      throw new Error(usage);
    options[key] = args[i + 1];
  }
  if (!options["--inventory"] || !options["--project"] || !options["--output"])
    throw new Error(usage);
  const inventory = JSON.parse(await readFile(options["--inventory"], "utf8"));
  const plan = buildPhotoMigrationPlan(inventory, options["--project"]);
  // Refuse to overwrite an earlier review record. Object paths are private
  // operational metadata and are not intended for repository commits.
  await writeFile(options["--output"], `${JSON.stringify(plan, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify({ inventorySha256: plan.inventorySha256, ...plan.summary }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
