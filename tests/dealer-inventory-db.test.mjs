import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseAndNormalizeInventoryCsv, recordsForDatabase } from "../src/lib/dealer-inventory.ts";
import { dealerInventoryFeedV1 } from "../scripts/dealer-inventory-fixture.mjs";

test("scheduled inventory leases, atomic snapshots and stable photo identities", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.asks(id uuid PRIMARY KEY);`);
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
    await db.exec("ALTER TABLE public.dealer_inventory_sources ADD COLUMN dealer_id uuid;");
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261110180000_automated_dealer_inventory.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const owner = "10000000-0000-0000-0000-000000000001";
    await db.query("INSERT INTO auth.users VALUES ($1)", [owner]);
    const source = (
      await db.query(
        "INSERT INTO dealer_inventory_sources(owner_user_id,name) VALUES ($1,'Feed test') RETURNING id",
        [owner],
      )
    ).rows[0].id;
    const claim = async (last = null) =>
      (await db.query("SELECT claim_dealer_inventory_source($1,$2) AS token", [source, last]))
        .rows[0].token;
    const token = await claim();
    assert.ok(token);
    assert.equal(await claim(), null, "a concurrent scheduled runner cannot claim the same source");
    await db.query("SELECT release_dealer_inventory_source($1,$2)", [source, owner]);
    assert.equal(await claim(), null, "a different runner cannot release this lease");
    await db.query("SELECT release_dealer_inventory_source($1,$2)", [source, token]);
    await db.query("UPDATE dealer_inventory_sources SET status='error' WHERE id=$1", [source]);
    assert.ok(await claim(), "failed feeds remain retryable");
    await db.query(
      "UPDATE dealer_inventory_sources SET sync_lease_until=now()-interval '1 second' WHERE id=$1",
      [source],
    );
    assert.ok(await claim(), "abandoned leases expire");
    await db.query(
      "UPDATE dealer_inventory_sources SET last_success_at='2026-11-10T12:00:00Z',sync_lease_until=NULL WHERE id=$1",
      [source],
    );
    assert.equal(
      await claim(),
      null,
      "a stale schedule read cannot claim a source completed by another runner",
    );
    await db.query("UPDATE dealer_inventory_sources SET status='paused' WHERE id=$1", [source]);
    assert.equal(await claim("2026-11-10T12:00:00Z"), null);
    await db.query("UPDATE dealer_inventory_sources SET status='active' WHERE id=$1", [source]);
    const records = recordsForDatabase(
      parseAndNormalizeInventoryCsv(dealerInventoryFeedV1).records,
    );
    const apply = async (items) => {
      const run = (
        await db.query(
          "INSERT INTO dealer_inventory_sync_runs(source_id,mode) VALUES ($1,'apply') RETURNING id",
          [source],
        )
      ).rows[0].id;
      return (
        await db.query("SELECT reconcile_dealer_inventory_records($1,$2,$3::jsonb) AS summary", [
          source,
          run,
          JSON.stringify(items),
        ])
      ).rows[0].summary;
    };
    assert.equal((await apply(records)).createdCount, 4);
    const photos = (await db.query("SELECT id,media_url FROM dealer_inventory_media ORDER BY id"))
      .rows;
    assert.equal((await apply(records)).unchangedCount, 4);
    assert.deepEqual(
      (await db.query("SELECT id,media_url FROM dealer_inventory_media ORDER BY id")).rows,
      photos,
      "replay preserves photo IDs",
    );
    const changed = structuredClone(records);
    changed[0].price_cents -= 10000;
    changed[0].content_hash = "price-change";
    await apply(changed);
    assert.deepEqual(
      (await db.query("SELECT id,media_url FROM dealer_inventory_media ORDER BY id")).rows,
      photos,
      "price changes do not rewrite photos",
    );
    await db.query("UPDATE dealer_inventory_sources SET minimum_row_count=4 WHERE id=$1", [source]);
    await assert.rejects(apply(changed.slice(0, 1)), /below the configured minimum/);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM dealer_inventory_records WHERE missed_run_count>0",
        )
      ).rows[0].count,
      0,
      "rejected snapshots leave existing records untouched",
    );
    await db.query("UPDATE dealer_inventory_sources SET minimum_row_count=1 WHERE id=$1", [source]);
    await apply(changed.slice(1));
    assert.equal(
      (
        await db.query(
          "SELECT missed_run_count FROM dealer_inventory_records WHERE source_record_key=$1",
          [changed[0].source_record_key],
        )
      ).rows[0].missed_run_count,
      1,
    );
    await apply(changed);
    assert.equal(
      (
        await db.query(
          "SELECT missed_run_count FROM dealer_inventory_records WHERE source_record_key=$1",
          [changed[0].source_record_key],
        )
      ).rows[0].missed_run_count,
      0,
    );
  } finally {
    await db.close();
  }
});
