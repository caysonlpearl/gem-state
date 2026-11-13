import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  filterDealerHomepageHolds,
  dealerInventoryVisibilityLabel,
} from "../src/lib/dealer-inventory-controls.ts";
const sql = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  staff = "10000000-0000-4000-8000-000000000003";

test("real database enforces dealer ownership, durable VIN holds, moderation, report routing and feed-owned values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
   CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
   CREATE TABLE asks(id uuid PRIMARY KEY,dealer_id uuid,approved_at timestamptz,updated_at timestamptz);
   CREATE TABLE dealer_audit_events(dealer_id uuid,actor_user_id uuid,action text,target_type text,target_id text,metadata jsonb);
   CREATE TABLE account_contact_preferences(user_id uuid,allow_internal_messages boolean);`);
    const foundation = await sql(
      "supabase/migrations/20260919120000_add_dealer_inventory_foundation.sql",
    );
    await db.exec(
      foundation.slice(0, foundation.indexOf("ALTER TABLE public.dealer_inventory_sources ENABLE")),
    );
    const ops = await sql("supabase/migrations/20260930180000_add_dealership_operations.sql");
    for (const name of ["dealer_profiles", "dealer_members"]) {
      const start = ops.indexOf("CREATE TABLE IF NOT EXISTS public." + name);
      await db.exec(ops.slice(start, ops.indexOf("\n);", start) + 3));
    }
    await db.exec(
      "ALTER TABLE dealer_inventory_sources ADD COLUMN dealer_id uuid;CREATE TABLE partner_vehicle_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id text,reporter_id uuid,reason text,details text,status text,resolved_at timestamptz,resolved_by uuid,UNIQUE(listing_id,reporter_id));",
    );
    const publication = await sql(
      "supabase/migrations/20261110200000_authorized_dealer_feed_publication.sql",
    );
    await db.exec(
      publication.slice(
        publication.indexOf("CREATE TABLE"),
        publication.indexOf("CREATE FUNCTION public.read_published"),
      ),
    );
    await db.exec(
      "ALTER TABLE dealer_feed_publications ADD COLUMN dealer_id uuid,ADD COLUMN inbox_enabled boolean DEFAULT true;",
    );
    await db.exec(
      await sql("supabase/migrations/20261113020000_dealer_inventory_owner_controls.sql"),
    );
    for (const id of [owner, other, staff])
      await db.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
    const dealer = (
      await db.query(
        "INSERT INTO dealer_profiles(owner_user_id,legal_name,display_name,slug,city,state,status) VALUES($1,'Dealer','Dealer','dealer','Boise','ID','ready') RETURNING id",
        [owner],
      )
    ).rows[0].id;
    const otherDealer = (
      await db.query(
        "INSERT INTO dealer_profiles(owner_user_id,legal_name,display_name,slug,city,state,status) VALUES($1,'Other','Other','other','Boise','ID','ready') RETURNING id",
        [other],
      )
    ).rows[0].id;
    const source = (
      await db.query(
        "INSERT INTO dealer_inventory_sources(owner_user_id,dealer_id,name) VALUES($1,$2,'Feed') RETURNING id",
        [owner, dealer],
      )
    ).rows[0].id;
    const otherSource = (
      await db.query(
        "INSERT INTO dealer_inventory_sources(owner_user_id,dealer_id,name) VALUES($1,$2,'Other feed') RETURNING id",
        [other, otherDealer],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO dealer_feed_publications(source_id,dealer_id,slug,display_name,website,city,state,authorized_by,authorization_reference,enabled) VALUES($1,$2,'dealer','Dealer','https://dealer.example','Boise','ID',$3,'Written dealer authorization',true)",
      [source, dealer, owner],
    );
    const insert = async (source, key, vin = "4T1G11AK5MU123456") =>
      (
        await db.query(
          "INSERT INTO dealer_inventory_records(source_id,source_record_key,title,vin,price_cents,city,state,content_hash) VALUES($1,$2,'2021 Toyota Camry',$3,2500000,'Boise','ID','hash') RETURNING id",
          [source, key, vin],
        )
      ).rows[0].id;
    const record = await insert(source, "one");
    const unrelated = await insert(otherSource, "one");
    const identity = async (id) =>
      db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id ?? ""]);
    const visible = async () =>
      (await db.query("SELECT read_published_dealer_inventory(NULL,'dealer',false) AS feed"))
        .rows[0].feed.vehicles;
    const set = async (id, value) =>
      db.query("SELECT set_dealer_inventory_visibility($1,$2,'test note')", [id, value]);
    await identity(null);
    await assert.rejects(set(record, "hidden"), /Sign in/);
    await identity(other);
    await assert.rejects(set(record, "hidden"), /Access to this dealership/);
    await identity(owner);
    await assert.rejects(set(unrelated, "hidden"), /Access to this dealership/);
    assert.equal((await visible()).length, 1);
    await set(record, "hidden");
    assert.equal((await visible()).length, 0);
    await db.query(
      "UPDATE dealer_inventory_records SET price_cents=2400000,inventory_status='active',last_seen_at=now(),source_record_key='refreshed' WHERE id=$1",
      [record],
    );
    assert.equal((await visible()).length, 0, "feed refresh must not clear the dealer hold");
    const duplicate = await insert(source, "replacement");
    assert.equal((await visible()).length, 0, "same VIN in a new record stays hidden");
    const ids = [`dealerfeed-${record}`, `dealerfeed-${duplicate}`, `dealerfeed-${unrelated}`];
    assert.equal(
      (await db.query("SELECT suppressed_dealer_listing_ids($1::text[]) AS ids", [ids])).rows[0].ids
        .length,
      2,
    );
    await set(duplicate, "visible");
    assert.equal((await visible()).length, 2);
    await set(record, "sold");
    assert.equal((await visible()).length, 0);
    assert.equal(
      (
        await db.query(
          "SELECT inventory_status,price_cents FROM dealer_inventory_records WHERE id=$1",
          [record],
        )
      ).rows[0].inventory_status,
      "active",
    );
    const mine = (await db.query("SELECT my_dealer_inventory() AS inventory")).rows[0].inventory;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].records[0].dealerVisibility, "sold");
    await db.query(
      "SELECT report_dealer_inventory_details($1,'Mileage is incorrect in the feed')",
      [record],
    );
    assert.equal(
      (await db.query("SELECT status,reason FROM partner_vehicle_reports")).rows[0].status,
      "open",
    );
    await db.exec("UPDATE partner_vehicle_reports SET status='reviewed'");
    await assert.rejects(
      db.query("SELECT report_dealer_inventory_details($1,'Please check the mileage again')", [
        record,
      ]),
      /completed moderation review/,
    );
    await set(record, "visible");
    assert.equal(
      (await visible()).some((row) => row.id === record),
      false,
      "restore cannot bypass reviewed moderation",
    );
    await db.query(
      "INSERT INTO dealer_members(dealer_id,user_id,role,status) VALUES($1,$2,'inventory','active')",
      [dealer, staff],
    );
    await identity(staff);
    await set(duplicate, "hidden");
    await db.query("UPDATE dealer_members SET status='disabled' WHERE user_id=$1", [staff]);
    await assert.rejects(set(duplicate, "visible"), /Access to this dealership/);
    await assert.rejects(
      db.query("SELECT report_dealer_inventory_details($1,'Wrong photos shown')", [duplicate]),
      /Access to this dealership/,
    );
    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM dealer_inventory_controls"), /permission denied/);
    await db.exec("RESET ROLE");
    assert.ok(
      (await db.query("SELECT count(*)::int count FROM dealer_audit_events")).rows[0].count >= 6,
    );
  } finally {
    await db.close();
  }
});

test("cached discovery removes held vehicles without mutating cache or refreshing providers", async () => {
  const snapshot = {
    sections: {
      vehicles: { cards: [{ id: "dealerfeed-one" }, { id: "dealerfeed-two" }], total: 2 },
      native: {
        cards: [{ id: "native-dealer", dealer: { slug: "dealer" } }, { id: "private" }],
        total: 2,
      },
    },
  };
  const result = await filterDealerHomepageHolds(snapshot, async (ids) => {
    assert.equal(ids.length, 3);
    return ["dealerfeed-one", "native-dealer"];
  });
  assert.deepEqual(
    result.sections.vehicles.cards.map((c) => c.id),
    ["dealerfeed-two"],
  );
  assert.deepEqual(
    result.sections.native.cards.map((c) => c.id),
    ["private"],
  );
  assert.equal(snapshot.sections.vehicles.cards.length, 2);
  const outage = await filterDealerHomepageHolds(snapshot, async () => {
    throw Error("unavailable");
  });
  assert.equal(outage.sections.vehicles.cards.length, 0);
  assert.deepEqual(
    outage.sections.native.cards.map((c) => c.id),
    ["private"],
  );
  assert.equal(dealerInventoryVisibilityLabel("sold", "active"), "Marked sold by dealership");
});
