import { listingIdFromParam, listingParam } from "../src/lib/listing-url.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { publishedFeedVehicle, mergeDealerFeedVehicles } from "../src/lib/dealer-feed-contract.ts";
const dealer = {
  slug: "authorized-dealer",
  display_name: "Authorized Dealer",
  website: "https://dealer.example",
  phone: "2085550100",
  address_line1: "1 Main St",
  city: "Twin Falls",
  state: "ID",
  postal_code: "83301",
};
const id = "10000000-0000-4000-8000-000000000001";
test("direct dealer normalization keeps provenance, stock, nullable mileage and public contact", () => {
  const vehicle = publishedFeedVehicle(
    {
      id,
      dealer_slug: dealer.slug,
      title: "2026 Subaru Forester",
      price_cents: 3500000,
      vehicle_year: 2026,
      vehicle_make: "Subaru",
      vehicle_model: "Forester",
      vehicle_mileage: null,
      stock_number: "S123",
      condition: "New",
      source_url: dealer.website + "/inventory/car",
      photos: ["https://images.example/car.jpg"],
    },
    dealer,
  );
  assert.equal(vehicle.id, "dealerfeed-" + id);
  assert.equal(vehicle.price, 35000);
  assert.equal(vehicle.miles, null);
  assert.equal(vehicle.stockNumber, "S123");
  assert.equal(vehicle.inventoryType, "new");
  assert.equal(vehicle.dealer.name, dealer.display_name);
  assert.equal(vehicle.dataSource, "Authorized dealer feed");
  assert.equal(vehicle.sourceUrl, dealer.website + "/inventory/car");
  assert.deepEqual(vehicle.media.photoLinks, ["https://images.example/car.jpg"]);
  assert.equal(
    publishedFeedVehicle({ id, dealer_slug: dealer.slug, price_cents: 0 }, dealer),
    null,
  );
  assert.equal(publishedFeedVehicle({ id, dealer_slug: dealer.slug }, dealer), null);
});
test("direct permission feed replaces duplicated and older same-dealer aggregator cars", () => {
  const card = (id, vin, url) => ({ id, vehicle: { vin }, externalVehicle: { sourceUrl: url } });
  const direct = [card("direct", "VIN1", "https://dealer.example/inventory/new")];
  const aggregate = [
    card("duplicate", "VIN1", "https://other.example/car"),
    card("old-dealer-car", "VIN2", "https://www.dealer.example/old"),
    card("other", "VIN3", "https://other.example/car"),
  ];
  assert.deepEqual(
    mergeDealerFeedVehicles(direct, aggregate, [dealer]).map((c) => c.id),
    ["direct", "other"],
  );
});
test("public RPC requires authorization and exposes only safe current eligible inventory", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE asks(id uuid PRIMARY KEY);`,
    );
    const foundation = await readFile(
      new URL(
        "../supabase/migrations/20260919120000_add_dealer_inventory_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      foundation.slice(0, foundation.indexOf("ALTER TABLE public.dealer_inventory_sources ENABLE")),
    );
    await db.exec(
      `CREATE TABLE partner_vehicle_reports(listing_id text CONSTRAINT partner_vehicle_reports_listing_id_check CHECK(length(listing_id)>0),status text); CREATE TABLE saved_partner_vehicles(listing_id text CONSTRAINT saved_partner_vehicles_listing_id_check CHECK(length(listing_id)>0)); CREATE TABLE listing_view_counts(listing_id text CONSTRAINT listing_view_counts_listing_id_check CHECK(length(listing_id)>0)); INSERT INTO auth.users VALUES ('${id}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261110200000_authorized_dealer_feed_publication.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const source = (
      await db.query(
        `INSERT INTO dealer_inventory_sources(owner_user_id,name,feed_url) VALUES ($1,'Authorized feed','https://provider.example/private?key=never-public') RETURNING id`,
        [id],
      )
    ).rows[0].id;
    const rec = (
      await db.query(
        `INSERT INTO dealer_inventory_records(source_id,source_record_key,title,price_cents,city,state,content_hash,raw_record) VALUES ($1,'one','Public car',3500000,'Twin Falls','ID','one','{"url":"https://dealer.example/inventory/car?tracking=drop","secret":"never-public"}') RETURNING id`,
        [source],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO dealer_inventory_records(source_id,source_record_key,title,price_cents,city,state,content_hash,inventory_status) VALUES ($1,'two','Unpriced',NULL,'Twin Falls','ID','two','invalid')`,
      [source],
    );
    await db.query(
      `INSERT INTO dealer_inventory_media(record_id,media_url,position,content_hash) VALUES ($1,'https://images.example/one.jpg',0,'one'),($1,'https://images.example/two.jpg',1,'two'),($1,'https://images.example/private.jpg?key=never-public',2,'three')`,
      [rec],
    );
    const read = async (full = false) =>
      (await db.query("SELECT read_published_dealer_inventory(NULL,NULL,$1) AS data", [full]))
        .rows[0].data;
    assert.equal((await read()).vehicles.length, 0, "unapproved source is private");
    await db.query(
      `INSERT INTO dealer_feed_publications(source_id,slug,display_name,website,city,state,authorized_by,authorization_reference,enabled) VALUES ($1,'authorized-dealer','Authorized Dealer','https://dealer.example','Twin Falls','ID',$2,'Private written approval reference',true)`,
      [source, id],
    );
    let data = await read();
    assert.equal(data.vehicles.length, 1);
    assert.equal(data.vehicles[0].photos.length, 1);
    assert.equal(data.vehicles[0].source_url, "https://dealer.example/inventory/car");
    assert.equal((await read(true)).vehicles[0].photos.length, 2);
    assert.ok(!JSON.stringify(data).includes("never-public"));
    assert.ok(!JSON.stringify(data).includes("Private written approval"));
    assert.ok(!JSON.stringify(data).includes("feed_url"));
    await db.exec("SET ROLE anon");
    assert.equal((await read()).vehicles.length, 1);
    await assert.rejects(db.query("SELECT * FROM dealer_feed_publications"), /permission denied/);
    await db.exec("RESET ROLE");
    for (const status of ["sold", "removed", "invalid"]) {
      await db.query("UPDATE dealer_inventory_records SET inventory_status=$1 WHERE id=$2", [
        status,
        rec,
      ]);
      assert.equal((await read()).vehicles.length, 0, status + " is hidden");
    }
    await db.query(
      `UPDATE dealer_inventory_records SET inventory_status='stale',missed_run_count=1 WHERE id=$1`,
      [rec],
    );
    assert.equal((await read()).vehicles.length, 1);
    await db.query("UPDATE dealer_inventory_records SET missed_run_count=2 WHERE id=$1", [rec]);
    assert.equal((await read()).vehicles.length, 0, "missing snapshot grace enforced");
    await db.query(
      `UPDATE dealer_inventory_records SET inventory_status='active',missed_run_count=0,last_seen_at=now()-interval '73 hours' WHERE id=$1`,
      [rec],
    );
    assert.equal((await read()).vehicles.length, 0, "expired feed does not stay advertised");
    await db.query("UPDATE dealer_inventory_records SET last_seen_at=now() WHERE id=$1", [rec]);
    await db.query(`UPDATE dealer_inventory_sources SET status='error' WHERE id=$1`, [source]);
    assert.equal((await read()).vehicles.length, 1, "temporary fetch errors retain valid snapshot");
    await db.query(`UPDATE dealer_inventory_sources SET status='paused' WHERE id=$1`, [source]);
    assert.equal((await read()).vehicles.length, 0);
    await db.query(`UPDATE dealer_inventory_sources SET status='active' WHERE id=$1`, [source]);
    await db.query(`INSERT INTO partner_vehicle_reports VALUES ($1,'reviewed')`, [
      "dealerfeed-" + rec,
    ]);
    assert.equal((await read()).vehicles.length, 0, "moderator removal applies");
    await db.query("DELETE FROM partner_vehicle_reports");
    await db.query("UPDATE dealer_feed_publications SET revoked_at=now() WHERE source_id=$1", [
      source,
    ]);
    assert.equal((await read()).vehicles.length, 0, "revoked permission removes public inventory");
  } finally {
    await db.close();
  }
});

test("dealer feed URLs retain their provider prefix instead of becoming native UUIDs", () => {
  const value = "dealerfeed-" + id;
  assert.equal(listingIdFromParam(value), value);
  assert.equal(listingParam({ id: value, title: "Car" }), value);
});

test("older readable dealer links resolve to the dealer record and its current URL", () => {
  const value = "dealerfeed-" + id;
  for (const title of ["2016-ford-focus-5dr-hb-se-twin-falls", "2026-subaru-crosstrek-limited"]) {
    const parsed = listingIdFromParam(`${title}-${value}`);
    assert.equal(parsed, value);
    assert.equal(listingParam({ id: parsed, title: "Updated title" }), value);
  }
  assert.equal(listingIdFromParam(`private-seller-vehicle-${id}`), id);
  assert.equal(listingIdFromParam(id), id);
});
