import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateInventoryDiff,
  parseAndNormalizeInventoryJson,
  parseAndNormalizeInventoryCsv,
  parseAndNormalizeInventoryXml,
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
