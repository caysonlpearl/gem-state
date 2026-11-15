import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readdir, access, rm } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
const exec = promisify(execFile);
/** Disposable owner-only socket cluster. No TCP, production connection, logs or credentials. */
export async function withListingTestPostgres(run) {
  const choices = [];
  try {
    choices.push((await exec("pg_config", ["--bindir"])).stdout.trim());
  } catch {}
  try {
    for (const version of (await readdir("/usr/lib/postgresql")).sort().reverse())
      choices.push("/usr/lib/postgresql/" + version + "/bin");
  } catch {}
  let bin;
  for (const dir of choices) {
    try {
      await Promise.all(["initdb", "pg_ctl", "postgres"].map((n) => access(join(dir, n))));
      bin = dir;
      break;
    } catch {}
  }
  if (!bin) throw Error("PostgreSQL tools are required for native listing transaction checks");
  const root = await mkdtemp("/tmp/bluebird-listing-pg-"),
    data = join(root, "data"),
    socket = join(root, "socket"),
    clients = [];
  let initialized = false;
  try {
    await mkdir(socket, { mode: 0o700 });
    await exec(
      join(bin, "initdb"),
      ["-D", data, "-U", "listing_test", "-A", "trust", "--encoding=UTF8", "--locale=C"],
      { timeout: 20000 },
    );
    initialized = true;
    await exec(
      join(bin, "pg_ctl"),
      [
        "-D",
        data,
        "-l",
        join(root, "server.log"),
        "-o",
        `-F -k ${socket} -h '' -c unix_socket_permissions=0700`,
        "-w",
        "start",
      ],
      { timeout: 20000 },
    );
    const connect = async () => {
      const c = new pg.Client({ host: socket, user: "listing_test", database: "postgres" });
      await c.connect();
      clients.push(c);
      return c;
    };
    await run(connect);
  } finally {
    await Promise.allSettled(clients.map((c) => c.end()));
    if (initialized)
      await exec(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], {
        timeout: 10000,
      }).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}
