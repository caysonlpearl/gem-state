import test from "node:test";
import assert from "node:assert/strict";
import { reviewEmailEligible } from "../src/lib/review-email-eligibility.ts";
const order = {
  buyer_id: "buyer",
  status: "completed",
  is_demo: false,
  stripe_checkout_session_id: "cs_live_example",
};
test("completed live buyer gets one review request", () => {
  assert.equal(reviewEmailEligible(order, "buyer", false), true);
  assert.equal(reviewEmailEligible(order, "buyer", true), false);
});
test("sandbox, demo, incomplete and nonbuyer requests are excluded", () => {
  assert.equal(
    reviewEmailEligible(
      { ...order, stripe_checkout_session_id: "cs_test_example" },
      "buyer",
      false,
    ),
    false,
  );
  assert.equal(reviewEmailEligible({ ...order, is_demo: true }, "buyer", false), false);
  assert.equal(reviewEmailEligible({ ...order, status: "shipped" }, "buyer", false), false);
  assert.equal(reviewEmailEligible(order, "seller", false), false);
});
