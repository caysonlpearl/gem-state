import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./helpers/account-deletion-database.mjs";
const capture = JSON.parse(
  readFileSync(new URL("./fixtures/classified-detail-helpers-20261114.json", import.meta.url)),
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261114180000_classified_detail_helper_permissions.sql",
    import.meta.url,
  ),
  "utf8",
);
async function fixture(t, { publicGrant = false } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await installDeletionWorkerSchema(db);
  await db.exec(
    "create table categories(id uuid primary key,slug text);create table products(id uuid primary key,category_id uuid);create table asks(id uuid primary key,seller_id uuid,product_id uuid)",
  );
  await db.exec(
    `create table classified_listing_details(${capture.detailsColumns.map((c) => '"' + c.name + '" ' + c.sql_type + (c.default ? " default " + c.default : "") + (c.nullable ? "" : " not null")).join(",")})`,
  );
  for (const c of capture.detailsConstraints)
    await db.exec("alter table classified_listing_details add " + c);
  for (const row of capture.functions) {
    const f = row.definition;
    await db.exec(f.definition);
    await db.exec(
      `revoke all on function public.${row.name} from public,anon,authenticated,service_role;grant execute on function public.${row.name} to ${publicGrant ? "public" : "anon,authenticated,service_role"}`,
    );
    await db.query(
      "insert into account_access_protected_functions(function_oid,signature,original_definition,protected_body_md5)values($1::regprocedure,$1,$2,$3)",
      ["public." + row.name, f.original_definition, f.registered_body_md5],
    );
  }
  await db.exec(`create function public.fixture_owned_edit(_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
  if not exists(select 1 from public.asks where id=_id and seller_id=auth.uid())then raise exception 'Listing not owned';end if;
  perform public._apply_classified_category_details(_id,'{"bedrooms":3}'::jsonb,null,null);
  perform public._apply_classified_pet_details(_id,'{"subcategory":"Dogs","species":"Dog","placementType":"free","offeredBy":"Owner"}'::jsonb);
 end$$;revoke all on function public.fixture_owned_edit(uuid) from public;grant execute on function public.fixture_owned_edit(uuid) to authenticated;
 select public.protect_account_access_boundaries()`);
  const a = randomUUID(),
    b = randomUUID(),
    session = randomUUID(),
    category = randomUUID(),
    product = randomUUID(),
    listing = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [a, b]);
  await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, a]);
  await db.query("insert into categories values($1,'pets')", [category]);
  await db.query("insert into products values($1,$2)", [product, category]);
  await db.query("insert into asks values($1,$2,$3)", [listing, a, product]);
  await db.query(
    "insert into classified_listing_details(listing_id,city,region,fulfillment_mode)values($1,'Boise','Treasure Valley','local_pickup')",
    [listing],
  );
  const owner = () => db.exec("reset role");
  async function role(name, user = a) {
    await owner();
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        role: name,
        ...(name === "authenticated" ? { sub: user, session_id: session } : {}),
      }),
    ]);
    await db.exec("set role " + name);
  }
  const grants = async () =>
    (
      await db.query(
        `select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') member,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p where p.oid=any(array['public._apply_classified_category_details(uuid,jsonb,jsonb,jsonb)'::regprocedure,'public._apply_classified_pet_details(uuid,jsonb)'::regprocedure]) order by p.proname`,
      )
    ).rows;
  return { db, a, b, listing, owner, role, grants };
}

for (const publicGrant of [false, true])
  test(`internal helpers reject anonymous/member direct calls after tightening ${publicGrant ? "PUBLIC" : "explicit role"} grants`, async (t) => {
    const f = await fixture(t, { publicGrant });
    // Reproduce only on synthetic records: the original effective grant lets a
    // guest alter details without going through the owner-checked listing RPC.
    await f.role("anon");
    await f.db.query(
      "select public._apply_classified_category_details($1,'{\"bedrooms\":12}',null,null)",
      [f.listing],
    );
    await f.owner();
    assert.equal(
      (
        await f.db.query(
          "select home_bedrooms from classified_listing_details where listing_id=$1",
          [f.listing],
        )
      ).rows[0].home_bedrooms,
      "12.0",
    );
    const before = (
      await f.db.query(
        "select oid,(to_jsonb(p)-'proacl') metadata from pg_proc p where proname like '_apply_classified_%' order by oid",
      )
    ).rows;
    await f.db.exec(migration);
    await f.db.exec(migration);
    for (const r of await f.grants())
      assert.deepEqual(
        { anon: r.anon, member: r.member, service: r.service },
        { anon: false, member: false, service: true },
      );
    const after = (
      await f.db.query(
        "select oid,(to_jsonb(p)-'proacl') metadata from pg_proc p where proname like '_apply_classified_%' order by oid",
      )
    ).rows;
    assert.deepEqual(
      after,
      before,
      "Only ACLs change, preserving source, owner and all function attributes",
    );
    for (const role of ["anon", "authenticated"]) {
      await f.role(role);
      await assert.rejects(
        f.db.query("select public._apply_classified_category_details($1,'{}',null,null)", [
          f.listing,
        ]),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        f.db.query("select public._apply_classified_pet_details($1,'{}')", [f.listing]),
        (e) => e.code === "42501",
      );
    }
    await f.db.query("select public.fixture_owned_edit($1)", [f.listing]);
    await f.owner();
    const row = (
      await f.db.query(
        "select home_bedrooms,pet_species from classified_listing_details where listing_id=$1",
        [f.listing],
      )
    ).rows[0];
    assert.deepEqual(row, { home_bedrooms: "3.0", pet_species: "Dog" });
    assert.deepEqual(
      (await f.db.query("select public.account_access_coverage() result")).rows[0].result,
      { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
    );
  });

test("unreviewed invoker callers roll back the entire permission change", async (t) => {
  const f = await fixture(t);
  await f.db.exec(
    "create function public.fixture_unreviewed_caller(id uuid)returns void language sql as $$select public._apply_classified_pet_details(id,'{}')$$",
  );
  const before = await f.grants();
  await assert.rejects(f.db.exec(migration), /Review classified helper caller/);
  await f.db.exec("rollback");
  assert.deepEqual(await f.grants(), before);
});

test("changed helper definitions are rejected before permissions change", async (t) => {
  const f = await fixture(t);
  const before = await f.grants();
  await f.db.exec(
    "create or replace function public._apply_classified_pet_details(_listing_id uuid,_pet jsonb default '{}')returns void language plpgsql security definer as $$begin raise exception 'unreviewed';end$$",
  );
  await assert.rejects(f.db.exec(migration), /Review account access boundaries/);
  await f.db.exec("rollback");
  assert.deepEqual(await f.grants(), before);
});

test("unexpected loss of service access is reviewed instead of silently granting it", async (t) => {
  const f = await fixture(t);
  await f.db.exec(
    "revoke all on function public._apply_classified_pet_details(uuid,jsonb) from service_role",
  );
  const before = await f.grants();
  await assert.rejects(f.db.exec(migration), /Review classified detail helper definition/);
  await f.db.exec("rollback");
  assert.deepEqual(await f.grants(), before);
});
