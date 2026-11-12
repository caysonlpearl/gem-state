import test from "node:test";
import assert from "node:assert/strict";
import { validateEmployerClaimInput } from "../src/lib/employer-claims-contract.ts";

const base = {
  employerName: "Sawyer Pest Control",
  city: "Boise",
  state: "ID",
  role: "Owner",
  contact: "(208) 345-7378",
  note: "",
};

test("a complete employer claim validates and normalizes the employer key", () => {
  const out = validateEmployerClaimInput(base);
  assert.equal(out.employerKey, "sawyer pest control");
  assert.equal(out.employerName, "Sawyer Pest Control");
  assert.equal(out.city, "Boise");
  assert.equal(out.state, "ID");
  assert.equal(out.note, null);
});

test("legal suffixes and punctuation still resolve to the same employer", () => {
  const out = validateEmployerClaimInput({ ...base, employerName: "The Sawyer Pest Control, LLC" });
  assert.equal(out.employerKey, "sawyer pest control");
});

test("placeholder or missing employer names cannot be claimed", () => {
  assert.throws(() => validateEmployerClaimInput({ ...base, employerName: "" }), /can't be claimed/);
  assert.throws(() => validateEmployerClaimInput({ ...base, employerName: " Confidential " }), /can't be claimed/);
  assert.throws(() => validateEmployerClaimInput({ ...base, employerName: "xy" }), /can't be claimed/);
});

test("role and contact are required within the same bounds as service claims", () => {
  assert.throws(() => validateEmployerClaimInput({ ...base, role: "x" }), /role/);
  assert.throws(() => validateEmployerClaimInput({ ...base, role: "x".repeat(81) }), /role/);
  assert.throws(() => validateEmployerClaimInput({ ...base, contact: "ab" }), /phone or email/);
  assert.throws(() => validateEmployerClaimInput({ ...base, contact: "x".repeat(201) }), /phone or email/);
});

test("notes are optional but capped at 1,000 characters", () => {
  assert.equal(validateEmployerClaimInput({ ...base, note: "  " }).note, null);
  assert.throws(() => validateEmployerClaimInput({ ...base, note: "x".repeat(1001) }), /1,000/);
});
