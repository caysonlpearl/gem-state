import assert from "node:assert/strict";

import {
  calculateInventoryDiff,
  parseAndNormalizeInventoryCsv,
  parseAndNormalizeInventoryJson,
  parseAndNormalizeInventoryXml,
} from "../src/lib/dealer-inventory.ts";
import {
  dealerInventoryFeedJsonV1,
  dealerInventoryFeedXmlV1,
} from "../src/config/dealer-inventory-sample.ts";
import { dealerInventoryFeedV1, dealerInventoryFeedV2 } from "./dealer-inventory-fixture.mjs";

const firstRun = parseAndNormalizeInventoryCsv(dealerInventoryFeedV1);
assert.equal(firstRun.errors.length, 0);
assert.equal(firstRun.records.length, 4);

const secondRun = parseAndNormalizeInventoryCsv(dealerInventoryFeedV2);
const secondDiff = calculateInventoryDiff(
  secondRun.records,
  firstRun.records.map((record) => ({
    sourceRecordKey: record.sourceRecordKey,
    vin: record.vin,
    contentHash: record.contentHash,
    inventoryStatus: record.inventoryStatus,
  })),
);

assert.deepEqual(secondDiff, { created: 1, updated: 1, unchanged: 1, stale: 1 });
assert.equal(
  secondRun.records.find((record) => record.sourceRecordKey === "GS-1005")?.inventoryStatus,
  "pending",
);

const jsonRun = parseAndNormalizeInventoryJson(dealerInventoryFeedJsonV1);
const xmlRun = parseAndNormalizeInventoryXml(dealerInventoryFeedXmlV1);
assert.equal(jsonRun.errors.length, 0);
assert.equal(xmlRun.errors.length, 0);
assert.equal(jsonRun.records[0]?.sourceRecordKey, xmlRun.records[0]?.sourceRecordKey);
assert.equal(jsonRun.records[0]?.media.length, 2);
assert.equal(xmlRun.records[0]?.media.length, 2);

console.log(
  JSON.stringify(
    {
      firstRun: { valid: firstRun.records.length, invalid: firstRun.errors.length },
      secondRun: secondDiff,
      formats: {
        csv: firstRun.records.length,
        json: jsonRun.records.length,
        xml: xmlRun.records.length,
      },
      safety: "missing inventory is stale; sold inventory remains source history",
      publicListings: "not linked until moderation",
    },
    null,
    2,
  ),
);
