import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { shoppingDatabaseFixture } from "./helpers/shopping-database.mjs";

const captured = JSON.parse(
  readFileSync(new URL("./fixtures/shopping-retention-schema-20261115.json", import.meta.url)),
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261115110000_fix_shopping_retention_date.sql", import.meta.url),
  "utf8",
);
async function fixture() {
  const f = await shoppingDatabaseFixture();
  await f.db.exec(captured.retention.definition + ";");
  const actual = (
    await f.db.query(`select attname name,format_type(atttypid,atttypmod)type,attnotnull "notNull"
      from pg_attribute where attrelid='analytics_events'::regclass and attnum>0 and not attisdropped order by attname`)
  ).rows;
  assert.deepEqual(
    actual,
    captured.analytics.metadata.columns
      .map(({ name, type, notNull }) => ({ name, type, notNull }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  return f;
}

test("the captured live retention function fails on the actual analytics schema and rolls back earlier cleanup", async () => {
  const { db } = await fixture();
  try {
    await db.exec(
      "insert into shopping_email_receipts values('synthetic-old','test',now()-interval '181 days')",
    );
    await assert.rejects(db.query("select retain_shopping_data()"), (e) => e.code === "42703");
    assert.equal(
      (await db.query("select count(*)::int n from shopping_email_receipts")).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("the repair executes real retention, retires at most 1000 old browsing links and preserves totals, recent data and member favorites", async () => {
  const { db, user, subject } = await fixture();
  try {
    await db.exec(migration);
    await db.query("select set_shopping_privacy($1,$2,true,false,'synthetic-policy')", [
      subject,
      user,
    ]);
    await db.query(
      `insert into shopping_events(id,subject,user_id,session_id,kind,occurred_at)
      values(gen_random_uuid(),$1,$2,gen_random_uuid(),'view',now()-interval '91 days')`,
      [subject, user],
    );
    await db.query(
      `insert into analytics_events(user_id,session_id,name,props,occurred_at)
      select $1,'synthetic-browser','listing_viewed','{"traffic_visit":"synthetic-visit","listing_id":"public-item","device":"mobile"}'::jsonb,
        now()-interval '91 days'-n*interval '1 second' from generate_series(1,1005)n`,
      [user],
    );
    await db.query(
      `insert into analytics_events(user_id,session_id,name,props,occurred_at)
      values($1,'recent','listing_viewed','{"traffic_visit":"recent"}',now()-interval '10 days'),
      ($1,'operational','shopper_availability_expired','{}',now()-interval '91 days')`,
      [user],
    );
    await db.query(
      "insert into shopping_favorites(subject,listing_id,saved_at)values($1,'keep-member-favorite',now()-interval '100 days'),('g:synthetic-guest','expired-guest-favorite',now()-interval '100 days')",
      [subject],
    );
    await db.exec(
      "insert into shopping_email_receipts values('synthetic-old','test',now()-interval '181 days'),('synthetic-new','test',now())",
    );
    await db.exec("begin");
    await db.query(
      `insert into analytics_events(user_id,session_id,name,props,occurred_at)
      values($1,'boundary','listing_viewed','{}',now()-interval '90 days')`,
      [user],
    );
    await db.query("select retain_shopping_data()");
    assert.equal(
      (await db.query("select count(*)::int n from analytics_events where session_id is null"))
        .rows[0].n,
      1000,
    );
    assert.equal((await db.query("select count(*)::int n from analytics_events")).rows[0].n, 1008);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from analytics_events where session_id in('recent','operational','boundary')",
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from analytics_events where session_id is null and (user_id is not null or props?'traffic_visit')",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from analytics_events where session_id is null and props->>'listing_id'='public-item'and props->>'device'='mobile'",
        )
      ).rows[0].n,
      1000,
    );
    assert.equal((await db.query("select count(*)::int n from shopping_events")).rows[0].n, 0);
    assert.deepEqual((await db.query("select id from shopping_email_receipts order by id")).rows, [
      { id: "synthetic-new" },
    ]);
    assert.deepEqual((await db.query("select listing_id from shopping_favorites")).rows, [
      { listing_id: "keep-member-favorite" },
    ]);
    await db.query("select retain_shopping_data()");
    await db.query("select retain_shopping_data()");
    assert.equal(
      (await db.query("select count(*)::int n from analytics_events where session_id is null"))
        .rows[0].n,
      1005,
    );
    const acl = (
      await db.query(`select has_function_privilege('anon','retain_shopping_data()','execute')anon,
      has_function_privilege('authenticated','retain_shopping_data()','execute')member,
      has_function_privilege('service_role','retain_shopping_data()','execute')server`)
    ).rows[0];
    assert.deepEqual(acl, { anon: false, member: false, server: true });
    await db.exec("commit");
  } finally {
    await db.close();
  }
});

test("installation refuses an unreviewed retention function instead of overwriting it", async () => {
  const { db } = await fixture();
  try {
    await db.exec(
      captured.retention.definition.replace("begin", "begin\n-- synthetic unreviewed change") + ";",
    );
    await assert.rejects(db.exec(migration), /Review shopping retention/);
    await db.exec("rollback");
    assert.match(
      (
        await db.query(
          "select prosrc from pg_proc where oid='retain_shopping_data()'::regprocedure",
        )
      ).rows[0].prosrc,
      /synthetic unreviewed change/,
    );
  } finally {
    await db.close();
  }
});

test("the real sweep reports retention failure before ranking, advertising or shopping delivery", async () => {
  const source = ts.createSourceFile(
    "shopping-worker.ts",
    readFileSync(new URL("../src/lib/shopping-worker.server.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const fn = source.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "processShoppingWorker",
  );
  const compiled = ts.transpileModule(fn.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const fail of [true, false]) {
    const calls = [];
    const q = {
      update() {
        return q;
      },
      eq() {
        return q;
      },
      or() {
        return q;
      },
      select() {
        return q;
      },
      maybeSingle: async () => ({ data: { id: true }, error: null }),
    };
    const db = {
      from: () => q,
      rpc: async (name) => {
        calls.push(name);
        return { error: fail ? { message: "private database detail" } : null };
      },
    };
    const exports = {};
    new Function(
      "exports",
      "shoppingDb",
      "shoppingControls",
      "syncShoppingInventory",
      "evaluateWeeklyRanking",
      "require",
      compiled,
    )(
      exports,
      async () => db,
      async () => ({ notifications: false }),
      async () => {
        calls.push("inventory");
        return 2;
      },
      async () => {
        calls.push("ranking");
      },
      (name) => {
        assert.equal(name, "./shopping-advertising.server");
        return {
          deliverShoppingAdvertising: async () => {
            calls.push("advertising");
            return { exported: 0 };
          },
        };
      },
    );
    if (fail) {
      await assert.rejects(
        exports.processShoppingWorker(),
        (e) => e.message === "Shopping retention unavailable." && !e.cause,
      );
      assert.deepEqual(calls, ["inventory", "retain_shopping_data"]);
    } else {
      assert.deepEqual(await exports.processShoppingWorker(), {
        inventory: 2,
        paused: true,
        exported: 0,
      });
      assert.deepEqual(calls, ["inventory", "retain_shopping_data", "ranking", "advertising"]);
    }
  }
});
