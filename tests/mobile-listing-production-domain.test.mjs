import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  productionListingDatabase,
  validProductionEdit,
} from "./helpers/mobile-listing-production-database.mjs";

async function fixture(t) {
  const f = await productionListingDatabase();
  t.after(() => f.db.close());
  return f;
}

test("captured production edit applies actual fields, media triggers, moderation and one durable receipt", async (t) => {
  const f = await fixture(t),
    id = await f.seed({ imported: true });
  const before = await f.snapshot(id),
    request = randomUUID();
  const input = validProductionEdit({
    sellerNote: " Seller note ",
    itemDetails: { itemType: "Bicycle" },
    publicMediaPaths: [`${f.a}/${id}/new.jpg`, `${f.a}/${id}/second.jpg`],
  });
  const result = await f.manage(id, "edit", before.version, input, request);
  assert.equal(result.replayed, false);
  assert.equal(result.approvedAt, null);
  const after = (await f.snapshot(id)).snapshot;
  assert.equal(after.price_cents, 4200);
  assert.equal(after.products.name, input.title);
  assert.equal(after.products.status, "pending_review");
  assert.equal(after.seller_note, "Seller note");
  assert.deepEqual(after.classified_listing_details.item_details, { itemType: "Bicycle" });
  assert.deepEqual(
    after.listing_media.map((m) => m.storage_path),
    input.publicMediaPaths,
  );
  assert.equal((await f.manage(id, "edit", before.version, input, request)).replayed, true);
  await f.owner();
  const ask = (
    await f.db.query(
      "select public_media_count,approved_at,approved_by,review_note from asks where id=$1",
      [id],
    )
  ).rows[0];
  assert.deepEqual(ask, {
    public_media_count: 2,
    approved_at: null,
    approved_by: null,
    review_note: null,
  });
  assert.equal(
    (
      await f.db.query(
        "select seller_edited from fb_marketplace_import_items where listing_id=$1",
        [id],
      )
    ).rows[0].seller_edited,
    true,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from ask_events where ask_id=$1 and event_type='price_changed'",
        [id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
        request,
      ])
    ).rows[0].n,
    1,
  );
});

test("actual vehicle and home edits accept prices above the former inner $50,000 ceiling", async (t) => {
  const f = await fixture(t);
  for (const [category, priceCents, extra, expected] of [
    [
      "cars-trucks",
      8500000,
      { vehicle: { year: 2025, make: "Toyota", model: "4Runner", mileage: 1200 } },
      {
        vehicle_year: 2025,
        vehicle_make: "Toyota",
        vehicle_model: "4Runner",
        vehicle_mileage: 1200,
      },
    ],
    [
      "other-real-estate",
      65000000,
      {
        home: {
          mode: "buy",
          bedrooms: 3,
          bathrooms: 2.5,
          squareFeet: 2100,
          yearBuilt: 2020,
          acreage: "0.25",
        },
      },
      {
        home_mode: "buy",
        home_bedrooms: 3,
        home_bathrooms: 2.5,
        home_square_feet: 2100,
        home_year_built: 2020,
        home_acres: 0.25,
      },
    ],
  ]) {
    const id = await f.seed({ category });
    await f.manage(
      id,
      "edit",
      (await f.snapshot(id)).version,
      validProductionEdit({ category, priceCents, ...extra }),
    );
    const snapshot = (await f.snapshot(id)).snapshot;
    assert.equal(snapshot.price_cents, priceCents);
    for (const [key, value] of Object.entries(expected))
      assert.equal(snapshot.classified_listing_details[key], value, key);
  }
});

test("actual category details enforce pet requirements and preserve a free pet price", async (t) => {
  const f = await fixture(t),
    id = await f.seed({ category: "pets" });
  const before = await f.snapshot(id);
  await assert.rejects(
    f.manage(id, "edit", before.version, validProductionEdit({ category: "pets", priceCents: 0 })),
    /Pet subcategory, species/,
  );
  assert.equal((await f.snapshot(id)).version, before.version);
  await f.manage(
    id,
    "edit",
    before.version,
    validProductionEdit({
      category: "pets",
      priceCents: 0,
      pet: { subcategory: "Dogs", species: "Dog", placementType: "free", offeredBy: "Owner" },
    }),
  );
  assert.equal((await f.snapshot(id)).snapshot.price_cents, 0);
  await f.owner();
  assert.equal(
    (
      await f.db.query(
        "select p.retail_price_cents from products p join asks a on a.product_id=p.id where a.id=$1",
        [id],
      )
    ).rows[0].retail_price_cents,
    0,
  );
  assert.equal(
    (
      await f.db.query(
        "select price_cents from ask_events where ask_id=$1 order by created_at desc limit 1",
        [id],
      )
    ).rows[0].price_cents,
    0,
  );
});

test("captured archive/relist requires real private evidence and public media, and returns to review", async (t) => {
  const f = await fixture(t),
    id = await f.seed();
  await f.manage(id, "archive", (await f.snapshot(id)).version);
  const archived = await f.snapshot(id);
  assert.equal(archived.snapshot.status, "cancelled");
  await f.owner();
  await f.db.query("delete from ask_media where ask_id=$1", [id]);
  await f.actor();
  const withoutEvidence = await f.snapshot(id);
  await assert.rejects(
    f.manage(id, "relist", withoutEvidence.version),
    /Private evidence and a public listing photo are required/,
  );
  assert.equal((await f.snapshot(id)).version, withoutEvidence.version);
  await f.owner();
  await f.db.query("insert into ask_media(ask_id,storage_path) values($1,$2)", [
    id,
    `${f.a}/${id}/restored-private.jpg`,
  ]);
  await f.db.query("delete from listing_media where ask_id=$1", [id]);
  await f.actor();
  await assert.rejects(
    f.manage(id, "relist", (await f.snapshot(id)).version),
    /Private evidence and a public listing photo are required/,
  );
  await f.owner();
  await f.db.query(
    "insert into listing_media(ask_id,storage_path,rights_attested_at) values($1,$2,now())",
    [id, `${f.a}/${id}/restored-public.jpg`],
  );
  await f.actor();
  const result = await f.manage(id, "relist", (await f.snapshot(id)).version);
  assert.equal(result.status, "active");
  assert.equal(result.approvedAt, null);
  await f.owner();
  assert.deepEqual(
    (
      await f.db.query(
        "select event_type::text from ask_events where ask_id=$1 order by created_at,id",
        [id],
      )
    ).rows
      .map((r) => r.event_type)
      .sort(),
    ["cancelled", "released"],
  );
});

test("actual job/service details persist arrays and category pricing fields", async (t) => {
  const f = await fixture(t);
  for (const [category, extra, expected] of [
    [
      "jobs",
      {
        job: {
          category: "Skilled trades",
          employerName: "Fixture employer",
          payType: "Hourly",
          payMin: 22,
          payMax: 28,
          employmentType: "Full-time",
          responsibilities: ["Repairs", "Customer service"],
          qualifications: ["Experience"],
        },
      },
      {
        job_employer_name: "Fixture employer",
        job_pay_min: 22,
        job_pay_max: 28,
        job_responsibilities: ["Repairs", "Customer service"],
        job_qualifications: ["Experience"],
      },
    ],
    [
      "services",
      {
        service: {
          subcategory: "Repairs",
          serviceArea: "Boise",
          offerings: ["Repairs", "Installation"],
            pricingType: "hour",
          priceMaxCents: 12500,
        },
      },
      {
        service_subcategory: "Repairs",
        service_area: "Boise",
        service_offerings: ["Repairs", "Installation"],
        service_price_max_cents: 12500,
      },
    ],
  ]) {
    const id = await f.seed({ category });
    await f.manage(
      id,
      "edit",
      (await f.snapshot(id)).version,
      validProductionEdit({ category, ...extra }),
    );
    const details = (await f.snapshot(id)).snapshot.classified_listing_details;
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(details[key], value, key);
  }
});

test("archived import source refusal rolls back listing, events, flags and receipt atomically", async (t) => {
  const f = await fixture(t),
    id = await f.seed({ imported: true, archivedSource: true });
  const before = await f.snapshot(id),
    request = randomUUID();
  await assert.rejects(
    f.manage(id, "edit", before.version, validProductionEdit(), request),
    /Restore it before importing or refreshing/,
  );
  assert.equal((await f.snapshot(id)).version, before.version);
  await f.owner();
  assert.equal(
    (
      await f.db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
        request,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from ask_events where ask_id=$1", [id])).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query(
        "select seller_edited from fb_marketplace_import_items where listing_id=$1",
        [id],
      )
    ).rows[0].seller_edited,
    false,
  );
});

test("real schema rolls back late constraint/media failures and rejects stale or foreign writes", async (t) => {
  const f = await fixture(t),
    id = await f.seed();
  const before = await f.snapshot(id);
  // Home validation occurs after update_ask/product edits. A real CHECK failure
  // must undo those earlier writes and the logical receipt.
  await assert.rejects(
    f.manage(id, "edit", before.version, validProductionEdit({ home: { bedrooms: 99 } })),
    /check constraint/,
  );
  assert.equal((await f.snapshot(id)).version, before.version);
  await assert.rejects(
    f.manage(
      id,
      "edit",
      before.version,
      validProductionEdit({ publicMediaPaths: [`${f.b}/foreign.jpg`] }),
    ),
    /Choose your own listing photos/,
  );
  assert.equal((await f.snapshot(id)).version, before.version);
  await f.actor(f.b);
  assert.equal(await f.snapshot(id), null);
  await assert.rejects(f.manage(id, "archive", before.version), /Listing unavailable/);
  await f.actor();
  await f.manage(id, "edit", before.version, validProductionEdit());
  await assert.rejects(f.manage(id, "archive", before.version), /Listing changed/);
  await f.owner();
  await f.db.query("delete from auth.sessions where id=$1", [f.sessionA]);
  await f.actor();
  await assert.rejects(f.snapshot(id), /Account access is unavailable/);
});
