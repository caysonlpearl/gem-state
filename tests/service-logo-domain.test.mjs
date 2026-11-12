import test from "node:test";
import assert from "node:assert/strict";
import { logoDomainFor } from "../src/lib/service-logo-domain.ts";

test("own website beats a parent-company enrichment", () => {
  assert.equal(logoDomainFor("Sawyer Pest Control", "http://www.sawyerpest.com", "https://www.orkin.com/x"), "sawyerpest.com");
});
test("enrichment used when no own website", () => {
  assert.equal(logoDomainFor("Acme Roofing", null, "https://acmeroofing.com"), "acmeroofing.com");
});
test("parked own site falls back only to a name-matching enrichment", () => {
  assert.equal(logoDomainFor("Dave's Drain Service", "http://hugedomains.com/x", "https://davesdrainservice.com"), "davesdrainservice.com");
  assert.equal(logoDomainFor("Dave's Drain Service", "http://hugedomains.com/x", "https://orkin.com"), null);
});
