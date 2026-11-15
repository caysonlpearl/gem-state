import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  submissionRecordsDatabase,
  submissionRecordsMigration,
} from "./helpers/account-deletion-submission-records-database.mjs";
import { variationActors } from "./helpers/catalog-admin-variation-database.mjs";
import { createAccountDeletionSubmissionErasure } from "../src/lib/account-deletion-submissions.server.ts";
const signal = () => AbortSignal.timeout(15000);
async function setup(t, { requests = 0, media = 0, otherSeller = false, bareMedia = false } = {}) {
  const db = await submissionRecordsDatabase();
  t.after(() => db.close());
  const f = await variationActors(db);
  const author = f.author.seller,
    other = f.admin.seller;
  const suggestion = async (owner = author) =>
    (
      await db.query(
        "insert into product_suggestions(submitted_by,name,category_id,resort_codes,status)values($1,'Synthetic original request',$2,ARRAY['TEST'],'submitted')returning id",
        [owner, f.author.category],
      )
    ).rows[0].id;
  const held = async (parent, owner = author) =>
    (
      await db.query(
        "insert into seller_listing_requests(suggestion_id,seller_id,price_cents,item_condition,seller_note,evidence_paths,public_media_paths)values($1,$2,10000,'new_with_tags','Preserve original seller note',ARRAY[$3],ARRAY[$4])returning id",
        [parent, owner, `${owner}/synthetic-evidence.jpg`, `${owner}/synthetic-public.jpg`],
      )
    ).rows[0].id;
  const proposal = await suggestion();
  for (let i = 0; i < requests; i++) await held(i === 0 ? proposal : await suggestion());
  if (otherSeller) await held(proposal, other);
  for (let i = 0; i < media; i++)
    await db.query(
      "insert into product_suggestion_media(suggestion_id,storage_path,caption)values($1,$2,$3)",
      [
        proposal,
        bareMedia
          ? `${author}/image-${i}.jpg`
          : `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/public/catalog-media/${author}/image-${i}.jpg`,
        "Synthetic original caption",
      ],
    );
  const scan = async (job) => {
    await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
    for (let i = 0; i < 200; i++) {
      const r = (
        await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
          job.id,
          author,
          job.lease_token,
        ])
      ).rows[0].result;
      if (r.pass_done) break;
      if (i === 199) throw Error("Synthetic inventory did not finish");
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  };
  const start = async ({ inventory = true } = {}) => {
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await db.query("select mobile_request_deletion($1)", [author]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [author],
      )
    ).rows[0];
    if (inventory) await scan(job);
    return job;
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_submissions($1,$2,$3,$4)result", [
        job.id,
        author,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].result);
  let lost = false;
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
          calls.push(name);
          assert(
            ["purge_account_deletion_submissions", "verify_account_deletion_submissions"].includes(
              name,
            ),
          );
          await db.exec("set role service_role");
          let value;
          try {
            value = (
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
          if (lost) {
            lost = false;
            throw Error("Synthetic private provider diagnostic");
          }
          return new Response(JSON.stringify(value), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  return {
    ...f,
    db,
    author,
    other,
    proposal,
    suggestion,
    held,
    start,
    scan,
    step,
    calls,
    component: createAccountDeletionSubmissionErasure(client),
    loseAck: () => (lost = true),
  };
}
async function finish(f, job) {
  const pages = [];
  for (let i = 0; i < 250; i++) {
    const page = await f.component.step(job, signal());
    pages.push(page);
    assert(page.changed <= 100);
    if (page.passDone) return pages;
  }
  throw Error("Synthetic submission cleanup did not finish");
}
const tables = [
  "product_suggestions",
  "product_suggestion_media",
  "seller_listing_requests",
  "products",
  "product_variants",
  "asks",
  "listing_media",
  "ask_media",
  "ask_events",
  "notifications",
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
const changed = (a, b) =>
  tables.reduce((n, t) => {
    const x = new Map(a[t].map((r) => [r.id, JSON.stringify(r)])),
      y = new Map(b[t].map((r) => [r.id, JSON.stringify(r)]));
    return n + [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k)).length;
  }, 0);
test("SDK erases owned requests and suggestions after durable discovery, without automatic lost-ack retries", async (t) => {
  const f = await setup(t, { requests: 14, media: 205 }),
    other = await f.suggestion(f.other),
    job = await f.start();
  f.loseAck();
  await assert.rejects(
    f.component.step(job, signal()),
    (e) => e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause,
  );
  assert.equal(f.calls.length, 1);
  const pages = await finish(f, job);
  assert(pages.filter((p) => p.source === "requests").every((p) => p.changed <= 6));
  assert.deepEqual(
    pages.filter((p) => p.source === "media").map((p) => p.changed),
    [100, 100, 5],
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from product_suggestions where submitted_by=$1", [
        f.author,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from product_suggestions where id=$1", [other]))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source='product_suggestion_media'",
        [job.id],
      )
    ).rows[0].n,
    205,
  );
  // Compose the remaining independent catalog/profile components before Auth.
  for (const name of ["listings", "catalog"])
    for (let i = 0; i < 50; i++) {
      const r = (
        await f.db.query(`select purge_account_deletion_${name}($1,$2,$3,100)result`, [
          job.id,
          f.author,
          job.lease_token,
        ])
      ).rows[0].result;
      if (r.pass_done) break;
      if (i === 49) throw Error("Synthetic subsequent component did not finish");
    }
  for (let i = 0; i < 50; i++) {
    const r = (
      await f.db.query("select purge_account_deletion_profiles($1,$2,$3,'records',100)result", [
        job.id,
        f.author,
        job.lease_token,
      ])
    ).rows[0].result;
    if (r.pass_done) break;
    if (i === 49) throw Error("Synthetic profile component did not finish");
  }
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    f.component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  await f.db.query("delete from auth.users where id=$1", [f.author]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("another seller keeps exact private payloads when the original submission is retired", async (t) => {
  const f = await setup(t, { otherSeller: true }),
    before = (
      await f.db.query("select * from seller_listing_requests where suggestion_id=$1", [f.proposal])
    ).rows[0],
    job = await f.start();
  const page = await f.step(job);
  assert.equal(page.source, "retired");
  assert.equal(page.changed, 1);
  const row = (await f.db.query("select * from seller_listing_requests where id=$1", [before.id]))
    .rows[0];
  assert(row.unavailable_at);
  assert.deepEqual({ ...row, unavailable_at: null }, { ...before, suggestion_id: null });
  await finish(f, job);
  await assert.rejects(
    f.db.query("update seller_listing_requests set status='converted'where id=$1", [before.id]),
    /read-only/,
  );
  assert.equal(
    (await f.db.query("select seller_note from seller_listing_requests where id=$1", [before.id]))
      .rows[0].seller_note,
    before.seller_note,
  );
});
test("deleting a held seller's form preserves a different member's original suggestion", async (t) => {
  const f = await setup(t),
    otherProposal = await f.suggestion(f.other);
  await f.held(otherProposal, f.author);
  const before = (
    await f.db.query("select * from product_suggestions where id=$1", [otherProposal])
  ).rows[0];
  const job = await f.start();
  await finish(f, job);
  assert.deepEqual(
    (await f.db.query("select * from product_suggestions where id=$1", [otherProposal])).rows[0],
    before,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from seller_listing_requests where seller_id=$1", [
        f.author,
      ])
    ).rows[0].n,
    0,
  );
});
test("minimum passes count physical rows and incomplete current media discovery blocks reference removal", async (t) => {
  const f = await setup(t, { requests: 2, media: 2 }),
    job = await f.start({ inventory: false });
  await assert.rejects(f.step(job, 1), /Held request media inventory is incomplete/);
  await f.scan(job);
  let done = false;
  for (let i = 0; i < 20 && !done; i++) {
    const before = await snapshot(f.db),
      page = await f.step(job, 1);
    assert.equal(page.changed, changed(before, await snapshot(f.db)));
    assert(page.changed <= 1);
    done = page.pass_done;
  }
  assert(done);
});
test("a bare suggestion path never acquires an invented storage bucket", async (t) => {
  const f = await setup(t, { media: 1, bareMedia: true }),
    job = await f.start();
  await assert.rejects(f.step(job), /requires resolution/);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from product_suggestion_media where suggestion_id=$1",
        [f.proposal],
      )
    ).rows[0].n,
    1,
  );
});
test("converted owned forms are removed before listing cleanup while staff-authored catalog contributions remain", async (t) => {
  const f = await setup(t, { requests: 1 });
  const product = (
    await f.db.query(
      "select admin_create_product(_name=>'Staff authored catalog',_slug=>$1,_category_id=>$2,_resort_codes=>ARRAY['TEST'],_variations=>ARRAY['Standard'],_suggestion_id=>$3)id",
      ["staff-" + randomUUID(), f.admin.category, f.proposal],
    )
  ).rows[0].id;
  const request = (
    await f.db.query("select * from seller_listing_requests where suggestion_id=$1", [f.proposal])
  ).rows[0];
  assert.equal(request.status, "converted");
  const job = await f.start();
  await finish(f, job);
  for (let i = 0; i < 50; i++) {
    const r = (
      await f.db.query("select purge_account_deletion_listings($1,$2,$3,100)result", [
        job.id,
        f.author,
        job.lease_token,
      ])
    ).rows[0].result;
    if (r.pass_done) break;
    if (i === 49) throw Error("Listing cleanup did not finish");
  }
  assert.equal(
    (await f.db.query("select count(*)::int n from asks where id=$1", [request.converted_ask_id]))
      .rows[0].n,
    0,
  );
  assert.deepEqual(
    (await f.db.query("select created_by,name from products where id=$1", [product])).rows[0],
    { created_by: f.other, name: "Staff authored catalog" },
  );
});
test("pending-author, pending-seller and retired-record writes cannot recreate private submissions", async (t) => {
  const f = await setup(t, { requests: 1 }),
    job = await f.start();
  for (const [sql, args] of [
    ["insert into product_suggestions(submitted_by,name)values($1,'Late')", [f.author]],
    ["update product_suggestions set name='Late'where id=$1", [f.proposal]],
    ["update product_suggestions set submitted_by=$1 where id=$2", [f.other, f.proposal]],
    [
      "insert into product_suggestion_media(suggestion_id,storage_path)values($1,$2)",
      [
        f.proposal,
        `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/public/catalog-media/${f.author}/late.jpg`,
      ],
    ],
    ["update seller_listing_requests set seller_note='Late'where seller_id=$1", [f.author]],
  ])
    await assert.rejects(f.db.query(sql, args), /unavailable|immutable/i);
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.author]), /foreign key/);
  await finish(f, job);
});
test("moderation links defer instead of discarding evidence", async (t) => {
  const f = await setup(t),
    other = await f.suggestion(f.other);
  await f.db.query("update product_suggestions set reviewer_id=$1 where id=$2", [f.author, other]);
  const job = await f.start();
  await assert.rejects(f.step(job), /moderation retention/);
});
test("linked financial records preserve the original submission and converted request", async (t) => {
  for (const kind of ["product_order", "variant_order", "bid", "quote", "converted_order"]) {
    await t.test(kind, async (t) => {
      const f = await setup(t, { requests: kind === "converted_order" ? 1 : 0 });
      let product = f.admin.product,
        variant = f.admin.variant,
        ask = null;
      if (kind === "converted_order") {
        product = (
          await f.db.query(
            "select admin_create_product(_name=>'Synthetic retained approval',_slug=>$1,_category_id=>$2,_resort_codes=>ARRAY['TEST'],_variations=>ARRAY['Standard'],_suggestion_id=>$3)id",
            ["retained-" + randomUUID(), f.admin.category, f.proposal],
          )
        ).rows[0].id;
        const request = (
          await f.db.query(
            "select converted_ask_id from seller_listing_requests where suggestion_id=$1",
            [f.proposal],
          )
        ).rows[0];
        ask = request.converted_ask_id;
        variant = (
          await f.db.query("select id from product_variants where product_id=$1", [product])
        ).rows[0].id;
      } else {
        await f.db.query("update product_suggestions set merged_product_id=$1 where id=$2", [
          product,
          f.proposal,
        ]);
      }
      if (kind.endsWith("order"))
        await f.db.query(
          "insert into orders(id,buyer_id,product_id,variant_id,ask_id)values(gen_random_uuid(),$1,$2,$3,$4)",
          [
            f.admin.buyer,
            kind === "variant_order" ? null : product,
            kind === "product_order" ? null : variant,
            ask,
          ],
        );
      if (kind === "bid")
        await f.db.query(
          "insert into bids(id,buyer_id,variant_id)values(gen_random_uuid(),$1,$2)",
          [f.admin.buyer, variant],
        );
      if (kind === "quote")
        await f.db.query(
          "insert into checkout_shipping_quotes(buyer_id,variant_id,address,rates)values($1,$2,'{}','[]')",
          [f.admin.buyer, variant],
        );
      const before = await snapshot(f.db),
        job = await f.start();
      await assert.rejects(f.step(job), /retention requires explicit handling/);
      assert.deepEqual(await snapshot(f.db), before);
      assert.equal(
        (await f.db.query("select count(*)::int n from orders")).rows[0].n,
        kind.endsWith("order") ? 1 : 0,
      );
    });
  }
});
test("a previous inventory generation cannot authorize removal of current suggestion media", async (t) => {
  const f = await setup(t, { media: 1 }),
    job = await f.start();
  await f.db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
  assert.equal(
    (
      await f.db.query("select restart_account_deletion_media_inventory($1,$2,$3)ready", [
        job.id,
        f.author,
        job.lease_token,
      ])
    ).rows[0].ready,
    true,
  );
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  await assert.rejects(f.step(job), /requires resolution/);
  assert.equal(
    (await f.db.query("select count(*)::int n from product_suggestion_media")).rows[0].n,
    1,
  );
  await f.scan(job);
  await finish(f, job);
});
test("schema drift, stale leases and client execution fail closed", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.step(job), /permission denied/);
    await assert.rejects(
      f.db.query("select * from account_deletion_submission_contract"),
      /permission denied/,
    );
    await f.db.exec("reset role");
  }
  await f.db.exec(
    "create table unexpected_submission_child(id uuid references product_suggestions(id)on delete cascade)",
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("drop table unexpected_submission_child");
  await f.db.exec(
    "create policy unexpected_submission_policy on product_suggestions for select using(true)",
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("drop policy unexpected_submission_policy on product_suggestions");
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
});
test("ordinary parent removal retires a surviving held request rather than cascading its photos and note", async (t) => {
  const f = await setup(t, { otherSeller: true }),
    before = (
      await f.db.query("select * from seller_listing_requests where suggestion_id=$1", [f.proposal])
    ).rows[0];
  await f.db.query("delete from product_suggestions where id=$1", [f.proposal]);
  const after = (await f.db.query("select * from seller_listing_requests where id=$1", [before.id]))
    .rows[0];
  assert(after.unavailable_at);
  assert.deepEqual({ ...after, unavailable_at: null }, { ...before, suggestion_id: null });
});
test("installation refuses an unknown child instead of accepting an unbounded cascade", async (t) => {
  const db = await submissionRecordsDatabase({ install: false });
  t.after(() => db.close());
  await db.exec(
    "create table unexpected_submission_child(id uuid references product_suggestions(id)on delete cascade)",
  );
  await assert.rejects(db.exec(submissionRecordsMigration()), /relationships/);
  await db.exec("rollback");
});
