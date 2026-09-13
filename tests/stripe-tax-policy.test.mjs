import test from "node:test";
import assert from "node:assert/strict";
import { automaticTaxForStripeKey } from "../src/lib/stripe-tax-policy.ts";

test("live standard and restricted keys enable automatic tax", () => {
  for (const key of ["sk_live_fixture", "rk_live_fixture", " sk_live_fixture "]) {
    assert.equal(automaticTaxForStripeKey(key), true);
  }
});

test("sandbox standard and restricted keys remain tax-free", () => {
  for (const key of ["sk_test_fixture", "rk_test_fixture", " rk_test_fixture "]) {
    assert.equal(automaticTaxForStripeKey(key), false);
  }
});

test("missing or unknown keys do not silently select live tax", () => {
  for (const key of ["", "unknown", "pk_live_fixture"]) {
    assert.throws(() => automaticTaxForStripeKey(key), /not configured correctly/);
  }
});
