import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { illustrativeActivity } from "../src/config/illustrative-activity.ts";
const product = {
  id: "item",
  releaseDate: "2026-08-01",
  retailPriceCents: 3499,
  resorts: [{ code: "DLR", name: "Disneyland Resort" }],
};
test("stable variation-specific histories have 10–30 positive USD records", () => {
  for (let i = 0; i < 100; i++) {
    const p = { ...product, id: `variant-${i}` };
    const a = illustrativeActivity(p);
    assert.deepEqual(a, illustrativeActivity(p));
    assert.ok(a.sales.length >= 10 && a.sales.length <= 30);
    assert.equal(a.history.length, a.sales.length);
    assert.ok(
      a.sales.every(
        (s) =>
          s.priceCents > 0 &&
          s.currency === "USD" &&
          s.soldAt >= "2026-08-01" &&
          s.soldAt <= "2026-09-06T12:00:00.000Z",
      ),
    );
  }
  assert.notDeepEqual(
    illustrativeActivity(product),
    illustrativeActivity({ ...product, id: "different" }),
  );
});
test("sightings respect release window, old/unknown/future items are blank", () => {
  assert.ok(
    illustrativeActivity(product).sightings.every(
      (s) => s.seenAt >= "2026-08-01" && s.seenAt <= "2026-09-06T12:00:00.000Z",
    ),
  );
  for (const releaseDate of [null, "invalid", "2020-01-01", "2027-01-01"])
    assert.equal(illustrativeActivity({ ...product, releaseDate }).sightings.length, 0);
  assert.equal(illustrativeActivity({ ...product, resorts: [] }).sightings.length, 0);
});
test("disclosure and presentation records share one switch; generator has no database dependency", () => {
  const source = readFileSync(
    new URL("../src/config/illustrative-activity.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /supabase|createServerFn|fetch\(/);
  const banner = readFileSync(
    new URL("../src/components/layout/PilotBanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(banner, /ILLUSTRATIVE_ACTIVITY/);
  assert.match(banner, /Preview—activity shown is illustrative/);
});
