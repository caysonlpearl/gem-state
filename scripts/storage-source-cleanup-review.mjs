import { readFile, writeFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildPhotoSourceCleanupReview } from "../src/lib/photo-source-cleanup-review.server.mjs";

async function main(args) {
  const usage =
    "Usage: node scripts/storage-source-cleanup-review.mjs --snapshot <local.json> --project <project-ref> --runs <uuid,uuid> --not-before <ISO timestamp> --output <new-review.json>";
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      `${usage}\nRead-only local review: no network, credentials, copies or deletion. Preliminary output is allowed before retention; it cannot be review-ready.`,
    );
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (
      !["--snapshot", "--project", "--runs", "--not-before", "--output"].includes(key) ||
      !args[i + 1] ||
      options[key]
    )
      throw new Error(usage);
    options[key] = args[i + 1];
  }
  if (Object.keys(options).length !== 5) throw new Error(usage);
  if ((await stat(options["--snapshot"])).size > 64 * 1024 * 1024)
    throw new Error("Snapshot exceeds 64 MiB.");
  const snapshot = JSON.parse(await readFile(options["--snapshot"], "utf8"));
  const review = buildPhotoSourceCleanupReview(snapshot, {
    projectRef: options["--project"],
    runIds: options["--runs"].split(","),
    notBefore: options["--not-before"],
  });
  await writeFile(options["--output"], `${JSON.stringify(review, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      manifestSha256: review.manifestSha256,
      reviewReady: review.reviewReady,
      deletionAuthorized: false,
      gates: review.gates,
      ...review.summary,
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
