import test from "node:test";
import assert from "node:assert/strict";
import { employerKey, pickLogoDomain, logoImageUrl } from "../src/lib/employer-logo-match.ts";

test("employer names compare without case, punctuation, The, or legal suffixes", () => {
  assert.equal(employerKey("The Home Depot, Inc."), "home depot");
  assert.equal(employerKey("St. Luke's Health System"), "st lukes health system");
  assert.equal(employerKey("Barnes & Noble LLC"), "barnes and noble");
  assert.equal(employerKey("Café Rio"), "cafe rio");
});

test("only the same company name gets a logo", () => {
  const results = [
    { name: "Home Depot Supply", domain: "hdsupply.com" },
    { name: "The Home Depot", domain: "homedepot.com" },
  ];
  assert.equal(pickLogoDomain("Home Depot Inc", results), "homedepot.com");
  assert.equal(
    pickLogoDomain("Bob's Plumbing", [{ name: "Bob's Discount Furniture", domain: "mybobs.com" }]),
    null,
  );
  assert.equal(
    pickLogoDomain("Confidential", [{ name: "Confidential", domain: "confidential.com" }]),
    null,
  );
  assert.equal(pickLogoDomain("Acme", [{ name: "Acme", domain: "javascript:alert(1)" }]), null);
  assert.equal(pickLogoDomain("Acme", [{ name: 5, domain: "acme.com" }]), null);
});

test("logo URLs ask for a 404 so the initials tile can take over", () => {
  const url = new URL(logoImageUrl("homedepot.com", "pk_test"));
  assert.equal(url.origin + url.pathname, "https://img.logo.dev/homedepot.com");
  assert.equal(url.searchParams.get("fallback"), "404");
  assert.equal(url.searchParams.get("token"), "pk_test");
});
