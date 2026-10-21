import test from "node:test";
import assert from "node:assert/strict";
import { sellerListingState } from "../src/lib/seller-listing-state.ts";
import { searchOutcomeSummary } from "../src/lib/search-outcome-summary.ts";

test("missing approval alone cannot put removed, sold, expired or rejected items in the review queue", () => {
  for (const [item, label] of [
    [{ status: "cancelled", approvedAt: null }, "Removed"],
    [{ status: "cancelled", approvedAt: null, soldAt: "2026-10-20" }, "Sold"],
    [{ status: "matched", approvedAt: null }, "Sold"],
    [{ status: "expired", approvedAt: null }, "Expired"],
    [{ status: "active", approvedAt: null, productStatus: "rejected" }, "Needs changes"],
    [{ status: "cancelled", approvedAt: null, productStatus: "rejected" }, "Needs changes"],
  ])
    assert.deepEqual(sellerListingState(item), { group: "inactive", label });
});

test("active and pending listings remain distinct for totals, filters and card labels", () => {
  assert.deepEqual(sellerListingState({ status: "active", approvedAt: "2026-10-20" }), {
    group: "active",
    label: "Active",
  });
  for (const status of ["active", "pending_review"]) {
    assert.deepEqual(sellerListingState({ status, approvedAt: null }), {
      group: "pending",
      label: "Awaiting approval",
    });
  }
  assert.equal(sellerListingState({ status: "draft", approvedAt: null }).group, "inactive");
});

test("empty-search rate includes both mutually exclusive outcomes in its denominator", () => {
  assert.deepEqual(searchOutcomeSummary(7, 11), { total: 18, emptyRate: "61.1% (11 of 18)" });
  assert.deepEqual(searchOutcomeSummary(0, 11), { total: 11, emptyRate: "100% (11 of 11)" });
  assert.deepEqual(searchOutcomeSummary(7, 0), { total: 7, emptyRate: "0% (0 of 7)" });
  assert.deepEqual(searchOutcomeSummary(0, 0), { total: 0, emptyRate: null });
  assert.deepEqual(searchOutcomeSummary(NaN, -1), { total: 0, emptyRate: null });
});
