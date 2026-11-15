import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createAccountDeletionSourcingErasure } from "../src/lib/account-deletion-sourcing.server.ts";
import {
  sourcingDatabase,
  sourcingMigration,
} from "./helpers/account-deletion-sourcing-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
async function setup(t) {
  const db = await sourcingDatabase();
  t.after(() => db.close());
  const own = await seedCatalog(db),
    other = await seedCatalog(db),
    third = await seedCatalog(db);
  await db.query("insert into sourcing_fixture_shoppers(user_id)values($1),($2),($3)", [
    own.seller,
    other.seller,
    third.seller,
  ]);
  await db.exec(
    "update market_settings set custom_sourcing_requests_enabled=true,shopper_quotes_enabled=true",
  );
  const as = (user) => fixtureMemberSession(db, user);
  const request = async (user = own.seller, paths = []) => {
    await as(user);
    return (
      await db.query(
        "select create_sourcing_request($1,20000,'Original request note',null,null,$2::text[])id",
        [other.variant, paths],
      )
    ).rows[0].id;
  };
  const quote = async (id, user = other.seller) => {
    await as(user);
    return (
      await db.query("select submit_shopper_quote($1,1000,200,100,7,'Original shopper note',7)id", [
        id,
      ])
    ).rows[0].id;
  };
  const scan = async (job) => {
    await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
    for (let i = 0; i < 100; i++) {
      const r = (
        await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)r", [
          job.id,
          own.seller,
          job.lease_token,
        ])
      ).rows[0].r;
      if (r.pass_done) break;
      if (i === 99) throw Error("Inventory did not finish");
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  };
  const start = async ({ inventory = true } = {}) => {
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await db.query("select mobile_request_deletion($1)", [own.seller]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [own.seller],
      )
    ).rows[0];
    if (inventory) await scan(job);
    return job;
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_sourcing($1,$2,$3,$4)r", [
        job.id,
        own.seller,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].r);
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        ["sourcing_requests", "shopper_quotes", "sourcing_events", "request_media", "orders"].map(
          async (table) => [
            table,
            (
              await db.query(`select to_jsonb(t)r from ${table} t order by to_jsonb(t)::text`)
            ).rows.map((r) => r.r),
          ],
        ),
      ),
    );
  return { db, own, other, third, as, request, quote, scan, start, step, snapshot };
}
async function finish(f, job, limit = 100) {
  const pages = [];
  for (let i = 0; i < 500; i++) {
    const p = await f.step(job, limit);
    assert(p.changed <= limit);
    pages.push(p);
    if (p.pass_done) return pages;
  }
  throw Error("Source cleanup did not finish");
}
const physical = (a, b) =>
  Object.keys(a).reduce((sum, t) => {
    const x = new Map(a[t].map((r) => [r.id, JSON.stringify(r)])),
      y = new Map(b[t].map((r) => [r.id, JSON.stringify(r)]));
    return (
      sum + [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k)).length
    );
  }, 0);
test("request deletion preserves another shopper quote and authored history with unavailable links", async (t) => {
  const f = await setup(t),
    id = await f.request(),
    quote = await f.quote(id);
  const before = (await f.db.query("select * from shopper_quotes where id=$1", [quote])).rows[0],
    history = (
      await f.db.query("select * from sourcing_events where actor_id=$1", [f.other.seller])
    ).rows[0];
  const job = await f.start();
  await finish(f, job);
  const after = (await f.db.query("select * from shopper_quotes where id=$1", [quote])).rows[0];
  assert(after.unavailable_at);
  assert.deepEqual(
    { ...after, unavailable_at: null, updated_at: before.updated_at },
    { ...before, request_id: null },
  );
  const event = (await f.db.query("select * from sourcing_events where id=$1", [history.id]))
    .rows[0];
  assert(event.request_unavailable_at);
  assert.deepEqual({ ...event, request_unavailable_at: null }, { ...history, request_id: null });
  await f.as(f.other.seller);
  await assert.rejects(
    f.db.query("select withdraw_shopper_quote($1)", [quote]),
    /request unavailable/,
  );
  await f.as(f.third.seller);
  await assert.rejects(
    f.db.query("select accept_shopper_quote($1)", [quote]),
    /request unavailable/,
  );
  assert.equal((await f.db.query("select count(*)::int n from orders")).rows[0].n, 0);
});
test("own quotes and event text disappear while another buyer note and accurate quote count remain", async (t) => {
  const f = await setup(t),
    id = await f.request(f.other.seller);
  await f.quote(id, f.own.seller);
  const otherQuote = await f.quote(id, f.third.seller);
  const before = (await f.db.query("select * from sourcing_requests where id=$1", [id])).rows[0];
  assert.equal(before.quote_count, 2);
  const job = await f.start();
  let done = false;
  for (let i = 0; i < 20 && !done; i++) {
    const a = await f.snapshot(),
      p = await f.step(job, 2);
    assert.equal(p.changed, physical(a, await f.snapshot()));
    done = p.pass_done;
  }
  assert(done);
  const after = (await f.db.query("select * from sourcing_requests where id=$1", [id])).rows[0];
  assert.deepEqual({ ...after, updated_at: before.updated_at }, { ...before, quote_count: 1 });
  assert.equal(
    (await f.db.query("select count(*)::int n from shopper_quotes where id=$1", [otherQuote]))
      .rows[0].n,
    1,
  );
});
test("more than 200 reference photos are inventoried and drained with bounded truthful media counters", async (t) => {
  const f = await setup(t),
    paths = Array.from({ length: 205 }, (_, i) => `${f.own.seller}/synthetic-${i}.jpg`),
    id = await f.request(f.own.seller, paths);
  // An unrelated stale counter must not prevent removing owned reference media.
  await f.db.query("update sourcing_requests set quote_count=17 where id=$1", [id]);
  const job = await f.start(),
    pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "media").map((p) => p.changed),
    [100, 100, 8],
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source='request_media'",
        [job.id],
      )
    ).rows[0].n,
    205,
  );
});
test("more than 200 other-actor quote-event links retire before an owned quote is erased", async (t) => {
  const f = await setup(t),
    id = await f.request(f.other.seller),
    quote = await f.quote(id, f.own.seller);
  await f.as(f.third.seller);
  await f.db.query(
    "insert into sourcing_events(request_id,quote_id,actor_id,event_type,note)select $1,$2,$3,'quote_submitted','Original other-member note '||n from generate_series(1,205)n",
    [id, quote, f.third.seller],
  );
  const job = await f.start(),
    pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "quote_links").map((p) => p.changed),
    [100, 100, 5],
  );
  const rows = (
    await f.db.query(
      "select quote_id,quote_unavailable_at,note from sourcing_events where actor_id=$1",
      [f.third.seller],
    )
  ).rows;
  assert.equal(rows.length, 205);
  assert(
    rows.every(
      (r) =>
        r.quote_id === null &&
        r.quote_unavailable_at &&
        r.note.startsWith("Original other-member note"),
    ),
  );
});
test("ordinary active quote acceptance still produces one linked order and defers deletion as financial evidence", async (t) => {
  const f = await setup(t),
    id = await f.request(),
    quote = await f.quote(id);
  await f.as(f.own.seller);
  const order = (await f.db.query("select accept_shopper_quote($1)id", [quote])).rows[0].id;
  const row = (
    await f.db.query("select buyer_id,seller_id,fee_snapshot from orders where id=$1", [order])
  ).rows[0];
  assert.equal(row.buyer_id, f.own.seller);
  assert.equal(row.seller_id, f.other.seller);
  assert.equal(row.fee_snapshot.quote_id, quote);
  const before = await f.snapshot(),
    job = await f.start();
  await assert.rejects(f.step(job), /retention requires explicit handling/);
  assert.deepEqual(await f.snapshot(), before);
});
test("accepted, matched and unrecognized history is held even without a current accepted-quote pointer", async (t) => {
  for (const kind of ["accepted", "event", "snapshot", "system"])
    await t.test(kind, async (t) => {
      const f = await setup(t),
        id = await f.request(f.other.seller),
        quote = await f.quote(id, f.own.seller);
      if (kind === "accepted")
        await f.db.query("update shopper_quotes set status='accepted'where id=$1", [quote]);
      if (kind === "event")
        await f.db.query(
          "insert into sourcing_events(request_id,quote_id,actor_id,event_type,note)values($1,$2,$3,'unreviewed_financial_event','Preserve evidence')",
          [id, quote, f.other.seller],
        );
      if (kind === "snapshot")
        await f.db.query(
          "insert into orders(buyer_id,seller_id,product_id,variant_id,origin,status,currency,merchandise_cents,buyer_fee_cents,seller_fee_cents,shipping_cents,tax_cents,total_cents,payout_cents,fee_schedule_id,fee_snapshot)values($1,$2,$3,$4,'sourcing_quote','awaiting_payment','USD',1000,0,0,0,0,1000,1000,(select id from fee_schedules limit 1),jsonb_build_object('quote_id',$5::text))",
          [f.other.seller, f.own.seller, f.other.product, f.other.variant, quote],
        );
      if (kind === "system")
        await f.db.query(
          "insert into sourcing_events(request_id,quote_id,event_type,note)values($1,$2,'quote_submitted','Preserve unattributed history')",
          [id, quote],
        );
      const before = await f.snapshot(),
        job = await f.start();
      await assert.rejects(f.step(job), /retention requires explicit handling/);
      assert.deepEqual(await f.snapshot(), before);
    });
});
test("pending quote owners can be declined by actual buyer cancellation without allowing other edits or new orders", async (t) => {
  const f = await setup(t),
    id = await f.request(f.other.seller),
    quote = await f.quote(id, f.own.seller),
    job = await f.start();
  await f.as(f.other.seller);
  await f.db.query("select cancel_sourcing_request($1)", [id]);
  assert.equal(
    (await f.db.query("select status from shopper_quotes where id=$1", [quote])).rows[0].status,
    "declined",
  );
  await assert.rejects(
    f.db.query("update shopper_quotes set availability_note='Late edit'where id=$1", [quote]),
    /unavailable/i,
  );
  await f.db.exec("select set_config('request.jwt.claims','{}',false)");
  await finish(f, job);
});
test("pending request owners reject new quote/event/media writes and private media access; stale discovery cannot remove photos", async (t) => {
  const f = await setup(t),
    id = await f.request(f.own.seller, [`${f.own.seller}/synthetic.jpg`]),
    job = await f.start({ inventory: false });
  await f.as(f.other.seller);
  await assert.rejects(
    f.db.query("select submit_shopper_quote($1,1000,200,100,7,'Late',7)", [id]),
    /unavailable/i,
  );
  for (const [sql, args] of [
    [
      "insert into request_media(request_id,storage_path)values($1,$2)",
      [id, `${f.own.seller}/late.jpg`],
    ],
    [
      "insert into sourcing_events(request_id,actor_id,event_type)values($1,$2,'request_created')",
      [id, f.other.seller],
    ],
    ["select * from sourcing_request_media($1,$2)", [id, f.other.seller]],
  ])
    await assert.rejects(f.db.query(sql, args), /unavailable/i);
  await f.db.exec("select set_config('request.jwt.claims','{}',false)");
  // The first pass can remove the caller's ordinary event, not its media key.
  await f.step(job);
  await assert.rejects(f.step(job), /media inventory is incomplete/);
  await f.scan(job);
  await finish(f, job);
});
test("schema, privileges and stale leases are checked and unexpected incoming cascades block installation", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec("set role " + role);
    await assert.rejects(f.step(job), /permission denied/);
    await f.db.exec("reset role");
  }
  await f.db.exec("grant execute on function sourcing_request_media(uuid,uuid)to authenticated");
  await assert.rejects(f.step(job), /schema review|erasure unavailable/);
  await f.db.exec("revoke execute on function sourcing_request_media(uuid,uuid)from authenticated");
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/i);
  const db = await sourcingDatabase({ install: false });
  t.after(() => db.close());
  await db.exec(
    "create table unexpected_sourcing_child(id uuid references shopper_quotes(id)on delete cascade)",
  );
  await assert.rejects(db.exec(sourcingMigration()), /relationships/);
  await db.exec("rollback");
});
test("more than 200 surviving shopper quotes retire without rewriting their prices, notes or statuses", async (t) => {
  const f = await setup(t),
    id = await f.request();
  const users = (
    await f.db.query(
      "insert into auth.users(id)select gen_random_uuid()from generate_series(1,205)returning id",
    )
  ).rows.map((r) => r.id);
  await f.db.query(
    "insert into shopper_quotes(request_id,shopper_id,merch_cost_cents,shopper_comp_cents,shipping_estimate_cents,buyer_fee_estimate_cents,delivered_estimate_cents,availability_note,fulfillment_window_days,expires_at)select $1,u,1000,0,0,0,1000,'Original other shopper quote',7,now()+interval '7 days'from unnest($2::uuid[])u",
    [id, users],
  );
  await f.db.query("update sourcing_requests set quote_count=205 where id=$1", [id]);
  const before = (
    await f.db.query("select * from shopper_quotes where request_id=$1 order by id", [id])
  ).rows;
  const job = await f.start(),
    pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "request_quotes").map((p) => p.changed),
    [100, 100, 5],
  );
  const after = (await f.db.query("select * from shopper_quotes order by id")).rows;
  assert(after.every((r) => r.request_id === null && r.unavailable_at));
  const content = (r) => {
    const { updated_at, unavailable_at, ...payload } = r;
    return payload;
  };
  assert.deepEqual(
    after.map(content),
    before.map((r) => content({ ...r, request_id: null })),
  );
});
test("an active buyer can accept an active winning quote while a deletion-pending losing quote is only declined", async (t) => {
  const f = await setup(t),
    id = await f.request(f.other.seller),
    loser = await f.quote(id, f.own.seller),
    winner = await f.quote(id, f.third.seller);
  const before = (await f.db.query("select * from shopper_quotes where id=$1", [loser])).rows[0];
  await f.start();
  await f.as(f.other.seller);
  const order = (await f.db.query("select accept_shopper_quote($1)id", [winner])).rows[0].id;
  const after = (await f.db.query("select * from shopper_quotes where id=$1", [loser])).rows[0];
  assert.deepEqual({ ...after, updated_at: before.updated_at }, { ...before, status: "declined" });
  assert.deepEqual(
    (await f.db.query("select buyer_id,seller_id from orders where id=$1", [order])).rows[0],
    { buyer_id: f.other.seller, seller_id: f.third.seller },
  );
});
test("the SDK does not retry a lost acknowledgment and verifies only after source cleanup and Auth absence", async (t) => {
  const f = await setup(t);
  await f.request();
  const job = await f.start();
  let lost = true,
    calls = 0;
  const client = createClient(
      "https://udxxfuticbxwiehoepeg.supabase.co",
      "sb_secret_synthetic_fixture_only_123456",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            const req = new Request(input, init),
              name = new URL(req.url).pathname.split("/").at(-1),
              args = await req.json();
            calls++;
            assert(
              ["purge_account_deletion_sourcing", "verify_account_deletion_sourcing"].includes(
                name,
              ),
            );
            await f.db.exec("set role service_role");
            let value;
            try {
              value = (
                await f.db.query(
                  `select ${name}(${Object.values(args)
                    .map((_, i) => "$" + (i + 1))
                    .join(",")})r`,
                  Object.values(args),
                )
              ).rows[0].r;
            } finally {
              await f.db.exec("reset role");
            }
            if (lost) {
              lost = false;
              throw Error("Synthetic private provider diagnostic");
            }
            return new Response(JSON.stringify(value), {
              headers: { "content-type": "application/json" },
            });
          },
        },
      },
    ),
    component = createAccountDeletionSourcingErasure(client),
    signal = () => AbortSignal.timeout(15000);
  await assert.rejects(
    component.step(job, signal()),
    (e) => e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause,
  );
  assert.equal(calls, 1);
  for (let i = 0; i < 20; i++) {
    const p = await component.step(job, signal());
    if (p.passDone) break;
    if (i === 19) throw Error("SDK source did not finish");
  }
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  const before = await f.snapshot();
  await assert.rejects(
    component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  assert.deepEqual(await f.snapshot(), before);
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  for (const name of ["listings", "catalog"])
    for (let i = 0; i < 50; i++) {
      const p = (
        await f.db.query(`select purge_account_deletion_${name}($1,$2,$3,100)r`, [
          job.id,
          f.own.seller,
          job.lease_token,
        ])
      ).rows[0].r;
      if (p.pass_done) break;
      if (i === 49) throw Error("Subsequent component did not finish");
    }
  await f.db.query("delete from auth.users where id=$1", [f.own.seller]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("installation cannot adopt an unexpected pre-existing completion callback", async (t) => {
  const db = await sourcingDatabase({ install: false });
  t.after(() => db.close());
  const before = (await db.query("select hooks from account_deletion_private_contract where id"))
    .rows[0].hooks;
  await db.exec(
    "create function unexpected_sourcing_job()returns trigger language plpgsql as $$begin return new;end$$;create trigger unexpected_sourcing_job after update on account_deletion_jobs for each row execute function unexpected_sourcing_job()",
  );
  await assert.rejects(db.exec(sourcingMigration()), /disabled sourcing prerequisites/);
  await db.exec("rollback");
  assert.deepEqual(
    (await db.query("select hooks from account_deletion_private_contract where id")).rows[0].hooks,
    before,
  );
});
test("two deleting members finish across split quote/history retirement while a third actor keeps their note", async (t) => {
  const f = await setup(t),
    id = await f.request(),
    quote = await f.quote(id);
  await f.as(f.third.seller);
  const extra = (
    await f.db.query(
      "insert into sourcing_events(request_id,quote_id,actor_id,event_type,note)values($1,$2,$3,'quote_submitted','Third member original note')returning id",
      [id, quote, f.third.seller],
    )
  ).rows[0].id;
  const a = await f.start();
  assert.equal((await f.step(a)).source, "events");
  assert.equal((await f.step(a)).source, "request_quotes");
  assert.equal(
    (await f.db.query("select request_id from shopper_quotes where id=$1", [quote])).rows[0]
      .request_id,
    null,
  );
  assert.equal(
    (await f.db.query("select request_id from sourcing_events where id=$1", [extra])).rows[0]
      .request_id,
    id,
  );
  await f.db.query("select mobile_request_deletion($1)", [f.other.seller]);
  const b = (
    await f.db.query(
      "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
      [f.other.seller],
    )
  ).rows[0];
  for (let i = 0; i < 20; i++) {
    const r = (
      await f.db.query("select purge_account_deletion_sourcing($1,$2,$3,100)r", [
        b.id,
        f.other.seller,
        b.lease_token,
      ])
    ).rows[0].r;
    if (r.pass_done) break;
    if (i === 19) throw Error("Second member could not finish");
  }
  await finish(f, a);
  const event = (await f.db.query("select * from sourcing_events where id=$1", [extra])).rows[0];
  assert.equal(event.note, "Third member original note");
  assert.equal(event.actor_id, f.third.seller);
  assert.equal(event.quote_id, null);
  assert.equal(event.request_id, null);
  assert(event.quote_unavailable_at && event.request_unavailable_at);
  assert.equal(
    (await f.db.query("select count(*)::int n from shopper_quotes where id=$1", [quote])).rows[0].n,
    0,
  );
});
