import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdzunaResult, adzunaSearchSchema } from "../src/lib/adzuna-contract.ts";
const job = {
  id: "123",
  title: "<b>Driver</b>",
  description: "<script>bad</script>Text",
  company: { display_name: "Example" },
  created: "2026-10-15T12:00:00Z",
  location: { display_name: "Boise, Ada County", area: ["US", "Idaho", "Ada County", "Boise"] },
  redirect_url: "https://www.adzuna.com/details/123",
};
test("normalizes actual provider fields, removes markup and deduplicates", () => {
  const r = normalizeAdzunaResult({ count: 2, results: [job, job] });
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0].title, "Driver");
  assert.ok(!r.jobs[0].description.includes("<"));
});
test("rejects unsafe or non-Adzuna links", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://adzuna.com.evil.test/a",
    "https://evil.test/",
    "https://user:password@adzuna.com/a",
  ]) {
    assert.equal(
      normalizeAdzunaResult({ results: [{ ...job, redirect_url: url }] }).jobs.length,
      0,
    );
  }
});
test("validates search bounds before contacting provider", () => {
  assert.throws(() => adzunaSearchSchema.parse({ page: 6 }));
  assert.throws(() => adzunaSearchSchema.parse({ what: "x".repeat(121) }));
  assert.throws(() => adzunaSearchSchema.parse({ where: "" }));
  assert.deepEqual(adzunaSearchSchema.parse({}), { what: "", where: "Idaho", page: 1 });
});
test("malformed upstream data is not a successful empty search", () => {
  assert.throws(() => normalizeAdzunaResult({ error: "unauthorized" }));
  assert.equal(normalizeAdzunaResult({ results: [] }).total, 0);
});

test("uses city and state, never the county as the state or city", () => {
  const normalized = normalizeAdzunaResult({ results: [job] }).jobs[0];
  assert.equal(normalized.location, "Boise, ID");
  assert.equal(normalized.employmentType, "Not specified");
  const other = normalizeAdzunaResult({
    results: [
      {
        ...job,
        location: {
          area: ["US", "Washington", "King County", "Seattle"],
          display_name: "Seattle, King County",
        },
      },
    ],
  }).jobs[0];
  assert.equal(other.location, "Seattle, WA");
  assert.equal(
    normalizeAdzunaResult({
      results: [
        {
          ...job,
          location: { area: ["US", "Idaho", "Ada County"], display_name: "Ada County, Idaho" },
        },
      ],
    }).jobs.length,
    0,
  );
});
test("requires actual dates and cities instead of fabricated values", () => {
  assert.equal(normalizeAdzunaResult({ results: [{ ...job, created: undefined }] }).jobs.length, 0);
  assert.equal(
    normalizeAdzunaResult({ results: [{ ...job, location: { display_name: "Unknown" } }] }).jobs
      .length,
    0,
  );
});

import { canIncludeAdzuna } from "../src/lib/adzuna-listings.server.ts";
test("external inventory participates in jobs and general browse but never owner storefronts or unsupported filters", () => {
  assert.equal(canIncludeAdzuna({ category: "jobs" }), true);
  assert.equal(canIncludeAdzuna({ q: "nurse" }), true);
  for (const scope of [
    { sellerSlug: "owner" },
    { dealerSlug: "dealer" },
    { category: "pets" },
    { group: "motors" },
    { hasPhotos: true },
    { jobPayMin: 0 },
    { jobExperience: "5 years" },
  ]) {
    assert.equal(canIncludeAdzuna({ category: "jobs", ...scope }), false);
  }
});
