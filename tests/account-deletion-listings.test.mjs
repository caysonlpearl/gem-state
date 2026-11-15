import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  listingRecordsDatabase,
  listingRecordsMigration,
} from "./helpers/account-deletion-listing-records-database.mjs";
import { seedListing } from "./helpers/account-deletion-owned-listings-database.mjs";
import { createAccountDeletionListingErasure } from "../src/lib/account-deletion-listings.server.ts";
const signal = () => AbortSignal.timeout(15000);
const failed = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
async function setup(t, { media = 1, inquiries = 0, conversations = 0, cache = true } = {}) {
  const db = await listingRecordsDatabase();
  t.after(() => db.close());
  const f = await seedListing(db),
    other = await seedListing(db);
  const path = `${f.seller}/listing.jpg`,
    evidence = `${f.seller}/evidence.jpg`;
  for (let i = 0; i < media; i++)
    await db.query(
      "insert into listing_media(ask_id,storage_path,rights_attested_at)values($1,$2,now())",
      [f.listing, `${f.seller}/listing-${i}.jpg`],
    );
  await db.query("insert into ask_media(ask_id,storage_path)values($1,$2)", [f.listing, evidence]);
  await db.query(
    "insert into listing_thumbnail_links(path,url,reuse_until)values($1,$2,now()+interval '1 day')",
    [`${f.seller}/listing-0.jpg`, "https://synthetic.invalid/signed"],
  );
  await db.query("insert into classified_listing_metrics(listing_id,views)values($1,10)", [
    f.listing,
  ]);
  await db.query(
    "insert into ask_events(ask_id,actor_id,event_type,note)values($1,$2,'created','Synthetic seller note')",
    [f.listing, f.seller],
  );
  await db.query(
    "insert into ask_events(ask_id,actor_id,event_type,note)values($1,$2,'price_changed','Synthetic note on another members listing')",
    [other.listing, f.seller],
  );
  for (let i = 0; i < inquiries; i++)
    await db.query(
      "insert into listing_inquiries(listing_id,seller_id,buyer_id,buyer_name,buyer_email,message)values($1,$2,$3,'Synthetic buyer','synthetic@example.invalid','Preserve the other buyer inquiry')",
      [f.listing, f.seller, other.buyer],
    );
  for (let i = 0; i < conversations; i++) {
    const buyer = randomUUID();
    await db.query("insert into auth.users(id)values($1)", [buyer]);
    const id = (
      await db.query(
        "insert into conversations(listing_id,buyer_id,seller_id)values($1,$2,$3)returning id",
        [f.listing, buyer, f.seller],
      )
    ).rows[0].id;
    await db.query(
      "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Preserve the other member message')",
      [id, buyer],
    );
  }
  const cacheRow = async (id, title = "Synthetic cached listing") => {
    await db.query(
      "insert into shopping_inventory(listing_id,card,category,price_cents,content_hash,valid_until)values($1,$2::jsonb,'jobs',100,'synthetic-v1',now()+interval '1 day')on conflict(listing_id)do update set card=excluded.card",
      [id, JSON.stringify({ id, title })],
    );
    await db.query(
      "insert into shopping_embeddings(listing_id,content_hash,model_version,embedding)values($1,'synthetic-v1','synthetic-model',array[0.1,0.2]::double precision[])on conflict(listing_id)do update set content_hash=excluded.content_hash",
      [id],
    );
  };
  if (cache) {
    await cacheRow(f.listing);
    await cacheRow(other.listing);
    await cacheRow("dealerfeed-synthetic-other");
  }
  const scan = async (job) => {
    await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
    for (let i = 0; i < 150; i++) {
      const r = (
        await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
          job.id,
          job.user_id,
          job.lease_token,
        ])
      ).rows[0].result;
      if (r.pass_done) break;
      if (i === 149) throw Error("Synthetic inventory did not finish");
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  };
  const dependencies = async (job) => {
    for (const name of ["conversations", "inquiries", "applications"])
      for (let i = 0; i < 200; i++) {
        const r = (
          await db.query(`select purge_account_deletion_${name}($1,$2,$3,100)result`, [
            job.id,
            job.user_id,
            job.lease_token,
          ])
        ).rows[0].result;
        if (r.pass_done) break;
        if (i === 199) throw Error("Synthetic prerequisite did not finish");
      }
  };
  const start = async ({ inventory = true, shared = true, user = f.seller } = {}) => {
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await db.exec("select set_config('parkvault.trusted_operation','off',false)");
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
    if (inventory) await scan(job);
    if (shared) await dependencies(job);
    return job;
  };
  let loseAck = false;
  const calls = [];
  const client = createClient(
    "https://udxxfuticbxwiehoepeg.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init),
            name = new URL(request.url).pathname.split("/").at(-1),
            args = await request.json();
          assert(
            ["purge_account_deletion_listings", "verify_account_deletion_listings"].includes(name),
          );
          calls.push({ name, args });
          await db.exec("set role service_role");
          let result;
          try {
            result = (
              await db.query(
                `select public.${name}(${Object.values(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")})result`,
                Object.values(args),
              )
            ).rows[0].result;
          } finally {
            await db.exec("reset role");
          }
          if (loseAck) {
            loseAck = false;
            throw Error("Synthetic private diagnostic");
          }
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_listings($1,$2,$3,$4)result", [
        job.id,
        job.user_id,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].result);
  const component = createAccountDeletionListingErasure(client);
  return {
    ...f,
    other,
    db,
    path,
    evidence,
    cacheRow,
    start,
    scan,
    dependencies,
    step,
    component,
    calls,
    loseAck: () => (loseAck = true),
  };
}
const snapshotTables = [
  "asks",
  "ask_events",
  "listing_media",
  "ask_media",
  "classified_listing_details",
  "classified_listing_metrics",
  "listing_thumbnail_links",
  "checkout_shipping_quotes",
  "shopping_inventory",
  "shopping_embeddings",
  "account_deletion_native_cache_owners",
  "listing_inquiries",
  "conversations",
  "conversation_messages",
  "saved_search_matches",
  "products",
  "fb_marketplace_import_items",
  "job_applications",
];
async function snapshot(db) {
  return Object.fromEntries(
    await Promise.all(
      snapshotTables.map(async (table) => [
        table,
        (
          await db.query(`select to_jsonb(r)row from public.${table} r order by to_jsonb(r)::text`)
        ).rows.map((r) => r.row),
      ]),
    ),
  );
}
function changedRows(before, after) {
  let changed = 0;
  for (const table of snapshotTables) {
    const key = (r) => r.id ?? r.path ?? r.listing_id,
      a = new Map(before[table].map((r) => [key(r), JSON.stringify(r)])),
      b = new Map(after[table].map((r) => [key(r), JSON.stringify(r)]));
    for (const id of new Set([...a.keys(), ...b.keys()])) if (a.get(id) !== b.get(id)) changed++;
  }
  return changed;
}
async function finish(f, job) {
  const pages = [];
  for (let i = 0; i < 200; i++) {
    const p = await f.component.step(job, signal());
    assert(p.changed <= 100);
    pages.push(p);
    if (p.passDone) return pages;
  }
  throw Error("Synthetic listing cleanup did not finish");
}
test("SDK listing cleanup removes owned public records and cache vectors, retains others and preserves durable media discovery", async (t) => {
  const f = await setup(t, { media: 4 }),
    job = await f.start();
  f.loseAck();
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(f.calls.length, 1);
  const pages = await finish(f, job);
  assert(pages.some((p) => p.source === "paused"));
  assert(pages.some((p) => p.source === "media" && p.changed === 2));
  assert.equal(
    (await f.db.query("select count(*)::int n from asks where id=$1", [f.listing])).rows[0].n,
    0,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from asks where id=$1", [f.other.listing])).rows[0].n,
    1,
  );
  assert.deepEqual(
    (await f.db.query("select listing_id from shopping_inventory order by listing_id")).rows
      .map((r) => r.listing_id)
      .sort(),
    [f.other.listing, "dealerfeed-synthetic-other"].sort(),
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from shopping_embeddings where listing_id=$1", [
        f.listing,
      ])
    ).rows[0].n,
    0,
  );
  const event = (
    await f.db.query("select actor_id,note,event_type::text from ask_events where ask_id=$1", [
      f.other.listing,
    ])
  ).rows[0];
  assert.deepEqual(event, { actor_id: null, note: null, event_type: "price_changed" });
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source in('listing_media','ask_media')",
        [job.id],
      )
    ).rows[0].n,
    5,
  );
  assert.deepEqual(await f.component.step(job, signal()), {
    source: null,
    changed: 0,
    passDone: true,
  });
  await f.db.query("delete from auth.users where id=$1", [f.seller]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("listing cleanup detaches hundreds of retained inquiries and conversations in bounded pages without erasing other authors", async (t) => {
  const f = await setup(t, { inquiries: 205, conversations: 5, media: 0 }),
    job = await f.start();
  const pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "inquiries").map((p) => p.changed),
    [100, 100, 5],
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from listing_inquiries where listing_id is null and seller_id is null and message=$1",
        ["Preserve the other buyer inquiry"],
      )
    ).rows[0].n,
    205,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from conversation_messages where body='Preserve the other member message'",
      )
    ).rows[0].n,
    5,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from conversations where listing_id is null")).rows[0]
      .n,
    5,
  );
});
test("a stale inventory refresh and vector writer cannot resurrect native cards after deletion starts or completes", async (t) => {
  const f = await setup(t),
    job = await f.start();
  const before = (
    await f.db.query("select card from shopping_inventory where listing_id=$1", [f.listing])
  ).rows[0].card;
  await f.cacheRow(f.listing, "Must not be collected");
  assert.deepEqual(
    (await f.db.query("select card from shopping_inventory where listing_id=$1", [f.listing]))
      .rows[0].card,
    before,
  );
  await finish(f, job);
  await f.cacheRow(f.listing, "Must not resurrect");
  assert.equal(
    (
      await f.db.query("select count(*)::int n from shopping_inventory where listing_id=$1", [
        f.listing,
      ])
    ).rows[0].n,
    0,
  );
  await f.db.query(
    "insert into listing_thumbnail_links(path,url,reuse_until)values($1,$2,now()+interval '1 day')",
    [`${f.seller}/new-stale.jpg`, "https://synthetic.invalid/stale"],
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from listing_thumbnail_links where path like $1", [
        `${f.seller}/%`,
      ])
    ).rows[0].n,
    0,
  );
});
test("missing media discovery stops reference removal until the exact current source scan completes", async (t) => {
  const f = await setup(t),
    job = await f.start({ inventory: false });
  for (let i = 0; i < 5; i++) {
    try {
      await f.step(job);
    } catch (e) {
      assert.match(e.message, /inventory/);
      break;
    }
  }
  assert.equal(
    (await f.db.query("select count(*)::int n from listing_media where ask_id=$1", [f.listing]))
      .rows[0].n,
    1,
  );
  await f.scan(job);
  await finish(f, job);
});
test("financial, moderation and shared-business listing dependencies remain intact until explicit retention composition", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await f.db.query("insert into classified_listing_reports(id,listing_id)values($1,$2)", [
    randomUUID(),
    f.listing,
  ]);
  // The source guard prevents further unrelated writes; the known report FK
  // and parent lock make this a retained root, not a destructive cascade.
  for (let i = 0; i < 4; i++) {
    try {
      await f.step(job);
    } catch (e) {
      assert.match(e.message, /retention/);
      break;
    }
  }
  assert.equal(
    (await f.db.query("select count(*)::int n from asks where id=$1", [f.listing])).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from classified_listing_reports where listing_id=$1",
        [f.listing],
      )
    ).rows[0].n,
    1,
  );
});

test("minimum-size passes count real media callbacks and signed-link removal in their physical write bound", async (t) => {
  const f = await setup(t, { media: 2, inquiries: 7, conversations: 2 });
  const foreignPath = `${f.other.seller}/borrowed.jpg`;
  await f.db.query(
    "insert into listing_media(ask_id,storage_path,rights_attested_at)values($1,$2,now())",
    [f.listing, foreignPath],
  );
  await f.db.query(
    "insert into listing_thumbnail_links(path,url,reuse_until)values($1,$2,now()+interval '1 day')",
    [foreignPath, "https://synthetic.invalid/borrowed"],
  );
  const job = await f.start();
  let done = false,
    sawThree = false;
  for (let n = 0; n < 100; n++) {
    const before = await snapshot(f.db),
      page = await f.step(job, 3),
      after = await snapshot(f.db);
    assert.equal(page.changed, changedRows(before, after), page.source);
    assert(page.changed <= 3);
    if (page.source === "media" && page.changed === 3) sawThree = true;
    if (page.pass_done) {
      done = true;
      break;
    }
  }
  assert(done);
  assert(
    sawThree,
    "One media reference, its signed-link row and its real Ask counter count as three writes",
  );
});

test("shared contribution cleanup is required before root erasure and Auth deletion cannot shortcut owned listings or audit notes", async (t) => {
  const f = await setup(t, { inquiries: 1, conversations: 1 }),
    job = await f.start({ shared: false }),
    before = await snapshot(f.db);
  await assert.rejects(f.step(job), /shared contribution/);
  assert.deepEqual(await snapshot(f.db), before);
  await assert.rejects(
    f.db.query("delete from auth.users where id=$1", [f.seller]),
    /foreign key|immutable/,
  );
  await f.dependencies(job);
  await finish(f, job);
});

test("checkout address and rate snapshots remain intact for payment settlement, including variant-only quotes", async (t) => {
  const f = await setup(t, { media: 0 });
  await f.db.query(
    "insert into checkout_shipping_quotes(buyer_id,ask_id,address,rates)values($1,$2,'{\"street\":\"Synthetic private address\"}','[]')",
    [f.seller, f.other.listing],
  );
  await f.db.query(
    "insert into checkout_shipping_quotes(buyer_id,variant_id,address,rates)values($1,$2,'{\"street\":\"Synthetic variant address\"}','[]')",
    [f.seller, f.other.variant],
  );
  const before = (await f.db.query("select * from checkout_shipping_quotes order by id")).rows,
    job = await f.start();
  await assert.rejects(f.step(job), /financial retention/);
  assert.deepEqual(
    (await f.db.query("select * from checkout_shipping_quotes order by id")).rows,
    before,
  );
  await assert.rejects(
    f.db.query("delete from checkout_shipping_quotes where buyer_id=$1", [f.seller]),
    /unavailable/,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from checkout_shipping_quotes")).rows[0].n,
    2,
  );
});

test("new parent, media, quote and audit references cannot revive a member after deletion request", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const [sql, args] of [
    [
      "insert into asks(product_id,variant_id,seller_id,price_cents)values($1,$2,$3,100)",
      [f.product, f.variant, f.seller],
    ],
    [
      "insert into listing_media(ask_id,storage_path,rights_attested_at)values($1,$2,now())",
      [f.listing, `${f.seller}/late.jpg`],
    ],
    [
      "insert into checkout_shipping_quotes(buyer_id,variant_id,address,rates)values($1,$2,'{}','[]')",
      [f.seller, f.other.variant],
    ],
    [
      "insert into ask_events(ask_id,actor_id,event_type)values($1,$2,'created')",
      [f.other.listing, f.seller],
    ],
    ["update asks set seller_id=$1 where id=$2", [f.other.seller, f.listing]],
    ["update classified_listing_details set city='Changed'where listing_id=$1", [f.listing]],
  ])
    await assert.rejects(f.db.query(sql, args), /unavailable/);
  const before = (
    await f.db.query("select views from classified_listing_metrics where listing_id=$1", [
      f.listing,
    ])
  ).rows[0].views;
  await f.db.query("update classified_listing_metrics set views=views+1 where listing_id=$1", [
    f.listing,
  ]);
  assert.equal(
    (
      await f.db.query("select views from classified_listing_metrics where listing_id=$1", [
        f.listing,
      ])
    ).rows[0].views,
    before,
    "Optional metrics skip collection without breaking a read",
  );
  await finish(f, job);
});

test("unknown children, hooks, policies and stale leases fail closed without allowing whole-job completion", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await f.db.exec(
    "create table unexpected_listing_child(id uuid references asks(id)on delete cascade)",
  );
  await assert.rejects(f.step(job), /schema and provenance review/);
  await f.db.exec("drop table unexpected_listing_child");
  await f.db.exec("alter table listing_media disable trigger listing_media_count");
  await assert.rejects(f.step(job), /schema and provenance review/);
  await f.db.exec("alter table listing_media enable trigger listing_media_count");
  await f.db.exec("create policy unexpected_listing_policy on asks for select using(true)");
  await assert.rejects(f.step(job), /schema and provenance review/);
  await f.db.exec("drop policy unexpected_listing_policy on asks");
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
  assert.equal(
    (await f.db.query("select count(*)::int n from asks where id=$1", [f.listing])).rows[0].n,
    1,
  );
});

test("ordinary listing removal preserves private cache ownership so later account deletion clears orphaned cards and vectors", async (t) => {
  const f = await setup(t);
  await f.db.query("delete from asks where id=$1", [f.listing]);
  assert.deepEqual(
    (
      await f.db.query(
        "select user_id from account_deletion_native_cache_owners where listing_id=$1",
        [f.listing],
      )
    ).rows,
    [{ user_id: f.seller }],
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from shopping_embeddings where listing_id=$1", [
        f.listing,
      ])
    ).rows[0].n,
    1,
  );
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.seller]), /foreign key/);
  const job = await f.start();
  const pages = await finish(f, job);
  assert(pages.some((p) => p.source === "inventory" && p.changed === 3));
  for (const table of [
    "shopping_inventory",
    "shopping_embeddings",
    "account_deletion_native_cache_owners",
  ])
    assert.equal(
      (await f.db.query(`select count(*)::int n from ${table} where listing_id=$1`, [f.listing]))
        .rows[0].n,
      0,
    );
  assert.equal((await f.db.query("select count(*)::int n from shopping_inventory")).rows[0].n, 2);
});

test("bounded disabled-worker preparation attributes existing native cache and prunes legacy orphans before activation", async (t) => {
  const db = await listingRecordsDatabase({ install: false });
  t.after(() => db.close());
  const f = await seedListing(db);
  const nativeIds = [f.listing, ...Array.from({ length: 4 }, () => randomUUID())];
  for (const id of [...nativeIds, "dealerfeed-synthetic-external"]) {
    await db.query(
      "insert into shopping_inventory(listing_id,card,category,price_cents,content_hash,valid_until)values($1,$2::jsonb,'jobs',100,'synthetic-v1',now()+interval '1 day')",
      [id, JSON.stringify({ id, title: "Synthetic existing cache" })],
    );
    await db.query(
      "insert into shopping_embeddings(listing_id,content_hash,model_version,embedding)values($1,'synthetic-v1','synthetic-model',array[0.1,0.2]::double precision[])",
      [id],
    );
  }
  await db.exec(listingRecordsMigration());
  assert.equal(
    (await db.query("select account_deletion_native_cache_ready() ready")).rows[0].ready,
    false,
  );
  await assert.rejects(
    db.exec("update account_deletion_controls set worker_enabled=true"),
    /provenance before activation/,
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query("select * from account_deletion_native_cache_owners"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select prepare_account_deletion_native_cache(3)"),
      /permission denied/,
    );
    await db.exec("reset role");
  }
  let ready = false,
    total = 0;
  for (let i = 0; i < 6 && !ready; i++) {
    const before = await snapshot(db);
    await db.exec("set role service_role");
    const page = (await db.query("select prepare_account_deletion_native_cache(3) result")).rows[0]
      .result;
    await assert.rejects(
      db.query("delete from account_deletion_native_cache_owners"),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(page.changed, changedRows(before, await snapshot(db)));
    assert(page.changed <= 3);
    ready = page.ready;
    total += page.changed;
  }
  assert(ready);
  assert.equal(total, 9);
  assert.deepEqual(
    (await db.query("select listing_id,user_id from account_deletion_native_cache_owners")).rows,
    [{ listing_id: f.listing, user_id: f.seller }],
  );
  assert.deepEqual(
    (await db.query("select listing_id from shopping_inventory order by listing_id")).rows
      .map((r) => r.listing_id)
      .sort(),
    [f.listing, "dealerfeed-synthetic-external"].sort(),
  );
  assert.equal((await db.query("select count(*)::int n from shopping_embeddings")).rows[0].n, 2);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  await assert.rejects(
    db.query("select prepare_account_deletion_native_cache(3)"),
    /disabled native cache preparation/,
  );
});

test("ordinary listing removal retains quote address and rates needed by an in-flight checkout callback", async (t) => {
  const f = await setup(t);
  await f.db.query(
    "insert into checkout_shipping_quotes(buyer_id,ask_id,address,rates)values($1,$2,$3::jsonb,$4::jsonb)",
    [
      f.other.buyer,
      f.listing,
      JSON.stringify({ city: "Synthetic test address" }),
      JSON.stringify([{ id: "synthetic-rate" }]),
    ],
  );
  const before = (await f.db.query("select * from checkout_shipping_quotes")).rows[0];
  await f.db.query("delete from asks where id=$1", [f.listing]);
  assert.deepEqual((await f.db.query("select * from checkout_shipping_quotes")).rows[0], {
    ...before,
    ask_id: null,
  });
});

test("every financial and business dependency is retained rather than silently cascaded", async (t) => {
  for (const kind of [
    "orders",
    "quotes",
    "offers",
    "matches",
    "upgrades",
    "dealer",
    "dealer_links",
    "imports",
    "requests",
    "approver",
  ]) {
    const f = await setup(t, { media: 0, cache: false });
    if (kind === "orders")
      await f.db.query("insert into orders(id,buyer_id,seller_id,ask_id)values($1,$2,$3,$4)", [
        randomUUID(),
        f.buyer,
        f.seller,
        f.listing,
      ]);
    if (kind === "quotes")
      await f.db.query(
        "insert into checkout_shipping_quotes(buyer_id,ask_id,address,rates)values($1,$2,'{}','[]')",
        [f.other.buyer, f.listing],
      );
    if (kind === "offers")
      await f.db.query("insert into listing_offers(id,ask_id)values($1,$2)", [
        randomUUID(),
        f.listing,
      ]);
    if (kind === "matches")
      await f.db.query("insert into market_matches(id,ask_id)values($1,$2)", [
        randomUUID(),
        f.listing,
      ]);
    if (kind === "upgrades") {
      const upgrade = randomUUID();
      await f.db.query("insert into listing_upgrade_catalog(id)values($1)", [upgrade]);
      await f.db.query(
        "insert into listing_upgrade_purchases(id,user_id,listing_id,upgrade_id,amount_cents,status)values($1,$2,$3,$4,1000,'pending')",
        [randomUUID(), f.seller, f.listing, upgrade],
      );
    }
    if (kind === "dealer") {
      const id = randomUUID();
      await f.db.query("insert into dealer_profiles(id,owner_user_id)values($1,$2)", [
        id,
        f.seller,
      ]);
      await f.db.query("update asks set dealer_id=$1 where id=$2", [id, f.listing]);
    }
    if (kind === "dealer_links")
      await f.db.query("insert into dealer_inventory_listing_links(id,listing_id)values($1,$2)", [
        randomUUID(),
        f.listing,
      ]);
    if (kind === "imports")
      await f.db.query(
        "insert into fb_marketplace_import_items(id,listing_id,seller_id)values($1,$2,$3)",
        [randomUUID(), f.listing, f.seller],
      );
    if (kind === "requests")
      await f.db.query(
        "insert into seller_listing_requests(id,seller_id,converted_ask_id)values($1,$2,$3)",
        [randomUUID(), f.seller, f.listing],
      );
    if (kind === "approver")
      await f.db.query("update asks set approved_by=$1 where id=$2", [f.seller, f.other.listing]);
    const rootBefore = (
        await f.db.query("select to_jsonb(a)row from asks a where id=$1", [f.listing])
      ).rows[0].row,
      job = await f.start();
    let held = false;
    for (let i = 0; i < 5; i++) {
      try {
        await f.step(job);
      } catch (e) {
        assert.match(e.message, /retention/);
        held = true;
        break;
      }
    }
    assert(held, kind);
    assert.deepEqual(
      (await f.db.query("select to_jsonb(a)row from asks a where id=$1", [f.listing])).rows[0].row,
      rootBefore,
      kind,
    );
  }
});
