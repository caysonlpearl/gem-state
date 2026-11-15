import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installDeletionWorkerSchema } from "./account-deletion-database.mjs";

const capture = JSON.parse(
  readFileSync(
    new URL("../fixtures/mobile-listing-production-domain-20261114.json", import.meta.url),
  ),
);
const rows = (kind) => capture.rows.filter((row) => row.kind === kind);
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';

/** Actual inspected edit/archive/relist functions, types, constraints and triggers.
 * Auth/account infrastructure and unrelated FK parents are synthetic. Seed inserts
 * bypass triggers only while constructing pre-existing listings; all operational
 * tests run the captured triggers. This does not test listing creation or RLS. */
export async function productionListingDatabase(db = new PGlite()) {
  try {
    await installDeletionWorkerSchema(db);
    for (const row of rows("enum")) {
      const labels = row.definition;
      await db.exec(
        `create type public.${identifier(row.name)} as enum (${labels.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",")})`,
      );
    }
    for (const name of ["locations", "dealer_profiles", "orders", "brands", "collections"]) {
      await db.exec(`create table public.${name}(id uuid primary key)`);
    }
    for (const row of rows("column_types")) {
      if (row.definition.some((c) => c.identity))
        throw new Error("Review captured identity column before rebuilding fixture");
      const columns = row.definition.map(
        (c) =>
          `${identifier(c.name)} ${c.sql_type}${c.generated ? ` generated always as (${c.default}) stored` : c.default ? " default " + c.default : ""}${c.nullable ? "" : " not null"}`,
      );
      await db.exec(`create table public.${identifier(row.name)} (${columns.join(",")})`);
    }
    // Exact core FK/check/unique constraints were captured separately. The batch
    // parent is outside that capture; only its referenced primary key is needed.
    await db.exec("alter table public.fb_marketplace_import_batches add primary key(id)");
    for (const foreign of [false, true]) {
      for (const row of rows("constraints")) {
        for (const constraint of row.definition.filter(
          (c) => c.startsWith("FOREIGN KEY") === foreign,
        )) {
          await db.exec(`alter table public.${identifier(row.name)} add ${constraint}`);
        }
      }
    }
    for (const row of rows("function")) {
      const f = row.definition;
      await db.exec(f.definition);
      const actual = (
        await db.query("select md5(prosrc) body_md5 from pg_proc where oid=$1::regprocedure", [
          "public." + row.name,
        ])
      ).rows[0];
      if (actual?.body_md5 !== f.body_md5)
        throw new Error(`Captured function body differs: ${row.name}`);
      await db.exec(
        `revoke all on function public.${row.name} from public,anon,authenticated,service_role`,
      );
      for (const [role, allowed] of [
        ["anon", f.anon_execute],
        ["authenticated", f.member_execute],
        ["service_role", f.service_execute],
      ]) {
        if (allowed) await db.exec(`grant execute on function public.${row.name} to ${role}`);
      }
      if (f.registered_body_md5) {
        await db.query(
          `insert into public.account_access_protected_functions(function_oid,signature,original_definition,protected_body_md5)
        values($1::regprocedure,$1,$2,$3)`,
          ["public." + row.name, f.original_definition, f.registered_body_md5],
        );
      }
    }
    for (const row of rows("triggers"))
      for (const trigger of row.definition) await db.exec(trigger);
    await db.exec("select public.protect_account_access_boundaries()");
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261114150000_mobile_listing_management.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = randomUUID(),
      b = randomUUID(),
      sessionA = randomUUID(),
      sessionB = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')",
      [sessionA, a, sessionB, b],
    );
    await db.query(
      "insert into shopping_accounts(user_id,terms_version) values($1,'2026-11-12'),($2,'2026-11-12')",
      [a, b],
    );
    await db.exec(
      "insert into categories(slug,name) values('general','General'),('cars-trucks','Vehicles'),('other-real-estate','Homes'),('pets','Pets'),('jobs','Jobs'),('services','Services')",
    );
    async function owner() {
      await db.exec("reset role");
    }
    async function actor(user = a, session = user === a ? sessionA : sessionB) {
      await owner();
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: user, session_id: session, role: "authenticated" }),
      ]);
      await db.exec("set role authenticated");
    }
    async function seed({
      user = a,
      category = "general",
      imported = false,
      archivedSource = false,
    } = {}) {
      await owner();
      const id = randomUUID(),
        product = randomUUID(),
        variant = randomUUID();
      // Local fixture construction only; restore triggers even on seed failure.
      await db.exec("set session_replication_role=replica");
      try {
        await db.query(
          "insert into products(id,slug,name,description,created_by,category_id,status) select $1::uuid,($1::uuid)::text,'Original listing','An original listing with enough description.',$2,id,'published' from categories where slug=$3",
          [product, user, category],
        );
        await db.query("insert into product_variants(id,product_id) values($1,$2)", [
          variant,
          product,
        ]);
        await db.query(
          "insert into asks(id,product_id,variant_id,seller_id,price_cents,approved_at) values($1,$2,$3,$4,2500,now())",
          [id, product, variant, user],
        );
        await db.query(
          "insert into classified_listing_details(listing_id,city,region,state,fulfillment_mode) values($1,'Boise','Treasure Valley','ID','local_pickup')",
          [id],
        );
        await db.query(
          "insert into listing_media(ask_id,storage_path,position,rights_attested_at) values($1,$2,0,now())",
          [id, `${user}/${id}/old.jpg`],
        );
        await db.query("insert into ask_media(ask_id,storage_path) values($1,$2)", [
          id,
          `${user}/${id}/private.jpg`,
        ]);
        if (imported) {
          const source = `https://fixture.invalid/${id}`;
          const batch = (
            await db.query(
              "insert into fb_marketplace_import_batches(imported_by,source_profile_url) values($1,$2) returning id",
              [user, source],
            )
          ).rows[0].id;
          await db.query(
            "insert into fb_marketplace_import_items(batch_id,seller_id,source_profile_url,source_url,title,price_cents,listing_id) values($1,$2,$3,$3,'Original listing',2500,$4)",
            [batch, user, source, id],
          );
          if (archivedSource)
            await db.query(
              "insert into import_source_archives(source_profile_url,changed_by,archived_at) values($1,$2,now())",
              [source, user],
            );
        }
      } finally {
        await db.exec("set session_replication_role=origin");
      }
      await actor();
      return id;
    }
    const snapshot = async (id) =>
      (await db.query("select public.mobile_listing_editor_snapshot($1) result", [id])).rows[0]
        .result;
    const manage = async (id, action, version, input = {}, request = randomUUID()) =>
      (
        await db.query("select public.mobile_manage_listing($1,$2,$3,$4,$5) result", [
          request,
          id,
          action,
          version,
          input,
        ])
      ).rows[0].result;
    await actor();
    return { db, a, b, sessionA, sessionB, owner, actor, seed, snapshot, manage };
  } catch (error) {
    await db.close?.();
    throw error;
  }
}

export const validProductionEdit = (overrides = {}) => ({
  category: "general",
  title: "Updated local listing",
  description: "An updated local listing with sufficient description.",
  priceCents: 4200,
  condition: "used_good",
  region: "Treasure Valley",
  city: "Boise",
  state: "ID",
  postalCode: "83702",
  fulfillmentMode: "local_pickup",
  itemDetails: {},
  ...overrides,
});
