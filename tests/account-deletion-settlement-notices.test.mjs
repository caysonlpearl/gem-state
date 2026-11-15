import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { withListingTestPostgres } from "./helpers/postgres-test-cluster.mjs";
import { installDeletionPhotoWriterSchema } from "./helpers/account-deletion-photo-database.mjs";
import { installPrivateRecordSources } from "./helpers/account-deletion-private-database.mjs";
import { installShoppingErasureSources } from "./helpers/account-deletion-shopping-database.mjs";
import { listingRecordsDatabase } from "./helpers/account-deletion-listing-records-database.mjs";
import {
  seedListing,
  fixtureMemberSession,
} from "./helpers/account-deletion-owned-listings-database.mjs";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/account-deletion-settlement-notices-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
const migration = () =>
  readFileSync(
    new URL(
      "../supabase/migrations/20261115050000_account_deletion_settlement_notices.sql",
      import.meta.url,
    ),
    "utf8",
  );
const paymentFixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/account-deletion-settlement-payment-schema-20261115.json", import.meta.url),
    "utf8",
  ),
);
async function installPaymentCallback(db) {
  const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
  for (const [name, values] of Object.entries(paymentFixture.enumTypes))
    if (!(await db.query("select to_regtype($1) r", ["public." + name])).rows[0].r)
      await db.exec(
        `create type public.${quote(name)} as enum(${values.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",")})`,
      );
  for (const row of paymentFixture.rows) {
    if (!(await db.query("select to_regclass($1) r", ["public." + row.source])).rows[0].r)
      await db.exec(`create table public.${quote(row.source)}()`);
    for (const c of row.metadata.columns) {
      if (c.default?.includes("nextval(")) {
        const seq = c.default.match(/nextval\('([^']+)'::regclass\)/)?.[1];
        assert(seq);
        await db.exec(
          `create sequence if not exists public.${quote(seq.replace(/^public\./, ""))}`,
        );
      }
      if (
        !(
          await db.query(
            "select 1 from pg_attribute where attrelid=$1::regclass and attname=$2 and not attisdropped",
            ["public." + row.source, c.name],
          )
        ).rows.length
      )
        await db.exec(
          `alter table public.${quote(row.source)} add column ${quote(c.name)} ${c.type}${c.generated ? " generated always as (" + c.default + ") stored" : ""}`,
        );
      await db.exec(
        `alter table public.${quote(row.source)} ${c.generated ? "" : "alter column " + quote(c.name) + " " + (c.default ? "set default " + c.default : "drop default") + ","}alter column ${quote(c.name)} ${c.notNull ? "set" : "drop"} not null`,
      );
    }
    for (const c of row.metadata.constraints.filter(
      (c) => c.table === row.source && /^(PRIMARY KEY|UNIQUE|CHECK)/.test(c.definition),
    )) {
      if (
        !(
          await db.query("select 1 from pg_constraint where conrelid=$1::regclass and conname=$2", [
            "public." + row.source,
            c.name,
          ])
        ).rows.length
      )
        await db.exec(
          `alter table public.${quote(row.source)} add constraint ${quote(c.name)} ${c.definition}`,
        );
    }
    for (const hook of row.metadata.triggers ?? []) {
      await db.exec(hook.function);
      await db.exec(hook.definition);
    }
  }
  // No offer is created in this exact-purchase test. Retain the captured types
  // for columns parsed by the finalizer's competing-offer update statements.
  for (const c of paymentFixture.offerSupport.columns)
    if (
      !(
        await db.query(
          "select 1 from pg_attribute where attrelid='public.listing_offers'::regclass and attname=$1 and not attisdropped",
          [c.name],
        )
      ).rows.length
    )
      await db.exec(
        `alter table listing_offers add column ${quote(c.name)} ${c.type}${c.default ? " default " + c.default : ""}${c.notNull ? " not null" : ""}`,
      );
  const prefix =
    "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
  await db.exec(
    paymentFixture.function.definition
      .replace(prefix, "AS $function$")
      .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
  );
  await db.exec("select protect_account_access_boundaries()");
  assert.equal(
    (
      await db.query(
        "select md5(prosrc) hash from pg_proc where oid='public.finalize_stripe_order_payment(uuid,text,text,text,integer,integer,text,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    paymentFixture.function.bodyMd5,
  );
}
async function setup(t, provided) {
  const db = await listingRecordsDatabase({ provided });
  if (!provided) t.after(() => db.close());
  const f = await seedListing(db),
    other = await seedListing(db);
  for (const c of fixture.notifications.columns) {
    if (
      !(
        await db.query(
          "select 1 from pg_attribute where attrelid='public.notifications'::regclass and attname=$1 and not attisdropped",
          [c.name],
        )
      ).rows.length
    )
      await db.exec(`alter table notifications add column "${c.name}" ${c.type}`);
    await db.exec(
      `alter table notifications alter column "${c.name}" ${c.default ? "set default " + c.default : "drop default"},alter column "${c.name}" ${c.notNull ? "set" : "drop"} not null`,
    );
  }
  const prefix =
    "AS $function$BEGIN\n PERFORM public.assert_current_account_access(); -- bluebird-account-boundary-v1\n";
  assert(fixture.function.definition.includes(prefix));
  await db.exec(
    fixture.function.definition
      .replace(prefix, "AS $function$")
      .replace(/\nEND;\$function\$\n?$/, "\n$function$\n"),
  );
  await db.exec("select protect_account_access_boundaries()");
  assert.equal(
    (
      await db.query(
        "select md5(prosrc) hash from pg_proc where oid='public.notify_member(uuid,text,text,text,uuid)'::regprocedure",
      )
    ).rows[0].hash,
    fixture.function.bodyMd5,
  );
  const notice = (user, kind = "order_paid") =>
    db.query(
      "select notify_member($1,$2,'Synthetic transaction notice','Synthetic notice body',null)",
      [user, kind],
    );
  const request = async (user) => {
    await db.exec(
      "select set_config('request.jwt.claims','{}',false);select set_config('parkvault.trusted_operation','off',false)",
    );
    await db.query("select mobile_request_deletion($1)", [user]);
  };
  return { db, f, other, notice, request };
}
test("captured recipient notice fails an existing business transaction before the fix, then skips only the deleting recipient", async (t) => {
  const { db, f, other, notice, request } = await setup(t),
    order = randomUUID();
  await db.exec("alter table orders add column synthetic_settled boolean default false");
  await db.query("insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [
    order,
    other.buyer,
    f.seller,
  ]);
  await request(f.seller);
  await db.exec("begin");
  await db.query("update orders set synthetic_settled=true where id=$1", [order]);
  await assert.rejects(notice(f.seller), /Private account records unavailable/);
  await db.exec("rollback");
  assert.equal(
    (await db.query("select synthetic_settled from orders where id=$1", [order])).rows[0]
      .synthetic_settled,
    false,
  );
  await db.exec(migration());
  await db.exec("begin");
  await db.query("update orders set synthetic_settled=true where id=$1", [order]);
  await notice(f.seller);
  await notice(other.buyer);
  await db.exec("commit");
  assert.equal(
    (await db.query("select synthetic_settled from orders where id=$1", [order])).rows[0]
      .synthetic_settled,
    true,
  );
  assert.deepEqual((await db.query("select user_id,kind from notifications")).rows, [
    { user_id: other.buyer, kind: "order_paid" },
  ]);
  assert.equal((await db.query("select count(*)::int n from mobile_push_outbox")).rows[0].n, 0);
  await assert.rejects(
    db.query(
      "insert into notifications(user_id,kind,title,body)values($1,'security','Synthetic','Synthetic')",
      [f.seller],
    ),
    /Private account records unavailable/,
  );
  assert.equal(
    (await db.query("select worker_enabled from account_deletion_controls")).rows[0].worker_enabled,
    false,
  );
});
test("removed recipients are omitted while active recipient errors and caller session boundaries remain enforced", async (t) => {
  const { db, f, other, notice, request } = await setup(t);
  await db.exec(migration());
  await notice(randomUUID());
  await notice(null);
  assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 0);
  await db.exec("select set_config('parkvault.trusted_operation','off',false)");
  await assert.rejects(notice(other.buyer, null), /not-null constraint/);
  assert.equal(
    (await db.query("select current_setting('parkvault.trusted_operation',true) value")).rows[0]
      .value,
    "off",
  );
  await notice(other.buyer);
  assert.equal(
    (await db.query("select current_setting('parkvault.trusted_operation',true) value")).rows[0]
      .value,
    "off",
  );
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await notice(other.buyer);
  assert.equal(
    (await db.query("select current_setting('parkvault.trusted_operation',true) value")).rows[0]
      .value,
    "on",
  );
  await request(f.seller);
  await fixtureMemberSession(db, f.seller);
  await db.exec("set role authenticated");
  await assert.rejects(notice(other.buyer), /Account access is unavailable/);
  await db.exec("reset role;select set_config('request.jwt.claims','{}',false)");
  assert.deepEqual((await db.query("select account_access_coverage() coverage")).rows[0].coverage, {
    unguarded_functions: 0,
    unguarded_tables: 0,
    helper_privilege_gaps: 0,
  });
});
test("installation refuses a changed notification function instead of accepting an unreviewed business callback", async (t) => {
  const { db } = await setup(t);
  await db.exec(
    "create or replace function notify_member(_user_id uuid,_kind text,_title text,_body text,_order_id uuid default null)returns void language plpgsql security definer as $$begin null;end$$",
  );
  await assert.rejects(db.exec(migration()), /settlement notice prerequisites/);
  await db.exec("rollback");
});

for (const deletedRole of ["seller", "buyer"])
  test(`the captured payment finalizer settles and replays after ${deletedRole} deletion without restarting their notices or learning`, async (t) => {
    const { db, f, other, request } = await setup(t);
    await installPaymentCallback(db);
    await installShoppingErasureSources(db);
    await db.exec("insert into shopping_controls(tracking)values(true)");
    await db.query(
      "insert into shopping_privacy(subject,personalization,advertising)values($1,true,false)",
      ["u:" + other.buyer],
    );
    const order = randomUUID();
    await db.query(
      "insert into orders(id,buyer_id,seller_id,product_id,variant_id,origin,status,merchandise_cents,buyer_fee_cents,seller_fee_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot,ask_id)values($1,$2,$3,$4,$5,'buy_now','awaiting_payment',10000,1000,500,11000,9500,$6,'{}',$7)",
      [order, other.buyer, f.seller, f.product, f.variant, randomUUID(), f.listing],
    );
    await db.query("update asks set status='matched',matched_order_id=$1 where id=$2", [
      order,
      f.listing,
    ]);
    await request(deletedRole === "seller" ? f.seller : other.buyer);
    const finalize = () =>
      db.query(
        "select finalize_stripe_order_payment($1,'cs_synthetic','pi_synthetic','ch_synthetic',11000,0,'succeeded',null)",
        [order],
      );
    await assert.rejects(finalize(), /Private account records unavailable/);
    assert.equal(
      (await db.query("select status from orders where id=$1", [order])).rows[0].status,
      "awaiting_payment",
    );
    assert.equal((await db.query("select count(*)::int n from order_payments")).rows[0].n, 0);
    await db.exec(migration());
    await finalize();
    await finalize();
    assert.deepEqual(
      (
        await db.query(
          "select status,payment_authorized,stripe_payment_intent_id from orders where id=$1",
          [order],
        )
      ).rows[0],
      {
        status: "payment_captured",
        payment_authorized: true,
        stripe_payment_intent_id: "pi_synthetic",
      },
    );
    for (const table of ["order_payments", "order_payouts", "order_events"])
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 1);
    assert.deepEqual((await db.query("select user_id,kind from notifications")).rows, [
      deletedRole === "seller"
        ? { user_id: other.buyer, kind: "payment_captured" }
        : { user_id: f.seller, kind: "order_paid" },
    ]);
    assert.equal(
      (
        await db.query("select count(*)::int n from shopping_events where user_id=$1", [
          other.buyer,
        ])
      ).rows[0].n,
      deletedRole === "buyer" ? 0 : 1,
    );
    if (deletedRole === "buyer")
      assert.equal(
        (
          await db.query("select personalization from shopping_privacy where subject=$1", [
            "u:" + other.buyer,
          ])
        ).rows[0].personalization,
        false,
      );
    assert.equal((await db.query("select count(*)::int n from mobile_push_outbox")).rows[0].n, 0);
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
  });

test(
  "notice enqueue serializes with recipient deletion in both orders without reviving a withdrawn account",
  {
    skip: process.env.BLUEBIRD_DELETION_PG !== "1" ? "Run with BLUEBIRD_DELETION_PG=1" : false,
    timeout: 60000,
  },
  async (t) =>
    withListingTestPostgres(async (connect) => {
      const a = await connect(),
        b = await connect();
      const provided = { exec: (sql) => a.query(sql), query: (sql, args) => a.query(sql, args) };
      await installDeletionPhotoWriterSchema(provided);
      await installPrivateRecordSources(provided);
      const { db, f, other, notice } = await setup(t, provided);
      await db.exec(migration());
      const waitLock = async (c, pid) => {
        for (let i = 0; i < 60; i++) {
          if (
            (await c.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]))
              .rows[0]?.wait_event_type === "Lock"
          )
            return;
          await pause(10);
        }
        throw Error("Expected recipient lock was not observed");
      };
      await a.query("begin");
      await notice(f.seller);
      const request = b.query("select mobile_request_deletion($1)", [f.seller]);
      await waitLock(a, b.processID);
      await a.query("commit");
      await request;
      await notice(f.seller);
      assert.equal(
        (await a.query("select count(*)::int n from notifications where user_id=$1", [f.seller]))
          .rows[0].n,
        1,
        "Only the committed pre-request notice remains for subsequent cleanup",
      );
      await b.query("begin");
      await b.query("select mobile_request_deletion($1)", [other.seller]);
      const late = notice(other.seller);
      await waitLock(b, a.processID);
      await b.query("commit");
      await late;
      assert.equal(
        (
          await a.query("select count(*)::int n from notifications where user_id=$1", [
            other.seller,
          ])
        ).rows[0].n,
        0,
      );
    }),
);
