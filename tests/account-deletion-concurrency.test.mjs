import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readdir, access, rm } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { installDeletionSchema } from "./helpers/account-deletion-database.mjs";
const exec = promisify(execFile);
async function binaries() {
  const choices = [];
  try {
    choices.push((await exec("pg_config", ["--bindir"])).stdout.trim());
  } catch {}
  try {
    for (const v of (await readdir("/usr/lib/postgresql")).sort().reverse())
      choices.push("/usr/lib/postgresql/" + v + "/bin");
  } catch {}
  for (const dir of choices) {
    try {
      await Promise.all(["initdb", "pg_ctl", "postgres"].map((n) => access(join(dir, n))));
      return dir;
    } catch {}
  }
  throw Error("PostgreSQL server tools are required for the deletion concurrency gate");
}
test(
  "real concurrent deletion claims skip locked work and reject an expired worker after recovery",
  {
    skip:
      process.env.BLUEBIRD_DELETION_PG !== "1"
        ? "Run the dedicated PostgreSQL gate with BLUEBIRD_DELETION_PG=1"
        : false,
    timeout: 60000,
  },
  async () => {
    const bin = await binaries(),
      root = await mkdtemp("/tmp/bluebird-deletion-pg-"),
      data = join(root, "data"),
      socket = join(root, "socket");
    const ctl = join(bin, "pg_ctl");
    let a,
      b,
      initialized = false;
    try {
      await mkdir(socket, { mode: 0o700 });
      await exec(
        join(bin, "initdb"),
        ["-D", data, "-U", "deletion_test", "-A", "trust", "--encoding=UTF8", "--locale=C"],
        { timeout: 20000 },
      );
      initialized = true;
      // No TCP listener; the private socket directory and socket are owner-only.
      await exec(
        ctl,
        [
          "-D",
          data,
          "-l",
          join(root, "postgres.log"),
          "-o",
          `-k ${socket} -p 55472 -c listen_addresses='' -c unix_socket_permissions=0700`,
          "-w",
          "-t",
          "15",
          "start",
        ],
        { timeout: 20000 },
      );
      const config = {
        host: socket,
        port: 55472,
        user: "deletion_test",
        database: "postgres",
        connectionTimeoutMillis: 5000,
      };
      a = new pg.Client(config);
      b = new pg.Client(config);
      await Promise.all([a.connect(), b.connect()]);
      await installDeletionSchema({
        exec: (sql) => a.query(sql),
        query: (sql, args) => a.query(sql, args),
      });
      for (const c of [a, b]) await c.query("set statement_timeout='3s'");
      const users = [randomUUID(), randomUUID(), randomUUID()];
      for (const user of users.slice(0, 2)) {
        await a.query("insert into auth.users values($1)", [user]);
        await a.query("select mobile_request_deletion($1)", [user]);
      }
      await a.query("update account_deletion_controls set worker_enabled=true");
      await a.query("begin");
      await a.query("select id from account_deletion_jobs where user_id=$1 for update", [users[0]]);
      const second = (await b.query("select * from claim_account_deletion()")).rows[0];
      assert.equal(
        second.user_id,
        users[1],
        "A locked older request does not block another worker",
      );
      await a.query("commit");
      const first = (await a.query("select * from claim_account_deletion()")).rows[0];
      assert.equal(first.user_id, users[0]);
      assert.notEqual(first.id, second.id);
      await a.query(
        "update account_deletion_jobs set lease_until=now()-interval '1 second' where id=$1",
        [first.id],
      );
      const recovered = (await b.query("select * from claim_account_deletion()")).rows[0];
      assert.equal(recovered.id, first.id);
      assert.notEqual(recovered.lease_token, first.lease_token);
      const checkpoint = async (c, j) =>
        (
          await c.query("select advance_account_deletion($1,$2,$3,true) ok", [
            j.id,
            j.lease_token,
            j.phase,
          ])
        ).rows[0].ok;
      assert.equal(await checkpoint(a, first), false);
      assert.equal(
        (
          await a.query("select retry_account_deletion($1,$2,$3,'worker_failed') ok", [
            first.id,
            first.lease_token,
            first.phase,
          ])
        ).rows[0].ok,
        false,
      );
      assert.equal(await checkpoint(b, recovered), true);
      await a.query("insert into auth.users values($1)", [users[2]]);
      await a.query("select mobile_request_deletion($1)", [users[2]]);
      const simultaneous = await Promise.all([
        a.query("select * from claim_account_deletion()"),
        b.query("select * from claim_account_deletion()"),
      ]);
      assert(simultaneous.every((r) => r.rows.length === 1));
      assert.equal(
        new Set(simultaneous.map((r) => r.rows[0].id)).size,
        2,
        "Simultaneous connections never claim one logical job twice",
      );
    } finally {
      await Promise.allSettled([a?.end(), b?.end()]);
      if (initialized) {
        let running = false;
        try {
          await exec(ctl, ["-D", data, "status"]);
          running = true;
        } catch (e) {
          if (![3, 4].includes(e.code)) throw e;
        }
        if (running)
          await exec(ctl, ["-D", data, "-m", "fast", "-w", "-t", "15", "stop"], { timeout: 20000 });
        try {
          await exec(ctl, ["-D", data, "status"]);
          throw Error("Isolated deletion test database is still running");
        } catch (e) {
          if (![3, 4].includes(e.code)) throw e;
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
