import test from "node:test";
import assert from "node:assert/strict";
import { selectLandingCoverage, landingPreviewInputs } from "../src/lib/landing-coverage.ts";
import { landingCards } from "../src/lib/landing-card-pool.ts";
import { homepageCard } from "../src/lib/homepage-snapshot-contract.ts";
const card = (id, extra = {}) => ({ id, title: id, city: "Boise", state: "ID", priceCents: 1000000,
  categorySlug: "cars-trucks", createdAt: "2026-10-31T00:00:00Z", isFeatured: false, vehicle: null, ...extra });

test("an older matching subtype and the true lowest prices survive a busy feed before global trimming", () => {
  const busy = Array.from({length: 250}, (_, n) => card(`new-${n}`, {vehicle: {bodyStyle: "SUV", year: 2026}, priceCents: 4000000+n}));
  const old = card("older-hybrid", {createdAt: "2026-01-01T00:00:00Z", vehicle: {bodyStyle: "Sedan", fuelType: "Hybrid", year: 1990}, priceCents: 100000});
  const pool = selectLandingCoverage([...busy, old], 120);
  assert.equal(landingCards(pool, {group: "motors", fuelType: "Hybrid"})[0].id, old.id);
  assert.equal(landingCards(pool, {group: "motors", sort: "price_low"})[0].id, old.id);
  assert.equal(landingCards(pool, {group: "motors", yearMax: 1995})[0].id, old.id);
});

test("every existing row with saved matches retains up to twelve even beyond the old source cap", () => {
  const busy = Array.from({length: 250}, (_, n) => card(`busy-${n}`, {categorySlug: "jobs", job: {category: "Retail"}}));
  const older = card("older-care-role", {categorySlug: "jobs", job: {category: "Healthcare", employmentType: "Part-time"}});
  const homes = card("older-condo", {categorySlug: "other-real-estate", home: {mode: "buy", propertyType: "Condo"}});
  const all = [...busy, older, homes];
  const selected = selectLandingCoverage(all, 120);
  for (const input of landingPreviewInputs) {
    const expected = landingCards(all, input).slice(0,12).map(c => c.id);
    const actual = new Set(landingCards(selected, input).map(c => c.id));
    for (const id of expected) assert.ok(actual.has(id), `${JSON.stringify(input)} lost ${id}`);
  }
  assert.ok(selected.some(c => c.id === homes.id));
  assert.ok(selected.some(c => c.id === older.id));
});

test("keyword eligibility survives public-card projection without exposing job descriptions", () => {
  const full = card("role", {categorySlug:"jobs", job:{category:"Retail", employerName:"Example", jobSummary:"This role offers remote work", responsibilities:["private payload"], qualifications:[]}});
  const saved = homepageCard(full);
  assert.equal(saved.job.jobSummary, "");
  assert.deepEqual(saved.job.responsibilities, []);
  assert.deepEqual(saved.landingKeywords, ["remote"]);
  assert.equal(landingCards([saved], {category:"jobs",q:"remote"})[0].id, full.id);
  assert.equal(landingCards([saved], {category:"jobs",q:"driver"}).length, 0);
});

test("a regional feed reserves both unfiltered and Idaho matches before trimming", () => {
  const regional = Array.from({length:250},(_,n) => card(`regional-${n}`, {state:"UT",categorySlug:"jobs",job:{category:"Healthcare"}}));
  const local = card("idaho-role", {categorySlug:"jobs", job:{category:"Healthcare"},createdAt:"2020-01-01T00:00:00Z"});
  const selected = selectLandingCoverage([...regional,local],120);
  assert.equal(landingCards(selected,{category:"jobs",state:"ID",jobCategory:"Healthcare"})[0].id,local.id);
  assert.ok(landingCards(selected,{category:"jobs",jobCategory:"Healthcare"}).length >= 13);
});
