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
test("dealer publication needs a price or safe photos, and preserves missing prices as unknown", () => {
  for (const price of [null, 0, -1, "bad", 1250000]) {
    for (const photos of [
      [],
      ["https://images.example/car.jpg"],
      ["https://images.example/car.jpg?token=private"],
      ["not-an-image"],
    ]) {
      const vehicle = publishedFeedVehicle(
        { id, dealer_slug: dealer.slug, price_cents: price, photos },
        dealer,
      );
      const eligible = price === 1250000 || photos[0] === "https://images.example/car.jpg";
      assert.equal(Boolean(vehicle), eligible, JSON.stringify({ price, photos }));
      if (vehicle) assert.equal(vehicle.price, price === 1250000 ? 12500 : null);
    }
  }
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
    await db.exec(`ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
      CREATE TABLE dealer_profiles(id uuid,display_name text,website text,phone text,address_line1 text,city text,state text,postal_code text,owner_user_id uuid,logo_url text,email text,status text);
      CREATE TABLE account_contact_preferences(user_id uuid,allow_internal_messages boolean);
      ALTER TABLE dealer_feed_publications ADD COLUMN dealer_id uuid, ADD COLUMN inbox_enabled boolean DEFAULT true;`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261111230000_dealer_price_or_photos.sql",
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
    // Eligibility is the same in browse, detail and anonymous readers; only safe active photos count.
    for (const [price, photo, active, eligible] of [
      [null, null, true, false],
      [0, null, true, false],
      [1250000, null, true, true],
      [null, "https://images.example/photo.jpg", true, true],
      [0, "https://images.example/photo.jpg", true, true],
      [null, "https://images.example/photo.jpg", false, false],
      [null, "https://images.example/photo.jpg?key=secret", true, false],
      [null, "http://images.example/photo.jpg", true, false],
    ]) {
      const extra = (
        await db.query(
          `INSERT INTO dealer_inventory_records(source_id,source_record_key,title,price_cents,city,state,content_hash) VALUES ($1,'matrix','Photo or price car',$2,'Boise','ID','matrix') RETURNING id`,
          [source, price],
        )
      ).rows[0].id;
      if (photo)
        await db.query(
          `INSERT INTO dealer_inventory_media(record_id,media_url,position,content_hash,active) VALUES ($1,$2,0,'matrix',$3)`,
          [extra, photo, active],
        );
      const detail = (
        await db.query("SELECT read_published_dealer_inventory($1,NULL,true) AS data", [extra])
      ).rows[0].data;
      assert.equal(
        detail.vehicles.length,
        eligible ? 1 : 0,
        JSON.stringify({ price, photo, active }),
      );
      assert.equal((await read()).vehicles.length, eligible ? 2 : 1);
      await db.query("DELETE FROM dealer_inventory_records WHERE id=$1", [extra]);
    }
    const completed = (
      await db.query(
        `INSERT INTO dealer_inventory_sync_runs(source_id,mode,status) VALUES ($1,'apply','completed') RETURNING id`,
        [source],
      )
    ).rows[0].id;
    await db.query(
      `UPDATE dealer_inventory_sources SET mapping_profile='{"__provider":"motive"}' WHERE id=$1`,
      [source],
    );
    for (const [status, raw, missed, expected] of [
      ["invalid", { price: "0" }, 0, "active"],
      ["invalid", { price: "" }, 0, "active"],
      ["invalid", { price: "0", Status: "invalid" }, 0, "invalid"],
      ["sold", { price: "0" }, 0, "sold"],
      ["stale", { price: "0" }, 1, "stale"],
      ["invalid", { price: "bad" }, 0, "invalid"],
      ["invalid", { price: "0" }, 1, "invalid"],
    ]) {
      const extra = (
        await db.query(
          `INSERT INTO dealer_inventory_records(source_id,source_record_key,title,city,state,content_hash,inventory_status,raw_record,missed_run_count,last_seen_run_id) VALUES ($1,'repair','Repair test','Boise','ID','repair',$2,$3,$4,$5) RETURNING id`,
          [source, status, JSON.stringify(raw), missed, completed],
        )
      ).rows[0].id;
      await db.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20261111230000_dealer_price_or_photos.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(
        (
          await db.query("SELECT inventory_status FROM dealer_inventory_records WHERE id=$1", [
            extra,
          ])
        ).rows[0].inventory_status,
        expected,
      );
      await db.query("DELETE FROM dealer_inventory_records WHERE id=$1", [extra]);
    }
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
