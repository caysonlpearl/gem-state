import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const homeSource = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");

test("homepage keeps Firearms beside Pets in the two featured category tiles", () => {
  const component = homeSource.match(/function HomepageFeaturedCategories\([\s\S]*?\n}\n/);
  assert.ok(component, "HomepageFeaturedCategories component not found");
  assert.match(component[0], /grid-cols-2/);
  assert.match(
    component[0],
    /\{ slug: "pets", title: "Pets & adoption"[^}]*\},\s*\{ slug: "firearms", title: "Firearms & gear"/,
  );
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
    /mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5[\s\S]*?homepageCategoryHighlights\.map/,
  );
});
