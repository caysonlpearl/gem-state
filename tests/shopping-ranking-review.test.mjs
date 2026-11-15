import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  installRankingReview,
  insertCandidate,
  candidate,
} from "./helpers/shopping-ranking-database.mjs";

test("review applies a stored candidate atomically, preserves controls and records an idempotent identity-free receipt", async () => {
  const db = new PGlite();
  try {
    const f = await installRankingReview(db);
    await db.exec(
      `update shopping_controls set model='{"catalogStatus":{"complete":true}}', notifications=false,advertising=false`,
    );
    await insertCandidate(db);
    await f.asMember();
    const review = () => db.query("select review_shopping_ranking('2026-11-09','rules-v1') result");
    assert.equal((await review()).rows[0].result.alreadyApplied, false);
    assert.equal((await review()).rows[0].result.alreadyApplied, true);
    await db.exec("reset role");
    const controls = (await db.query("select * from shopping_controls")).rows[0];
    assert.equal(controls.model_version, "reviewed-2026-11-09-engagement-v1");
    assert.equal(controls.model.weights.engagement, 1);
    assert.deepEqual(controls.model.catalogStatus, { complete: true });
    assert.equal(controls.notifications, false);
    assert.equal(controls.advertising, false);
    const record = (await db.query("select * from shopping_model_evaluations")).rows[0];
    assert.equal(record.promoted, true);
    assert.ok(record.challenger.reviewedAt);
    assert.ok(!JSON.stringify(record).includes(f.user));
    assert.equal(
      (await db.query("select shopping_ranking_review_ready() value")).rows[0].value,
      true,
    );
    const coverage = (await db.query("select account_access_coverage() c")).rows[0].c;
    assert.deepEqual(coverage, {
      unguarded_functions: 0,
      unguarded_tables: 0,
      helper_privilege_gaps: 0,
    });
  } finally {
    await db.close();
  }
});

test("review refuses insufficient, malformed, stale or paused candidates without changing the live model", async () => {
  const db = new PGlite();
  try {
    const f = await installRankingReview(db);
    const bad = [];
    for (const [key, value] of [
      ["eligible", false],
      ["accuracy", 0.51],
      ["trainingPairs", 199],
      ["testPairs", 99],
      ["schema", "old"],
      ["accuracy", "1"],
    ]) {
      const row = candidate();
      row.challenger[key] = value;
      bad.push(row);
    }
    for (const weights of [
      { ...candidate().challenger.weights, engagement: 7 },
      { ...candidate().challenger.weights, engagement: "1" },
      { ...candidate().challenger.weights, private: 1 },
    ]) {
      const row = candidate();
      row.challenger.weights = weights;
      bad.push(row);
    }
    const old = candidate("old-model"),
      insufficient = candidate();
    insufficient.outcomes = 29;
    bad.push(old, insufficient);
    for (let i = 0; i < bad.length; i++) {
      const week = `2026-10-${String(i + 1).padStart(2, "0")}`;
      await insertCandidate(db, week, bad[i]);
      await f.asMember();
      await assert.rejects(
        db.query("select review_shopping_ranking($1,'rules-v1')", [week]),
        /Ranking/,
      );
      await db.exec("reset role");
      assert.equal(
        (await db.query("select model_version from shopping_controls")).rows[0].model_version,
        "rules-v1",
      );
    }
    await insertCandidate(db);
    await db.exec("update shopping_controls set learning=false");
    await f.asMember();
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /not eligible/,
    );
    await db.exec("reset role");
    await db.exec(`update shopping_controls set learning=true,model='{"weights":{"visual":2}}'`);
    await f.asMember();
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /baseline changed/,
    );
  } finally {
    await db.close();
  }
});

test("only an active administrator session can review; clients cannot forge evidence, weights or readiness", async () => {
  const db = new PGlite();
  try {
    const f = await installRankingReview(db);
    await insertCandidate(db);
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /permission denied/,
    );
    await db.exec("reset role");
    await f.asMember();
    await assert.rejects(db.query("select shopping_ranking_review_ready()"), /permission denied/);
    await assert.rejects(
      db.query("update shopping_model_evaluations set promoted=true"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec("delete from ranking_test_roles");
    await f.asMember();
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /Administrator/,
    );
    await db.exec("reset role");
    await db.query("insert into ranking_test_roles values($1,'admin')", [f.user]);
    await db.query("insert into account_deletion_jobs(user_id,status)values($1,'pending')", [
      f.user,
    ]);
    await f.asMember();
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /Account access/,
    );
    await db.exec("reset role;delete from account_deletion_jobs;delete from auth.sessions");
    await f.asMember();
    await assert.rejects(
      db.query("select review_shopping_ranking('2026-11-09','rules-v1')"),
      /Account access/,
    );
  } finally {
    await db.close();
  }
});
