import assert from "node:assert/strict";

import {
  calculateInventoryDiff,
  parseAndNormalizeInventoryCsv,
} from "../src/lib/dealer-inventory.ts";
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

console.log(
  JSON.stringify(
    {
      firstRun: { valid: firstRun.records.length, invalid: firstRun.errors.length },
      secondRun: secondDiff,
      safety: "missing inventory is stale; sold inventory remains source history",
      publicListings: "not linked until moderation",
    },
    null,
    2,
  ),
);
