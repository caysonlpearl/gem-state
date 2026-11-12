import test from "node:test";
import assert from "node:assert/strict";
import { loanPaymentCents } from "../src/lib/loan-payment.ts";

test("payment estimates use entered percentage APR, term, and financed balance", () => {
  assert.equal(loanPaymentCents(2652700, 60, 7.5), 53155);
  assert.equal(loanPaymentCents(2652700, 60, 0), 44212);
  assert.equal(loanPaymentCents(2652700, 60, 5), 50060);
  assert.ok(loanPaymentCents(2652700, 72, 7.5) < 53155);
  assert.ok(loanPaymentCents(2152700, 60, 7.5) < 53155);
  assert.equal(loanPaymentCents(0, 60, 7.5), 0);
  assert.ok(Number.isFinite(loanPaymentCents(2652700, 60, 0.000001)));
});
test("invalid APR never becomes a misleading interest-free estimate", () => {
  for (const apr of [NaN, Infinity, -1, 101])
    assert.equal(loanPaymentCents(2652700, 60, apr), null);
  assert.equal(loanPaymentCents(-1, 60, 7.5), null);
  assert.equal(loanPaymentCents(2652700, 0, 7.5), null);
});
