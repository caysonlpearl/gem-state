import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { installRankingReview, insertCandidate } from "./helpers/shopping-ranking-database.mjs";
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
  for (const path of choices) {
    try {
      await access(join(path, "initdb"));
      await access(join(path, "pg_ctl"));
      return path;
    } catch {}
  }
  throw Error("PostgreSQL server tools are required for ranking concurrency tests");
}
test(
  "PostgreSQL reviewers serialize a repeated application and reject a candidate made stale while waiting",
  {
    skip: process.env.BLUEBIRD_RANKING_PG !== "1" ? "Run with BLUEBIRD_RANKING_PG=1" : false,
    timeout: 60000,
  },
  async () => {
    const bin = await binaries(),
      root = await mkdtemp("/tmp/bluebird-ranking-pg-"),
      data = join(root, "data"),
      socket = join(root, "socket"),
      ctl = join(bin, "pg_ctl");
    let a,
      b,
      started = false;
    try {
      await mkdir(socket, { mode: 0o700 });
      await exec(
        join(bin, "initdb"),
        ["-D", data, "-U", "ranking_test", "-A", "trust", "--encoding=UTF8", "--locale=C"],
        { timeout: 20000 },
      );
      await exec(
        ctl,
        [
          "-D",
          data,
          "-l",
          join(root, "postgres.log"),
          "-o",
          `-k ${socket} -p 55479 -c listen_addresses='' -c unix_socket_permissions=0700`,
          "-w",
          "-t",
          "15",
          "start",
        ],
        { timeout: 20000 },
      );
      started = true;
      const config = {
        host: socket,
        port: 55479,
        user: "ranking_test",
        database: "postgres",
        connectionTimeoutMillis: 5000,
      };
      a = new pg.Client(config);
      b = new pg.Client(config);
      await Promise.all([a.connect(), b.connect()]);
      const adapter = (client) => ({
        exec: (sql) => client.query(sql),
        query: (sql, args) => client.query(sql, args),
      });
      const f = await installRankingReview(adapter(a));
      await insertCandidate(a);
      for (const client of [a, b]) await client.query("set statement_timeout='5s'");
      const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      async function confirmBlocked() {
        const until = Date.now() + 3000;
        while (Date.now() < until) {
          if ((await a.query("select cardinality(pg_blocking_pids($1)) n", [pid])).rows[0].n > 0)
            return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw Error("Expected the second reviewer to wait on the first review transaction");
      }
      await a.query("begin");
      await f.asMember(adapter(a));
      const first = await a.query("select review_shopping_ranking('2026-11-09','rules-v1') result");
      assert.equal(first.rows[0].result.alreadyApplied, false);
      await b.query("begin");
      await f.asMember(adapter(b));
      const replay = b.query("select review_shopping_ranking('2026-11-09','rules-v1') result");
      await confirmBlocked();
      await a.query("commit");
      assert.equal((await replay).rows[0].result.alreadyApplied, true);
      await b.query("commit");
      await a.query("reset role;select set_config('request.jwt.claims','{}',false)");
      await a.query("update shopping_controls set model_version='rules-v1',model='{}'");
      await insertCandidate(a, "2026-11-16");
      await a.query("begin;select * from shopping_controls for update");
      await b.query("begin");
      await f.asMember(adapter(b));
      // Attach rejection immediately: it must fail after waiting, not time out.
      const stale = assert.rejects(
        b.query("select review_shopping_ranking('2026-11-16','rules-v1')"),
        /not eligible/,
      );
      await confirmBlocked();
      await a.query("update shopping_controls set model_version='new-reviewed-model';commit");
      await stale;
      await b.query("rollback");
      assert.equal(
        (await a.query("select promoted from shopping_model_evaluations where week='2026-11-16'"))
          .rows[0].promoted,
        false,
      );
      assert.equal(
        (await a.query("select model_version from shopping_controls")).rows[0].model_version,
        "new-reviewed-model",
      );
    } finally {
      await Promise.allSettled([a?.query("rollback"), b?.query("rollback")]);
      await Promise.allSettled([a?.end(), b?.end()]);
      if (started)
        await exec(ctl, ["-D", data, "-m", "immediate", "-w", "stop"], { timeout: 15000 });
      await rm(root, { recursive: true, force: true });
    }
  },
);
