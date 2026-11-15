import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  catalogDatabase,
  seedCatalog,
  catalogMigration,
} from "./helpers/account-deletion-catalog-database.mjs";
import { createAccountDeletionCatalogErasure } from "../src/lib/account-deletion-catalog.server.ts";
const signal = () => AbortSignal.timeout(15000);
async function setup(t, { images = 0, facts = 0, models = false } = {}) {
  const db = await catalogDatabase();
  t.after(() => db.close());
  const f = await seedCatalog(db),
    other = await seedCatalog(db);
  for (let i = 0; i < images; i++)
    await db.query(
      "insert into product_images(product_id,variant_id,storage_path)values($1,$2,$3)",
      [f.product, f.variant, `${f.product}/image-${i}.jpg`],
    );
  for (let i = 0; i < facts; i++)
    await db.query(
      "insert into product_facts(product_id,label,value)values($1,$2,'Synthetic value')",
      [f.product, `Synthetic label ${i}`],
    );
  await db.query(
    "insert into product_images(product_id,storage_path)values($1,'other-product/photo.jpg')",
    [other.product],
  );
  if (models)
    await db.query(
      "insert into product_models(product_id,storage_path,poster_path)values($1,$2,$3)",
      [f.product, `/models/products/${f.product}.glb`, `/images/products/${f.product}.jpg`],
    );
  const scan = async (job) => {
    await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
    for (let i = 0; i < 200; i++) {
      const r = (
        await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
          job.id,
          job.user_id,
          job.lease_token,
        ])
      ).rows[0].result;
      if (r.pass_done) break;
      if (i === 199) throw Error("Synthetic inventory did not finish");
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  };
  const start = async ({ inventory = true } = {}) => {
    await db.exec(
      "select set_config('request.jwt.claims','{}',false);select set_config('parkvault.trusted_operation','off',false)",
    );
    await db.query("select mobile_request_deletion($1)", [f.seller]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [f.seller],
      )
    ).rows[0];
    if (inventory) await scan(job);
    for (const component of ["conversations", "inquiries", "applications", "listings"])
      for (let i = 0; i < 100; i++) {
        const r = (
          await db.query(`select purge_account_deletion_${component}($1,$2,$3,100)result`, [
            job.id,
            job.user_id,
            job.lease_token,
          ])
        ).rows[0].result;
        if (r.pass_done) break;
        if (i === 99) throw Error("Synthetic prerequisite did not finish");
      }
    return job;
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_catalog($1,$2,$3,$4)result", [
        job.id,
        job.user_id,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].result);
  let loseAck = false;
  const calls = [];
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
          calls.push(name);
          assert(
            ["purge_account_deletion_catalog", "verify_account_deletion_catalog"].includes(name),
          );
          await db.exec("set role service_role");
          let result;
          try {
            result = (
              await db.query(
                `select ${name}(${Object.values(args)
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
  return {
    ...f,
    other,
    db,
    start,
    scan,
    step,
    calls,
    component: createAccountDeletionCatalogErasure(client),
    loseAck: () => (loseAck = true),
  };
}
const tables = [
  "products",
  "product_variants",
  "product_images",
  "product_models",
  "product_facts",
  "product_sources",
  "product_resorts",
  "price_snapshots",
  "asks",
  "watchlist",
  "bids",
  "sightings",
  "orders",
];
async function snapshot(db) {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        (
          await db.query(`select to_jsonb(r)row from ${table} r order by to_jsonb(r)::text`)
        ).rows.map((r) => r.row),
      ]),
    ),
  );
}
function changes(a, b) {
  let n = 0;
  for (const t of tables) {
    const key = (r) => r.id ?? r.product_id + ":" + r.resort_id,
      x = new Map(a[t].map((r) => [key(r), JSON.stringify(r)])),
      y = new Map(b[t].map((r) => [key(r), JSON.stringify(r)]));
    for (const k of new Set([...x.keys(), ...y.keys()])) if (x.get(k) !== y.get(k)) n++;
  }
  return n;
}
async function finish(f, job) {
  const pages = [];
  for (let i = 0; i < 200; i++) {
    const p = await f.component.step(job, signal());
    pages.push(p);
    if (p.passDone) return pages;
  }
  throw Error("Synthetic catalog cleanup did not finish");
}
test("SDK cleanup removes exclusive authored title, description, variants and media references while retaining another catalog and durable discovery", async (t) => {
  const f = await setup(t, { images: 3, facts: 205 });
  await f.db.query(
    "insert into product_sources(product_id,label,url,source_kind)values($1,'Synthetic source','https://example.invalid','official_product_page')",
    [f.product],
  );
  const resort = randomUUID();
  await f.db.query("insert into resorts(id)values($1)", [resort]);
  await f.db.query("insert into product_resorts(product_id,resort_id)values($1,$2)", [
    f.product,
    resort,
  ]);
  await f.db.query("insert into price_snapshots(variant_id)values($1)", [f.variant]);
  const other = (await f.db.query("select * from products where id=$1", [f.other.product])).rows[0],
    job = await f.start();
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.seller]), /foreign key/);
  f.loseAck();
  await assert.rejects(
    f.component.step(job, signal()),
    (e) => e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause,
  );
  assert.equal(f.calls.length, 1);
  const pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "facts").map((p) => p.changed),
    [100, 100, 5],
  );
  for (const table of ["products", "product_variants", "product_images"])
    assert.equal(
      (
        await f.db.query(
          `select count(*)::int n from ${table} where ${table === "products" ? "id" : "product_id"}=$1`,
          [f.product],
        )
      ).rows[0].n,
      0,
    );
  assert.deepEqual(
    (await f.db.query("select * from products where id=$1", [f.other.product])).rows[0],
    other,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source='product_images'",
        [job.id],
      )
    ).rows[0].n,
    3,
  );
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    f.component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  await f.db.query("delete from auth.users where id=$1", [f.seller]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("one-row passes count real changes including product unpublishing without implicit cascades", async (t) => {
  const f = await setup(t, { images: 2, facts: 5 }),
    job = await f.start();
  let done = false;
  for (let i = 0; i < 50 && !done; i++) {
    const before = await snapshot(f.db),
      page = await f.step(job, 1);
    assert.equal(page.changed, changes(before, await snapshot(f.db)));
    assert(page.changed <= 1);
    done = page.pass_done;
  }
  assert(done);
});
test("exact current catalog image discovery is required before removing a reference", async (t) => {
  const f = await setup(t, { images: 1 }),
    job = await f.start({ inventory: false });
  assert.equal((await f.step(job)).source, "unpublished");
  await assert.rejects(f.step(job), /image inventory is incomplete/);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from product_images where product_id=$1", [
        f.product,
      ])
    ).rows[0].n,
    1,
  );
  await f.scan(job);
  await finish(f, job);
});
test("static model and poster namespaces stay unresolved rather than being guessed as member storage", async (t) => {
  const f = await setup(t, { models: true }),
    job = await f.start();
  await f.step(job);
  await assert.rejects(f.step(job), /model inventory requires resolution/);
  const observations = (
    await f.db.query(
      "select snapshot->'reference' ref from account_deletion_media_observations where job_id=$1 and source in('product_models','product_models_poster')",
      [job.id],
    )
  ).rows;
  assert.equal(observations.length, 2);
  assert(observations.every((r) => r.ref.state === "unresolved"));
  assert.equal(
    (
      await f.db.query("select count(*)::int n from product_models where product_id=$1", [
        f.product,
      ])
    ).rows[0].n,
    1,
  );
});
test("pending authors cannot add, retarget or rewrite catalog data or escape ownership; optional snapshots skip safely", async (t) => {
  const f = await setup(t, { images: 1 }),
    job = await f.start();
  for (const [sql, args] of [
    ["update products set created_by=null where id=$1", [f.product]],
    ["update products set description='Changed'where id=$1", [f.product]],
    [
      "insert into products(slug,name,created_by)values('synthetic-late','Synthetic',$1)",
      [f.seller],
    ],
    [
      "insert into product_images(product_id,storage_path)values($1,'catalog-product-namespace/photo.jpg')",
      [f.product],
    ],
    ["insert into product_variants(product_id)values($1)", [f.product]],
    ["insert into product_facts(product_id,label,value)values($1,'Synthetic','Late')", [f.product]],
    ["update product_images set product_id=$1 where product_id=$2", [f.other.product, f.product]],
    [
      "update product_images set approved_by=$1,approved_at=now()where product_id=$2",
      [f.seller, f.other.product],
    ],
  ])
    await assert.rejects(f.db.query(sql, args), /Private account records unavailable/);
  await f.db.query("insert into price_snapshots(variant_id)values($1)", [f.variant]);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from price_snapshots where variant_id=$1", [
        f.variant,
      ])
    ).rows[0].n,
    0,
  );
  await finish(f, job);
});
test("shared and financial catalog dependencies never cascade other members contributions away", async (t) => {
  for (const kind of [
    "shared_ask",
    "bid",
    "watchlist",
    "sighting",
    "order",
    "verified_sale",
    "request",
    "assignment",
    "match",
    "quote",
    "suggestion",
    "foreign_image",
    "foreign_model",
  ]) {
    const f = await setup(t, { images: 1 });
    const args = [f.product, f.variant];
    if (kind === "shared_ask") {
      await f.db.exec("select set_config('parkvault.trusted_operation','on',false)");
      await f.db.query(
        "insert into asks(id,product_id,variant_id,seller_id,price_cents)values(gen_random_uuid(),$1,$2,$3,100)",
        [...args, f.other.seller],
      );
      await f.db.exec("select set_config('parkvault.trusted_operation','off',false)");
    }
    if (kind === "bid")
      await f.db.query(
        "insert into bids(id,buyer_id,product_id,variant_id)values(gen_random_uuid(),$1,$2,$3)",
        [f.other.buyer, ...args],
      );
    if (kind === "watchlist")
      await f.db.query(
        "insert into watchlist(id,user_id,variant_id)values(gen_random_uuid(),$1,$2)",
        [f.other.buyer, f.variant],
      );
    if (kind === "sighting")
      await f.db.query(
        "insert into sightings(id,reporter_id,variant_id)values(gen_random_uuid(),$1,$2)",
        [f.other.buyer, f.variant],
      );
    if (kind === "order")
      await f.db.query(
        "insert into orders(id,buyer_id,product_id,variant_id)values(gen_random_uuid(),$1,$2,$3)",
        [f.other.buyer, ...args],
      );
    if (kind === "verified_sale")
      await f.db.query("insert into verified_sales(product_id,variant_id)values($1,$2)", args);
    if (kind === "request")
      await f.db.query(
        "insert into sourcing_requests(id,buyer_id,product_id,variant_id)values(gen_random_uuid(),$1,$2,$3)",
        [f.other.buyer, ...args],
      );
    if (kind === "assignment")
      await f.db.query(
        "insert into sourcing_assignments(id,variant_id)values(gen_random_uuid(),$1)",
        [f.variant],
      );
    if (kind === "match")
      await f.db.query("insert into market_matches(id,variant_id)values(gen_random_uuid(),$1)", [
        f.variant,
      ]);
    if (kind === "quote")
      await f.db.query(
        "insert into checkout_shipping_quotes(buyer_id,variant_id,address,rates)values($1,$2,'{}','[]')",
        [f.other.buyer, f.variant],
      );
    if (kind === "suggestion")
      await f.db.query(
        "insert into product_suggestions(id,submitted_by,created_product_id)values(gen_random_uuid(),$1,$2)",
        [f.other.buyer, f.product],
      );
    if (kind === "foreign_image")
      await f.db.query(
        "insert into product_images(product_id,variant_id,storage_path)values($1,$2,'foreign-catalog/photo.jpg')",
        [f.other.product, f.variant],
      );
    if (kind === "foreign_model")
      await f.db.query(
        "insert into product_models(product_id,source_image_id,storage_path)select $1,id,'/models/products/synthetic-shared.glb'from product_images where product_id=$2 limit 1",
        [f.other.product, f.product],
      );
    const before = await snapshot(f.db),
      job = await f.start();
    await assert.rejects(f.step(job), /catalog retention requires explicit handling/);
    assert.deepEqual(await snapshot(f.db), before, kind);
  }
});
test("runtime schema, policy, function and lease changes stop cleanup and client roles cannot invoke erasure", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.step(job), /permission denied/);
    await assert.rejects(
      f.db.query("select * from account_deletion_catalog_contract"),
      /permission denied/,
    );
    await f.db.exec("reset role");
  }
  await f.db.exec(
    "create table unreviewed_catalog_child(id uuid references products(id)on delete cascade)",
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("drop table unreviewed_catalog_child");
  await f.db.exec("create policy unreviewed_catalog_policy on products for select using(true)");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("drop policy unreviewed_catalog_policy on products");
  await f.db.exec("alter table products disable trigger trg_products_touch");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("alter table products enable trigger trg_products_touch");
  const reference = (
    await f.db.query(
      "select pg_get_functiondef('public.account_deletion_media_reference(text,text)'::regprocedure) definition",
    )
  ).rows[0].definition;
  await f.db.exec(
    "create or replace function public.account_deletion_media_reference(_bucket text,_value text)returns jsonb language plpgsql immutable set search_path='' as $$begin return '{\"state\":\"unresolved\"}'::jsonb;end$$",
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec(reference);
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
});
test("catalog approval on another author retains moderation evidence and restricts an unsafe Auth shortcut", async (t) => {
  const f = await setup(t);
  await f.db.query(
    "update product_images set approved_by=$1,approved_at=now(),approval_source='admin_console'where product_id=$2",
    [f.seller, f.other.product],
  );
  await f.db.query("delete from products where id=$1", [f.product]);
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.seller]), /foreign key/);
  const job = await f.start();
  await assert.rejects(f.step(job), /moderation retention requires explicit handling/);
  assert.equal(
    (
      await f.db.query("select approved_by from product_images where product_id=$1", [
        f.other.product,
      ])
    ).rows[0].approved_by,
    f.seller,
  );
});
test("migration refuses a new catalog child before changing any ownership boundary", async (t) => {
  const db = await catalogDatabase({ install: false });
  t.after(() => db.close());
  await db.exec(
    "create table unreviewed_catalog_child(id uuid references products(id)on delete cascade)",
  );
  await assert.rejects(db.exec(catalogMigration()), /catalog relationships/);
  await db.exec("rollback");
});
