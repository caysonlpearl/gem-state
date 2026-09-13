import test from "node:test";
import assert from "node:assert/strict";

import { getUtcWeekKey, selectWeeklyTopTen } from "../src/lib/weekly-top-ten.ts";

const candidates = Array.from({ length: 30 }, (_, index) => ({
  id: `product-${index + 1}`,
  categorySlug: `category-${index % 6}`,
}));

test("weekly selection is stable throughout the same UTC week", () => {
  const monday = new Date("2026-09-07T00:00:00.000Z");
  const sunday = new Date("2026-09-13T23:59:59.000Z");

  assert.equal(getUtcWeekKey(monday), "2026-09-07");
  assert.equal(getUtcWeekKey(sunday), "2026-09-07");
  assert.deepEqual(selectWeeklyTopTen(candidates, monday), selectWeeklyTopTen(candidates, sunday));
});

test("weekly selection changes when the next week begins", () => {
  const firstWeek = selectWeeklyTopTen(candidates, new Date("2026-09-07T12:00:00.000Z"));
  const nextWeek = selectWeeklyTopTen(candidates, new Date("2026-09-14T12:00:00.000Z"));

  assert.notDeepEqual(firstWeek, nextWeek);
});

test("weekly selection stays diverse before repeating categories", () => {
  const selected = selectWeeklyTopTen(candidates, new Date("2026-09-07T12:00:00.000Z"));
  const counts = new Map();
  for (const product of selected) {
    counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1);
  }

  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((product) => product.categorySlug)).size, 6);
  assert.ok([...counts.values()].every((count) => count <= 2));
});
