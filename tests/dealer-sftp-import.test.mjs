import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, utimes, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { parseAndNormalizeInventoryCsv, recordsForDatabase } from "../src/lib/dealer-inventory.ts";
import {
  readStableSftpFile,
  importSftpSource,
  inventoryDatabase,
} from "../infra/inventory/sftp-import.mjs";

const mapping = { __provider: "overfuel", __dealer_id: "fixture-dealer" };
const row = {
  "Dealer ID": "fixture-dealer",
  "Stock Number": "S1",
  VIN: "1HGCM82633A004352",
  Year: "2003",
  Make: "Honda",
  Model: "Accord",
  Trim: "EX",
  Mileage: "100000",
  Price: "10000",
  MSRP: "12000",
  Cost: "5555",
  "Dealer City": "Boise",
  "Dealer State": "ID",
  "Dealer Zip": "83713",
  Condition: "Pre-owned",
  Certified: "No",
  Description: "A quoted, multiline\nvehicle description",
  Photos: "https://images.example/1.jpg|https://images.example/2.jpg",
  "VDP Url": "https://dealer.example/inventory/car",
};
const csv = (rows) =>
  [Object.keys(row), ...rows.map((r) => Object.keys(row).map((k) => r[k] ?? ""))]
    .map((values) => values.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","))
    .join("\r\n");
const parse = (rows) => parseAndNormalizeInventoryCsv(csv(rows), mapping);

test("Overfuel maps the standard file, preserves unpriced vehicles, and discards dealer cost", () => {
  const result = parse([
    row,
    { ...row, "Stock Number": "S2", VIN: "1HGCM82633A004353", Price: "0" },
  ]);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records[0].sourceRecordKey, "S1");
  assert.equal(result.records[0].priceCents, 1000000);
  assert.equal(result.records[0].rawRecord.condition, "used");
  assert.equal(result.records[0].rawRecord.msrp, "12000");
  assert.equal(result.records[0].media.length, 2);
  assert.equal(result.records[1].inventoryStatus, "active");
  assert.equal(result.records[1].priceCents, null);
  assert.ok(result.records.every((r) => !("Cost" in r.rawRecord)));
  assert.ok(result.rows.every((r) => !("Cost" in r)));
  assert.equal(result.records[0].description, row.Description);
});
test("Overfuel rejects wrong/mixed dealer files and keeps modern VIN validation", () => {
  assert.throws(() => parse([{ ...row, "Dealer ID": "other" }]), /configured dealership/);
  assert.throws(() => parse([row, { ...row, "Dealer ID": "other" }]), /configured dealership/);
  const classic = parse([{ ...row, Year: "1960", VIN: "CLASSIC123" }]);
  assert.equal(classic.records.length, 1);
  assert.equal(classic.records[0].vin, null);
  assert.equal(classic.records[0].rawRecord.legacy_vin, "CLASSIC123");
  assert.ok(parse([{ ...row, VIN: "CLASSIC123" }]).errors.some((e) => e.field === "vin"));
});
test("SFTP waits for stable uploads, rejects symlinks and old files, and deduplicates deliveries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bluebird-sftp-test-"));
  try {
    const path = join(directory, "inventory.csv"),
      now = Date.now();
    await writeFile(path, csv([row]));
    assert.equal(await readStableSftpFile(path, now), null);
    await utimes(path, new Date(now - 180000), new Date(now - 180000));
    assert.ok(await readStableSftpFile(path, now));
    const link = join(directory, "linked.csv");
    await symlink(path, link);
    await assert.rejects(readStableSftpFile(link, now));
    const sourceId = "10000000-0000-4000-8000-000000000001",
      delivered = new Set(),
      applied = [];
    const database = async (endpoint, body) => {
      if (endpoint.startsWith("dealer_inventory_sources?"))
        return [
          {
            id: sourceId,
            source_type: "sftp",
            file_format: "csv",
            status: "active",
            mapping_profile: mapping,
            minimum_row_count: 1,
          },
        ];
      if (endpoint.startsWith("dealer_inventory_sync_runs?"))
        return [...delivered].some((id) => endpoint.includes(id)) ? [{ id: "prior" }] : [];
      assert.equal(endpoint, "rpc/apply_sftp_inventory_delivery");
      assert.ok(!JSON.stringify(body).includes('"Cost"'));
      applied.push(body);
      delivered.add(body._delivery_id);
      return { status: "completed", runId: "run" };
    };
    assert.equal(
      (await importSftpSource({ sourceId, path }, { database, now })).status,
      "completed",
    );
    assert.equal(
      (await importSftpSource({ sourceId, path }, { database, now })).reason,
      "already_imported",
    );
    assert.equal(applied.length, 1);
    await utimes(path, new Date(now - 170000), new Date(now - 170000));
    assert.equal(
      (await importSftpSource({ sourceId, path }, { database, now })).status,
      "completed",
    );
    assert.notEqual(
      applied[0]._delivery_id,
      applied[1]._delivery_id,
      "a new transfer refreshes identical inventory",
    );
    await assert.rejects(readStableSftpFile(path, now + 73 * 3600000), /expired/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("SFTP database credentials cannot follow an HTTP redirect", async () => {
  let calls = 0;
  const db = inventoryDatabase(
    { url: "https://fixture.supabase.co", serviceKey: "fixture-only" },
    async (url, init) => {
      calls++;
      assert.equal(init.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: "https://other.example" } });
    },
  );
  await assert.rejects(db("rpc/test", {}), /database_http_302/);
  assert.equal(calls, 1);
});

test("SFTP reconciliation atomically checkpoints deliveries and never counts a replay as another missing snapshot", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE asks(id uuid PRIMARY KEY);",
    );
    const migration = async (name) =>
      readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
    const foundation = await migration("20260919120000_add_dealer_inventory_foundation.sql");
    await db.exec(
      foundation.slice(0, foundation.indexOf("ALTER TABLE public.dealer_inventory_sources ENABLE")),
    );
    await db.exec("ALTER TABLE dealer_inventory_sources ADD COLUMN dealer_id uuid;");
    await db.exec(await migration("20261110180000_automated_dealer_inventory.sql"));
    await db.exec(await migration("20261111210000_sftp_inventory_delivery.sql"));
    const owner = "10000000-0000-4000-8000-000000000001";
    await db.query("INSERT INTO auth.users VALUES ($1)", [owner]);
    const source = (
      await db.query(
        "INSERT INTO dealer_inventory_sources(owner_user_id,name,source_type) VALUES ($1,'SFTP fixture','sftp') RETURNING id",
        [owner],
      )
    ).rows[0].id;
    const records = recordsForDatabase(
      parse([row, { ...row, "Stock Number": "S2", VIN: "1HGCM82633A004353" }]).records,
    );
    const apply = async (delivery, items, received = new Date()) =>
      (
        await db.query("SELECT apply_sftp_inventory_delivery($1,$2,$3,$4,$5::jsonb) AS result", [
          source,
          delivery.repeat(64),
          "inventory.csv",
          received.toISOString(),
          JSON.stringify(items),
        ])
      ).rows[0].result;
    assert.equal((await apply("a", records)).createdCount, 2);
    const photoIds = (await db.query("SELECT id FROM dealer_inventory_media ORDER BY id")).rows;
    assert.equal((await apply("b", records.slice(0, 1))).status, "completed");
    const missed = async () =>
      (
        await db.query(
          "SELECT missed_run_count FROM dealer_inventory_records WHERE stock_number='S2'",
        )
      ).rows[0].missed_run_count;
    assert.equal(await missed(), 1);
    assert.equal((await apply("b", records.slice(0, 1))).reason, "already_imported");
    assert.equal(await missed(), 1);
    const bad = structuredClone(records);
    bad[1].vin = "bad-vin";
    await assert.rejects(apply("c", bad));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS n FROM dealer_inventory_sync_runs WHERE source_checksum=$1",
          ["sftp-v1:" + "c".repeat(64)],
        )
      ).rows[0].n,
      0,
      "failed snapshot and checkpoint roll back together",
    );
    assert.equal(await missed(), 1);
    assert.equal((await apply("d", records.slice(0, 1))).status, "completed");
    assert.equal(await missed(), 2);
    assert.deepEqual(
      (await db.query("SELECT id FROM dealer_inventory_media ORDER BY id")).rows,
      photoIds,
    );
    await assert.rejects(apply("e", records, new Date(Date.now() - 73 * 3600000)), /expired/);
    await db.query("UPDATE dealer_inventory_sources SET status='paused' WHERE id=$1", [source]);
    assert.equal((await apply("f", records)).reason, "source_paused");
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege('anon','apply_sftp_inventory_delivery(uuid,text,text,timestamptz,jsonb)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
