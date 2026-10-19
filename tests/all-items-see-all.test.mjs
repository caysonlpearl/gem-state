import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Render the actual showcase in isolation: no server imports, database calls,
// or invented inventory. Both mapped row links must use the real destination.
const source = await readFile(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("browse.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const showcase = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "GeneralClassifiedShowcase",
);
assert.ok(showcase, "The All Items showcase must exist");
const compiled = ts.transpileModule(showcase.getText(file), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({
  React: { createElement: (type, props, ...children) => ({ type, props, children }) },
  Link: "Link",
  ArrowRight: "ArrowRight",
  AllCategoriesPopover: "AllCategoriesPopover",
  CategoryArtwork: "CategoryArtwork",
  CategoryGettingStarted: "CategoryGettingStarted",
  ListingCard: "ListingCard",
  generalCategoryHighlights: [],
});
const tree = vm.runInContext(`${compiled}\nGeneralClassifiedShowcase({ listings: [] })`, context);
function links(node) {
  if (Array.isArray(node)) return node.flatMap(links);
  if (!node || typeof node !== "object") return [];
  return [...(node.type === "Link" ? [node] : []), ...links(node.children)];
}
const destinations = links(tree);
assert.equal(destinations.length, 2, "Both listing rows must expose a browse destination");

for (const [index, row] of ["Top listings", "Newest listings"].entries()) {
  test(`${row} See all preserves All Items inventory filters and opens page 1`, () => {
    const link = destinations[index];
    assert.equal(link.props.to, "/browse");
    const current = {
      allCategories: true,
      state: "ID",
      city: "Boise",
      region: "treasure-valley",
      postalCode: "83702",
      latitude: 43.615,
      longitude: -116.2023,
      radiusMiles: 50,
      q: "drill",
      priceMin: 10,
      priceMax: 500,
      condition: "used_good",
      fulfillment: "local_pickup",
      itemDetailKey: "itemType",
      itemDetailValue: "Drills",
      sort: "price_low",
      view: "list",
      page: 4,
    };
    const result = link.props.search(current);
    assert.deepEqual({ ...result }, { ...current, allCategories: undefined, page: 1 });
    assert.equal(result.category, undefined, "Do not replace imported inventory with General");
    assert.equal(current.allCategories, true, "Do not mutate the landing search");
    assert.equal(current.page, 4);

    // Preserve any explicitly selected inventory scope instead of overriding it.
    const scoped = { ...current, category: "industrial", group: "classifieds" };
    assert.deepEqual(
      { ...link.props.search(scoped) },
      { ...scoped, allCategories: undefined, page: 1 },
    );
    assert.deepEqual({ ...link.props.search({ allCategories: true }) }, {
      allCategories: undefined,
      page: 1,
    });
  });
}