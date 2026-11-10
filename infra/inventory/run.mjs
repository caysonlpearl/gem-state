// Run the production inventory endpoint in-process; no listening HTTP port.
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { randomUUID } from "node:crypto";

register(new URL("./wasm-loader.mjs", import.meta.url));
const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
if (!credentialDirectory) throw Error("Run through the inventory systemd service.");
const config = JSON.parse(await readFile(`${credentialDirectory}/inventory.json`, "utf8"));
process.env.GEM_STATE_SUPABASE_URL = config.url;
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = config.serviceKey;
// Used only by this one in-memory request, never exposed as a network service.
process.env.CRON_SECRET = randomUUID();

const worker = (await import(new URL("./.output/server/index.mjs", import.meta.url))).default;
const response = await worker.fetch(
  new Request("https://onbluebird.com/api/internal/dealer-inventory", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }),
  {},
  { waitUntil() {} },
);
const body = await response.text();
let results;
try {
  results = JSON.parse(body);
} catch {
  throw Error(`Inventory endpoint returned non-JSON HTTP ${response.status}.`);
}
// Log run IDs/statuses, never provider URLs or raw inventory/credentials.
console.log(JSON.stringify({
  httpStatus: response.status,
  results: Array.isArray(results)
    ? results.map(({ sourceId, status, runId }) => ({ sourceId, status, runId }))
    : { error: "Inventory endpoint failed; inspect private source sync health." },
}));
if (!response.ok || !Array.isArray(results) || results.some((result) => result.status === "failed"))
  process.exitCode = 1;
