import { readFile, stat, writeFile } from "node:fs/promises";
import { buildPhotoRemovalPlan } from "../src/lib/photo-source-removal-plan.server.mjs";

const usage =
  "Usage: node scripts/storage-source-removal-plan.mjs --review <private.json> --project <ref> --runs <uuid,uuid> --output <new-plan.json> [--preview]";
async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(`${usage}\nLocal preparation only. Preview packets can never enable removal.`);
    return;
  }
  const options = {};
  let preview = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--preview" && !preview) {
      preview = true;
      continue;
    }
    if (
      !["--review", "--project", "--runs", "--output"].includes(key) ||
      options[key] ||
      !args[i + 1]
    )
      throw new Error(usage);
    options[key] = args[++i];
  }
  if (Object.keys(options).length !== 4) throw new Error(usage);
  if ((await stat(options["--review"])).size > 64 * 1024 * 1024)
    throw new Error("Review exceeds64MiB.");
  const plan = buildPhotoRemovalPlan(
    JSON.parse(await readFile(options["--review"], "utf8")),
    {
      projectRef: options["--project"],
      runIds: options["--runs"].split(","),
    },
    preview,
  );
  await writeFile(options["--output"], JSON.stringify(plan) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ ...plan.header, deletionAuthorized: false }));
}
main(process.argv.slice(2)).catch(() => {
  console.error(
    "Removal plan preparation failed. Check scope/readiness, private paths, and choose a new output file. No removal was attempted.",
  );
  process.exitCode = 1;
});
