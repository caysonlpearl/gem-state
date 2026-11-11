import { readFile } from "node:fs/promises";
import { inventoryDatabase, importSftpSource } from "./sftp-import.mjs";

const directory = process.env.CREDENTIALS_DIRECTORY;
if (!directory) throw Error("Run through the SFTP inventory systemd service.");
const config = JSON.parse(await readFile(`${directory}/inventory.json`, "utf8"));
const files = JSON.parse(await readFile(`${directory}/sftp.json`, "utf8"));
const database = inventoryDatabase(config);
let failed = false;
for (const source of files.sources ?? []) {
  if (!/^\/srv\/bluebird-sftp\/[a-z0-9_]+\/incoming\/[A-Za-z0-9_.-]+\.csv$/.test(source.path))
    throw Error("SFTP inventory paths must be pinned in the private service configuration.");
  try {
    console.log(
      JSON.stringify({
        sourceId: source.sourceId,
        ...(await importSftpSource(source, { database })),
      }),
    );
  } catch {
    failed = true;
    // Never log credentials, raw inventory, dealer costs or provider URLs.
    const message =
      "SFTP delivery could not be validated or imported; existing inventory retained.";
    try {
      await database("rpc/touch_dealer_inventory_source", {
        _source_id: source.sourceId,
        _ok: false,
        _error: message,
      });
    } catch {
      /* retry next sweep */
    }
    console.log(JSON.stringify({ sourceId: source.sourceId, status: "failed", message }));
  }
}
if (failed) process.exitCode = 1;
