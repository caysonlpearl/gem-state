import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  variationDatabase,
  variationActors,
  variationMigration,
} from "./helpers/catalog-admin-variation-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
async function setup(t, { install = true } = {}) {
  const db = await variationDatabase({ install });
  t.after(() => db.close());
  return { db, ...(await variationActors(db)) };
}
export const create = async (db, f, labels = ["Small", "Large"], suggestion = null) => {
  const slug = "synthetic-" + randomUUID();
  const product = (
    await db.query(
      "select admin_create_product(_name=>'Synthetic catalog product',_slug=>$1,_category_id=>$2,_resort_codes=>ARRAY['TEST'],_variations=>$3::text[],_suggestion_id=>$4)id",
      [slug, f.admin.category, labels, suggestion],
    )
  ).rows[0].id;
  return { product, slug };
};
async function held(db, f, { seller = f.author.seller } = {}) {
  const suggestion = (
    await db.query(
      "insert into product_suggestions(submitted_by,name,category_id,resort_codes,status)values($1,'Synthetic member request',$2,ARRAY['TEST'],'submitted')returning id",
      [f.author.seller, f.author.category],
    )
  ).rows[0].id;
  const request = (
    await db.query(
      "insert into seller_listing_requests(suggestion_id,seller_id,price_cents,item_condition,evidence_paths,public_media_paths)values($1,$2,10000,'new_with_tags',ARRAY[$3],ARRAY[$4])returning id",
      [suggestion, seller, `${seller}/synthetic-evidence.jpg`, `${seller}/synthetic-listing.jpg`],
    )
  ).rows[0].id;
  return { suggestion, request };
}
test("captured creation and editing both fail on generated keys before repair and roll back their writes", async (t) => {
  const f = await setup(t, { install: false });
  const before = (await f.db.query("select count(*)::int n from products")).rows[0].n;
  await assert.rejects(create(f.db, f), (e) => e.code === "428C9");
  await assert.rejects(
    f.db.query("select admin_save_variant($1,'Synthetic new option')", [f.admin.product]),
    (e) => e.code === "428C9",
  );
  assert.equal((await f.db.query("select count(*)::int n from products")).rows[0].n, before);
  assert.equal((await f.db.query("select count(*)::int n from admin_audit_log")).rows[0].n, 0);
});
test("repair preserves variant ids, attributes and child links while deriving truthful named keys", async (t) => {
  const f = await setup(t, { install: false });
  await f.db.query("update product_variants set sku_label=' Blue|50% 'where id=$1", [
    f.admin.variant,
  ]);
  await f.db.query(
    "update product_variants set sku_label='Display name',size=' Small ',color=' Red ',edition=' First 'where id=$1",
    [f.author.variant],
  );
  const image = (
    await f.db.query(
      "insert into product_images(product_id,variant_id,storage_path)values($1,$2,'catalog-namespace/synthetic.jpg')returning id",
      [f.admin.product, f.admin.variant],
    )
  ).rows[0].id;
  const before = (await f.db.query("select * from product_variants order by id")).rows;
  await f.db.exec("select set_config('request.jwt.claims','{}',false)");
  await f.db.exec(variationMigration());
  const after = (await f.db.query("select * from product_variants order by id")).rows;
  assert.deepEqual(
    after,
    before.map((r) => ({
      ...r,
      variation_key: r.id === f.admin.variant ? "label:blue%7C50%25" : r.variation_key,
    })),
  );
  assert.equal(
    (await f.db.query("select variant_id from product_images where id=$1", [image])).rows[0]
      .variant_id,
    f.admin.variant,
  );
  assert.equal(
    (await f.db.query("select account_deletion_catalog_barrier_current()ready")).rows[0].ready,
    true,
  );
  assert.deepEqual(
    (await f.db.query("select account_access_coverage()coverage")).rows[0].coverage,
    { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
  );
});
test("actual admin creation keeps named option order and supports the default without inventing size, color or edition", async (t) => {
  const f = await setup(t);
  const { product } = await create(f.db, f, [" Large ", "Small"]);
  assert.deepEqual(
    (
      await f.db.query(
        "select sku_label,variation_key,size,color,edition,position from product_variants where product_id=$1 order by position",
        [product],
      )
    ).rows,
    [
      {
        sku_label: "Large",
        variation_key: "label:large",
        size: null,
        color: null,
        edition: null,
        position: 0,
      },
      {
        sku_label: "Small",
        variation_key: "label:small",
        size: null,
        color: null,
        edition: null,
        position: 1,
      },
    ],
  );
  const fallback = await create(f.db, f, null);
  assert.deepEqual(
    (
      await f.db.query("select sku_label,variation_key from product_variants where product_id=$1", [
        fallback.product,
      ])
    ).rows,
    [{ sku_label: "Standard", variation_key: "label:standard" }],
  );
});
test("actual variation editor creates and updates generated attributes with stable ids and audit records", async (t) => {
  const f = await setup(t);
  const id = (
    await f.db.query("select admin_save_variant($1,'Other named option')id", [f.admin.product])
  ).rows[0].id;
  assert.equal(
    (await f.db.query("select variation_key from product_variants where id=$1", [id])).rows[0]
      .variation_key,
    "label:other named option",
  );
  assert.equal(
    (
      await f.db.query(
        "select admin_save_variant($1,'Updated option',$2,' Small ',' Blue ',' First ',7,false)id",
        [f.admin.product, id],
      )
    ).rows[0].id,
    id,
  );
  assert.deepEqual(
    (
      await f.db.query(
        "select size,color,edition,position,active,variation_key from product_variants where id=$1",
        [id],
      )
    ).rows[0],
    {
      size: "Small",
      color: "Blue",
      edition: "First",
      position: 7,
      active: false,
      variation_key: "small|blue|first",
    },
  );
  assert.deepEqual(
    (await f.db.query("select action from admin_audit_log order by action")).rows.map(
      (r) => r.action,
    ),
    ["variant_created", "variant_updated"],
  );
  await assert.rejects(
    f.db.query("select admin_save_variant($1,'Different label',null,'Small','Blue','First')", [
      f.admin.product,
    ]),
    (e) => e.code === "23505",
  );
});
test("pipe and percent labels remain distinct from structured keys and bad option lists roll back", async (t) => {
  const f = await setup(t);
  const labels = ["Blue|~|~", "Blue%7C~%7C~", "Édition", "O'Clock"];
  const { product } = await create(f.db, f, labels);
  const keys = (
    await f.db.query("select variation_key from product_variants where product_id=$1", [product])
  ).rows.map((r) => r.variation_key);
  assert.equal(new Set(keys).size, 4);
  assert(keys.every((k) => !k.includes("|")));
  await f.db.query("select admin_save_variant($1,'Structured special',null,'label:blue','~','~')", [
    product,
  ]);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from product_variants where product_id=$1", [
        product,
      ])
    ).rows[0].n,
    5,
  );
  const count = (await f.db.query("select count(*)::int n from products")).rows[0].n;
  for (const [list, error] of [
    [[" Blue ", "blue"], /must be unique/],
    [Array.from({ length: 41 }, (_, i) => "Option " + i), /up to 40/],
    [["x".repeat(121)], /120 characters/],
  ])
    await assert.rejects(create(f.db, f, list), error);
  assert.equal((await f.db.query("select count(*)::int n from products")).rows[0].n, count);
});
test("real approval conversion preserves the submitting seller, photos, audit event and notification", async (t) => {
  const f = await setup(t),
    submission = await held(f.db, f);
  const { product } = await create(f.db, f, ["Standard"], submission.suggestion);
  const request = (
    await f.db.query("select status,converted_ask_id from seller_listing_requests where id=$1", [
      submission.request,
    ])
  ).rows[0];
  assert.equal(request.status, "converted");
  assert(request.converted_ask_id);
  assert.deepEqual(
    (
      await f.db.query("select seller_id,product_id,approved_at from asks where id=$1", [
        request.converted_ask_id,
      ])
    ).rows[0],
    { seller_id: f.author.seller, product_id: product, approved_at: null },
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from listing_media where ask_id=$1", [
        request.converted_ask_id,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from ask_media where ask_id=$1", [
        request.converted_ask_id,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query("select actor_id from ask_events where ask_id=$1", [
        request.converted_ask_id,
      ])
    ).rows[0].actor_id,
    f.admin.seller,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from notifications where user_id=$1 and kind='missing_product_approved'",
        [f.author.seller],
      )
    ).rows[0].n,
    1,
  );
  const count = (await f.db.query("select count(*)::int n from products")).rows[0].n;
  await assert.rejects(
    create(f.db, f, ["Another label"], submission.suggestion),
    /already has an approved catalog page/,
  );
  assert.equal((await f.db.query("select count(*)::int n from products")).rows[0].n, count);
});
for (const target of ["author", "seller", "admin"])
  test(`approval refuses a pending ${target} without leaving derivative records`, async (t) => {
    const f = await setup(t),
      submission = await held(f.db, f, {
        seller: target === "seller" ? f.author.buyer : f.author.seller,
      });
    const user =
      target === "admin" ? f.admin.seller : target === "seller" ? f.author.buyer : f.author.seller;
    await f.db.exec("select set_config('request.jwt.claims','{}',false)");
    await f.db.query("select mobile_request_deletion($1)", [user]);
    await fixtureMemberSession(f.db, f.admin.seller);
    const before = (await f.db.query("select count(*)::int n from products")).rows[0].n;
    await assert.rejects(
      create(f.db, f, ["Standard"], submission.suggestion),
      target === "admin" ? /Account access is unavailable/ : /Private account records unavailable/,
    );
    assert.equal((await f.db.query("select count(*)::int n from products")).rows[0].n, before);
    assert.equal((await f.db.query("select count(*)::int n from asks")).rows[0].n, 0);
    assert.equal((await f.db.query("select count(*)::int n from admin_audit_log")).rows[0].n, 0);
    assert.equal(
      (
        await f.db.query("select status from product_suggestions where id=$1", [
          submission.suggestion,
        ])
      ).rows[0].status,
      "submitted",
    );
  });
test("ordinary members remain unauthorized and oversized legacy key migrations fail without rewriting data", async (t) => {
  const f = await setup(t, { install: false });
  await f.db.query("update product_variants set sku_label=$1 where id=$2", [
    "x".repeat(2100),
    f.admin.variant,
  ]);
  await f.db.exec("select set_config('request.jwt.claims','{}',false)");
  await assert.rejects(f.db.exec(variationMigration()), /oversized named variation/);
  await f.db.exec("rollback");
  assert.equal(
    (await f.db.query("select variation_key from product_variants where id=$1", [f.admin.variant]))
      .rows[0].variation_key,
    "~|~|~",
  );
  await f.db.query("update product_variants set sku_label=null where id=$1", [f.admin.variant]);
  await f.db.exec(variationMigration());
  await fixtureMemberSession(f.db, f.author.seller);
  await assert.rejects(create(f.db, f), /Administrator access required/);
});
test("catalog erasure remains operational after the reviewed key rewrite and keeps another author intact", async (t) => {
  const f = await setup(t);
  await create(f.db, f, ["Small", "Large"]);
  await f.db.exec("select set_config('request.jwt.claims','{}',false)");
  await f.db.query("select mobile_request_deletion($1)", [f.admin.seller]);
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (
    await f.db.query(
      "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
      [f.admin.seller],
    )
  ).rows[0];
  let done = false;
  for (let i = 0; i < 30 && !done; i++) {
    const page = (
      await f.db.query("select purge_account_deletion_catalog($1,$2,$3,100)result", [
        job.id,
        f.admin.seller,
        job.lease_token,
      ])
    ).rows[0].result;
    assert(page.changed <= 100);
    done = page.pass_done;
  }
  assert(done);
  assert.equal(
    (await f.db.query("select count(*)::int n from products where created_by=$1", [f.admin.seller]))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from products where id=$1", [f.author.product]))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await f.db.query("select status from account_deletion_jobs where id=$1", [job.id])).rows[0]
      .status,
    "processing",
    "This component cannot complete the full deletion job",
  );
});
