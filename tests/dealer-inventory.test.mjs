import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateInventoryDiff,
  normalizeInventoryFilename,
  parseAndNormalizeInventoryJson,
  parseAndNormalizeInventoryCsv,
  parseAndNormalizeInventoryXml,
  inventorySnapshotRejection,
  recordsForDatabase,
} from "../src/lib/dealer-inventory.ts";
import {
  dealerInventoryFeedV1,
  dealerInventoryFeedV2,
  dealerInventoryEmptyFeed,
  dealerInventoryFeedWithErrors,
} from "../scripts/dealer-inventory-fixture.mjs";
import {
  dealerInventoryFeedJsonV1 as sampleJson,
  dealerInventoryFeedXmlV1 as sampleXml,
} from "../src/config/dealer-inventory-sample.ts";
import { scheduleIntervalMinutes, scheduleIsDue } from "../src/lib/dealer-inventory-schedule.ts";

test("parses and normalizes a dealership CSV feed", () => {
  const result = parseAndNormalizeInventoryCsv(dealerInventoryFeedV1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 4);
  assert.equal(result.records[0].priceCents, 3699500);
  assert.equal(result.records[0].vin, "1HGCM82633A004352");
  assert.equal(result.records[0].media.length, 2);
  assert.equal(result.records[3].inventoryStatus, "sold");
});

test("parses JSON and XML feeds through the same normalized model", () => {
  const json = parseAndNormalizeInventoryJson(sampleJson);
  const xml = parseAndNormalizeInventoryXml(sampleXml);

  assert.equal(json.errors.length, 0);
  assert.equal(xml.errors.length, 0);
  assert.equal(json.records[0].sourceRecordKey, "GS-1001");
  assert.equal(xml.records[0].sourceRecordKey, "GS-1001");
  assert.equal(json.records[0].media.length, 2);
  assert.equal(xml.records[0].media.length, 2);
});

test("normalizes updates without changing the source record identity", () => {
  const first = parseAndNormalizeInventoryCsv(dealerInventoryFeedV1).records;
  const second = parseAndNormalizeInventoryCsv(dealerInventoryFeedV2).records;
  const diff = calculateInventoryDiff(
    second,
    first.map((record) => ({
      sourceRecordKey: record.sourceRecordKey,
      vin: record.vin,
      contentHash: record.contentHash,
      inventoryStatus: record.inventoryStatus,
    })),
  );

  assert.deepEqual(diff, { created: 1, updated: 1, unchanged: 1, stale: 1 });
  assert.equal(second[0].sourceRecordKey, "GS-1001");
  assert.equal(second[0].priceCents, 3599500);
});

test("falls back to VIN identity when a dealer changes the stock number", () => {
  const original = parseAndNormalizeInventoryCsv(dealerInventoryFeedV1).records;
  const renamedFeed = dealerInventoryFeedV2.replace(
    "GS-1001,1HGCM82633A004352",
    "GS-NEW-1001,1HGCM82633A004352",
  );
  const renamed = parseAndNormalizeInventoryCsv(renamedFeed).records;
  const diff = calculateInventoryDiff(
    renamed,
    original.map((record) => ({
      sourceRecordKey: record.sourceRecordKey,
      vin: record.vin,
      contentHash: record.contentHash,
      inventoryStatus: record.inventoryStatus,
    })),
  );

  assert.equal(diff.created, 1);
  assert.equal(diff.updated, 1);
  assert.equal(diff.stale, 1);
});

test("replaying the same feed is idempotent", () => {
  const records = parseAndNormalizeInventoryCsv(dealerInventoryFeedV1).records;
  const diff = calculateInventoryDiff(
    records,
    records.map((record) => ({
      sourceRecordKey: record.sourceRecordKey,
      vin: record.vin,
      contentHash: record.contentHash,
      inventoryStatus: record.inventoryStatus,
    })),
  );

  assert.deepEqual(diff, { created: 0, updated: 0, unchanged: 4, stale: 0 });
});

test("detects duplicate keys, invalid VINs, and missing prices", () => {
  const result = parseAndNormalizeInventoryCsv(dealerInventoryFeedWithErrors);
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.duplicateKeys, ["GS-2001"]);
  assert.ok(
    result.errors.some((error) => error.field === "vin" && error.message.includes("valid")),
  );
  assert.ok(
    result.errors.some((error) => error.field === "price" && error.message.includes("positive")),
  );
  assert.ok(
    result.errors.some((error) => error.field === "photos" && error.message.includes("invalid")),
  );
});

test("quarantines an empty or incomplete feed instead of producing records", () => {
  const result = parseAndNormalizeInventoryCsv(dealerInventoryEmptyFeed);
  assert.equal(result.records.length, 0);
  assert.ok(result.errors.length >= 5);
});

test("stale detection protects sold and removed inventory", () => {
  const incoming = parseAndNormalizeInventoryCsv(dealerInventoryFeedV2).records;
  const existing = [
    {
      sourceRecordKey: "GS-1001",
      vin: "1HGCM82633A004352",
      contentHash: "old",
      inventoryStatus: "active",
    },
    {
      sourceRecordKey: "GS-1004",
      vin: "5NMS3CAD2KH123456",
      contentHash: "sold",
      inventoryStatus: "sold",
    },
    {
      sourceRecordKey: "GS-1006",
      vin: "1FTFW1ET5MFA12347",
      contentHash: "removed",
      inventoryStatus: "removed",
    },
  ];
  const diff = calculateInventoryDiff(incoming, existing);
  assert.equal(diff.updated, 1);
  assert.equal(diff.stale, 0);
});

test("scheduled inventory sources only run when their interval is due", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(scheduleIntervalMinutes("every 15 minutes"), 15);
  assert.equal(scheduleIntervalMinutes("daily at 14:00"), 1440);
  assert.equal(scheduleIsDue("hourly", "2026-10-01T11:30:00.000Z", now), false);
  assert.equal(scheduleIsDue("hourly", "2026-10-01T10:30:00.000Z", now), true);
  assert.equal(scheduleIsDue("daily at 14:00", null, now), false);
  assert.equal(scheduleIsDue("daily at 10:00", null, now), true);
  assert.equal(scheduleIsDue("whenever", null, now), false);
});

test("sync-run filenames always match the source format", () => {
  assert.equal(
    normalizeInventoryFilename("dealership-inventory.csv", "json"),
    "dealership-inventory.json",
  );
  assert.equal(normalizeInventoryFilename("dealer-feed.XML", "csv"), "dealer-feed.csv");
  assert.equal(normalizeInventoryFilename("", "xml"), "dealership-inventory.xml");
  assert.equal(normalizeInventoryFilename(null, "json"), "dealership-inventory.json");
});

const motiveVehicle = (extra = "") => `<item><id>feed-1</id><dealerid>2592</dealerid>
  <stocknumber>S100</stocknumber><vin>4S4SLDD6XT3193892</vin><year>2026</year>
  <make>Subaru</make><model>Forester</model><trim>Premium</trim><price>35786</price>
  <city>Twin Falls</city><state>ID</state><zipcode>83301</zipcode><miles>5</miles>
  <image2>https://example.com/2.jpg</image2><image0>https://example.com/0.jpg</image0>
  <imageUrls>https://example.com/0.jpg, https://example.com/2.jpg</imageUrls>${extra}</item>`;
const motiveMapping = { __provider: "motive", __dealer_id: "2592" };

test("Motive maps dealer fields and orders/deduplicates numbered photos", () => {
  const result = parseAndNormalizeInventoryXml(
    `<inventory>${motiveVehicle("<description><![CDATA[Clean SUV <b>with AWD</b>]]></description>")}</inventory>`,
    motiveMapping,
  );
  assert.equal(inventorySnapshotRejection(result, 1), null);
  const vehicle = result.records[0];
  assert.equal(vehicle.sourceRecordKey, "feed-1");
  assert.equal(vehicle.stockNumber, "S100");
  assert.equal(vehicle.priceCents, 3578600);
  assert.equal(vehicle.postalCode, "83301");
  assert.equal(vehicle.vehicleMileage, 5);
  assert.equal(vehicle.description, "Clean SUV <b>with AWD</b>");
  assert.deepEqual(
    vehicle.media.map((image) => image.mediaUrl),
    ["https://example.com/0.jpg", "https://example.com/2.jpg"],
  );
});

test("Motive preserves unpriced availability without inventing a price", () => {
  const xml = `<inventory>${motiveVehicle().replace("<price>35786</price>", "<price>0</price>")}</inventory>`;
  const result = parseAndNormalizeInventoryXml(xml, motiveMapping);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].priceCents, null);
  assert.equal(result.records[0].inventoryStatus, "active");
  assert.equal(recordsForDatabase(result.records)[0].price_cents, null);
});

test("scheduled snapshots reject wrong dealers, truncation, unknown status and partial rows", () => {
  assert.throws(
    () =>
      parseAndNormalizeInventoryXml(`<inventory>${motiveVehicle()}</inventory>`, {
        ...motiveMapping,
        __dealer_id: "other",
      }),
    /dealership/,
  );
  assert.throws(
    () => parseAndNormalizeInventoryXml(`<inventory>${motiveVehicle()}`, motiveMapping),
    /incomplete/,
  );
  const result = parseAndNormalizeInventoryXml(
    `<inventory>${motiveVehicle()}${motiveVehicle("<status>mystery</status>").replace("<id>feed-1</id>", "<id>feed-2</id>").replace("4S4SLDD6XT3193892", "4S4SLDD6XT3193893")}</inventory>`,
    motiveMapping,
  );
  assert.equal(result.records.length, 1);
  assert.match(inventorySnapshotRejection(result, 1), /invalid row/);
  const valid = parseAndNormalizeInventoryXml(
    `<inventory>${motiveVehicle()}</inventory>`,
    motiveMapping,
  );
  assert.match(inventorySnapshotRejection(valid, 2), /at least 2/);
});
