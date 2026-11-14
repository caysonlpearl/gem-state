import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readdir, access, rm } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { installDeletionWorkerSchema } from "./helpers/account-deletion-database.mjs";
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
  "real deletion workers skip locked jobs, reject stale leases and serialize operator pauses",
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
      await installDeletionWorkerSchema({
        exec: (sql) => a.query(sql),
        query: (sql, args) => a.query(sql, args),
      });
      for (const c of [a, b]) await c.query("set statement_timeout='3s'");
      const users = [randomUUID(), randomUUID(), randomUUID()];
      for (const user of users.slice(0, 2)) {
        await a.query("insert into auth.users(id) values($1)", [user]);
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
      const current = async (c, j) =>
        (
          await c.query("select account_deletion_lease_current($1,$2,$3,$4) ok", [
            j.id,
            j.user_id,
            j.lease_token,
            j.phase,
          ])
        ).rows[0].ok;
      assert.equal(await current(b, first), true);
      await a.query("update account_deletion_controls set worker_enabled=false");
      assert.equal(await current(b, first), false);
      assert.equal(
        (
          await b.query("select advance_account_deletion($1,$2,$3,true) ok", [
            first.id,
            first.lease_token,
            first.phase,
          ])
        ).rows[0].ok,
        false,
      );
      await a.query("update account_deletion_controls set worker_enabled=true");
      await a.query(
        "update account_deletion_jobs set lease_until=now()-interval '1 second' where id=$1",
        [first.id],
      );
      const recovered = (await b.query("select * from claim_account_deletion()")).rows[0];
      assert.equal(recovered.id, first.id);
      assert.notEqual(recovered.lease_token, first.lease_token);
      assert.equal(await current(a, first), false);
      assert.equal(await current(a, recovered), true);
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
      await a.query("insert into auth.users(id) values($1)", [users[2]]);
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
      await a.query(
        `create function real_boundary_fixture(_value integer default 12) returns integer language plpgsql stable security definer as $$begin return _value;exception when others then return -1;end\r\n\t $$;`,
      );
      await a.query("select protect_account_access_boundaries()");
      const member = randomUUID(),
        session = randomUUID();
      await a.query("insert into auth.users(id)values($1)", [member]);
      await a.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, member]);
      await a.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: member, session_id: session, role: "authenticated" }),
      ]);
      await a.query("set role authenticated");
      assert.equal((await a.query("select real_boundary_fixture() n")).rows[0].n, 12);
      await b.query("select mobile_request_deletion($1)", [member]);
      assert.equal(
        (await b.query("select count(*)::int n from auth.sessions where user_id=$1", [member]))
          .rows[0].n,
        0,
      );
      await assert.rejects(
        () => a.query("select real_boundary_fixture()"),
        /Account access is unavailable/,
      );
      assert.deepEqual((await b.query("select account_access_coverage() c")).rows[0].c, {
        unguarded_functions: 0,
        unguarded_tables: 0,
        helper_privilege_gaps: 0,
      });
      await a.query("reset role");
      const active = simultaneous[0].rows[0];
      for (const operation of ["claim", "checkpoint"]) {
        await a.query("update account_deletion_controls set worker_enabled=true");
        await a.query("begin");
        await a.query("update account_deletion_controls set worker_enabled=false");
        let settled = false;
        const pending = (
          operation === "claim"
            ? b.query("select * from claim_account_deletion()")
            : b.query("select advance_account_deletion($1,$2,$3,true) ok", [
                active.id,
                active.lease_token,
                active.phase,
              ])
        ).then((result) => {
          settled = true;
          return result;
        });
        // Keep a failing fixture from leaving an unhandled query rejection while
        // finally closes the clients. The awaited promise below still rejects.
        pending.catch(() => {});
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (Date.now() < deadline && !settled) {
          // Activity snapshots can be cached for this control transaction.
          await a.query("select pg_stat_clear_snapshot()");
          blocked =
            (
              await a.query(
                "select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",
                [b.processID],
              )
            ).rows[0]?.blocked === true;
          if (blocked) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert(
          blocked && !settled,
          operation + " must serialize with a pending disable transaction",
        );
        await a.query("commit");
        const result = await pending;
        if (operation === "claim") assert.deepEqual(result.rows, []);
        else assert.equal(result.rows[0].ok, false);
      }
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
