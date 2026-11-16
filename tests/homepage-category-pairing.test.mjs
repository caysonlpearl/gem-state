import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const homeSource = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");

test("homepage moves Pets and Firearms into the app-style category strip beside Vehicles", async () => {
  const strip = await readFile(
    new URL("../src/components/classifieds/HomeCategoryShortcuts.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    strip,
    /\["cars-trucks", "pets", "firearms", "other-real-estate", "jobs", "services"\]/,
  );
  assert.doesNotMatch(homeSource, /HomepageFeaturedCategories|Explore pets and firearms/);
});

test("homepage browse-category cards keep Firearms and Pets in adjacent grid positions", () => {
  const highlights = homeSource.match(/const homepageCategoryHighlights = \[([\s\S]*?)\] as const/);
  assert.ok(highlights, "homepageCategoryHighlights array not found");
  assert.match(
    highlights[1],
    /slug: "firearms", name: "Firearms"\s*\},\s*\{ slug: "pets", name: "Pets"/,
  );
  assert.match(
    homeSource,
    /mt-5 grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-6[\s\S]*?homepageCategoryHighlights\.map/,
  );
});
