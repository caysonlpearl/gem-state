import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { listingManagementDatabase } from "./helpers/mobile-listing-management-database.mjs";
import { mobileListingAllowed, mobileCategories } from "../src/lib/mobile-contract.ts";
const input = (f, patch = {}) => ({
  title: "Updated bicycle",
  description: "Updated local bicycle description.",
  category: "general",
  priceCents: 3500,
  condition: "used_good",
  region: "Treasure Valley",
  city: "Boise",
  state: "ID",
  fulfillmentMode: "local_pickup",
  itemDetails: { brand: "Fixture" },
  vehicle: { make: "Fixture" },
  home: { beds: 2 },
  job: { name: "Fixture" },
  service: { area: "Boise" },
  pet: { species: "Dog" },
  publicMediaPaths: [f.a + "/new.jpg"],
  ...patch,
});
test("native edit commits domain fields, category details, photos and receipt together; a lost response replays once", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      version = (await f.snapshot(id)).version,
      request = randomUUID();
    const result = await f.manage(id, "edit", version, input(f), request),
      again = await f.manage(id, "edit", version, input(f), request);
    assert.equal(result.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal(again.version, result.version);
    assert.equal(result.approvedAt, null);
    assert.notEqual(result.version, version);
    const row = (await f.snapshot(id)).snapshot;
    assert.equal(row.products.name, "Updated bicycle");
    assert.deepEqual(row.classified_listing_details.item_details, { brand: "Fixture" });
    assert.deepEqual(row.classified_listing_details.vehicle, { make: "Fixture" });
    assert.equal(row.listing_media[0].storage_path, f.a + "/new.jpg");
    await f.owner();
    assert.equal(
      (await f.db.query("select count(*)::int n from fixture_listing_calls where action='edit'"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await f.db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      1,
    );
    const receipt = (await f.db.query("select * from mobile_message_receipts")).rows[0];
    assert(!JSON.stringify(receipt).includes("Updated bicycle"));
    await f.actor();
    await assert.rejects(
      f.manage(id, "edit", version, input(f, { title: "Changed retry" }), request),
      /does not match/,
    );
  } finally {
    await f.db.close();
  }
});
test("failed detail or photo writes roll back the entire edit and leave no successful receipt", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      original = await f.snapshot(id);
    for (const patch of [
      { title: "domain failure" },
      { itemDetails: { fault: true } },
      { publicMediaPaths: [f.a + "/fail-media.jpg"] },
      { publicMediaPaths: [f.b + "/foreign.jpg"] },
      { publicMediaPaths: [f.a + "/../foreign.jpg"] },
      { publicMediaPaths: [f.a + "/new.jpg", f.a + "/new.jpg"] },
      { publicMediaPaths: null },
      { category: "firearms" },
      { title: "Rifle ammunition" },
      { category: "missing" },
    ]) {
      await assert.rejects(f.manage(id, "edit", original.version, input(f, patch)));
      assert.deepEqual(await f.snapshot(id), original);
      await f.owner();
      assert.equal(
        (await f.db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
        0,
      );
      await f.actor();
    }
  } finally {
    await f.db.close();
  }
});
test("retained photos, free pets and a newer revision preserve the original domain behavior", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      first = await f.snapshot(id);
    await f.manage(id, "edit", first.version, input(f, { publicMediaPaths: [] }));
    const updated = await f.snapshot(id);
    assert.equal(updated.snapshot.listing_media[0].storage_path, f.a + "/old.jpg");
    await assert.rejects(f.manage(id, "edit", first.version, input(f)), /Listing changed/);
    await f.manage(id, "edit", updated.version, input(f, { category: "pets", priceCents: 0 }));
    assert.equal((await f.snapshot(id)).snapshot.price_cents, 0);
    await f.owner();
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from fixture_listing_calls where action='free-pet'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("archive and relist receipts do not repeat expiry changes, and relists always return to review", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      first = await f.snapshot(id),
      request = randomUUID();
    const removed = await f.manage(id, "archive", first.version, {}, request);
    assert.equal(removed.status, "cancelled");
    await assert.rejects(f.manage(id, "edit", removed.version, input(f)), /Only open listings/);
    assert.equal((await f.manage(id, "archive", first.version, {}, request)).replayed, true);
    const restoreRequest = randomUUID(),
      restored = await f.manage(id, "relist", removed.version, {}, restoreRequest);
    assert.equal(restored.status, "active");
    assert.equal(restored.approvedAt, null);
    const expiry = (await f.snapshot(id)).snapshot.expires_at;
    assert.equal(
      (await f.manage(id, "relist", removed.version, {}, restoreRequest)).replayed,
      true,
    );
    assert.equal((await f.snapshot(id)).snapshot.expires_at, expiry);
    await assert.rejects(f.manage(id, "relist", restored.version), /Only removed/);
    await f.owner();
    assert.equal(
      (await f.db.query("select count(*)::int n from fixture_listing_calls where action='relist'"))
        .rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("foreign, restricted, misplaced, unknown and demo listings are inaccessible through editor and writes", async () => {
  const f = await listingManagementDatabase();
  try {
    const foreign = await f.seed(f.b);
    assert.equal(await f.snapshot(foreign), null);
    await assert.rejects(f.manage(foreign, "archive", "a".repeat(64)), /Listing unavailable/);
    for (const patch of [
      { category: "firearms" },
      { category: "unknown" },
      { title: "Glock pistol" },
      { description: "Rifle ammunition" },
      { demo: true },
    ]) {
      const id = await f.seed(f.a, patch);
      assert.equal(await f.snapshot(id), null);
      await assert.rejects(f.manage(id, "archive", "a".repeat(64)), /Listing unavailable/);
    }
    await f.owner();
    assert.equal(
      (await f.db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("catalog predicate matches current app taxonomy and misplaced-content boundaries", async () => {
  const f = await listingManagementDatabase();
  try {
    await f.owner();
    for (const category of [...mobileCategories.map((c) => c.slug), "firearms", "unknown", null])
      for (const title of [
        "A bicycle",
        "Rifle",
        "ammo_case",
        "Ammo case",
        "Red GLOCK",
        "AR-15",
        "éRifleé",
        "Riflescope",
        "automatic conversion kit",
      ]) {
        const sql = (
          await f.db.query("select public.mobile_listing_scope_allowed($1,$2,$3) allowed", [
            category,
            title,
            "Local item.",
          ])
        ).rows[0].allowed;
        assert.equal(
          sql,
          mobileListingAllowed({ categorySlug: category, title, description: "Local item." }),
          String(category) + " " + title,
        );
      }
  } finally {
    await f.db.close();
  }
});

test("live-session, suspension, current terms and deletion checks apply to initial calls and committed replays", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      s = await f.snapshot(id),
      request = randomUUID();
    await f.manage(id, "edit", s.version, input(f), request);
    await f.actor(f.a, randomUUID());
    await assert.rejects(f.snapshot(id), /Account access|Sign in/);
    await assert.rejects(
      f.manage(id, "edit", s.version, input(f), request),
      /Account access|Sign in/,
    );
    await f.actor();
    await f.owner();
    await f.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [
      f.a,
    ]);
    await f.actor();
    await assert.rejects(f.snapshot(id), /Account access|Sign in/);
    await f.owner();
    await f.db.query("update auth.users set banned_until=null where id=$1", [f.a]);
    await f.db.query("update shopping_accounts set terms_version='old' where user_id=$1", [f.a]);
    await f.actor();
    await assert.rejects(
      f.manage(id, "edit", s.version, input(f), request),
      /Accept current terms/,
    );
    await f.owner();
    await f.db.query("update shopping_accounts set terms_version='2026-11-12' where user_id=$1", [
      f.a,
    ]);
    await f.db.query("select public.mobile_request_deletion($1)", [f.a]);
    await f.actor();
    await assert.rejects(f.snapshot(id), /Account access|Sign in/);
    await assert.rejects(
      f.manage(id, "edit", s.version, input(f), request),
      /Account access|Sign in/,
    );
    await f.owner();
    assert.equal(
      (await f.db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("private helpers and receipts are denied to guests and members while boundary coverage remains complete", async () => {
  const f = await listingManagementDatabase();
  try {
    for (const role of ["anon", "authenticated"]) {
      await f.owner();
      await f.db.exec("set role " + role);
      for (const sql of [
        "select public.mobile_listing_snapshot_internal(gen_random_uuid(),gen_random_uuid())",
        "select public.mobile_lock_listing_actor()",
        "select public.mobile_listing_scope_allowed('general','Item','Description')",
        "select public.mobile_listing_management_capabilities()",
        "select * from public.mobile_message_receipts",
      ])
        await assert.rejects(f.db.query(sql), /permission denied/);
    }
    await f.owner();
    await f.db.exec("set role anon");
    await assert.rejects(
      f.db.query("select public.mobile_listing_editor_snapshot($1)", [randomUUID()]),
      /permission denied/,
    );
    await f.owner();
    assert.deepEqual(
      (await f.db.query("select public.account_access_coverage() result")).rows[0].result,
      { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 },
    );
    await f.db.exec("set role service_role");
    assert.deepEqual(
      (await f.db.query("select public.mobile_listing_management_capabilities() result")).rows[0]
        .result,
      { version: 1, management: true },
    );
  } finally {
    await f.db.close();
  }
});
test("view counters do not invalidate drafts, while public text/media changes and oversized snapshots do", async () => {
  const f = await listingManagementDatabase();
  try {
    const id = await f.seed(),
      s = await f.snapshot(id);
    await f.owner();
    await f.db.query("update asks set views=views+1 where id=$1", [id]);
    await f.actor();
    assert.equal((await f.snapshot(id)).version, s.version);
    await f.owner();
    await f.db.query(
      "update products set description='Changed independently on the website.' where id=(select product_id from asks where id=$1)",
      [id],
    );
    await f.actor();
    await assert.rejects(f.manage(id, "edit", s.version, input(f)), /Listing changed/);
    const changed = await f.snapshot(id);
    await f.owner();
    await f.db.query("insert into listing_media(ask_id,storage_path,position) values($1,$2,1)", [
      id,
      f.a + "/another.jpg",
    ]);
    await f.actor();
    await assert.rejects(f.manage(id, "edit", changed.version, input(f)), /Listing changed/);
    await f.owner();
    await f.db.query(
      "insert into listing_media(ask_id,storage_path,position) select $1,$2||'/'||n||'.jpg',n from generate_series(2,33)n",
      [id, f.a],
    );
    await f.actor();
    await assert.rejects(f.snapshot(id), /Listing media unavailable/);
  } finally {
    await f.db.close();
  }
});
