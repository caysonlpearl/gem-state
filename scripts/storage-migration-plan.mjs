import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildPhotoMigrationPlan } from "../src/lib/photo-migration-plan.server.mjs";
export { buildPhotoMigrationPlan };

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
