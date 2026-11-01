import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("sold matching applies state before limiting while preserving city radius behavior", () => {
  const source = read("../src/lib/classifieds.functions.ts");
  const file = ts.createSourceFile("functions.ts", source, ts.ScriptTarget.Latest, true);
  let predicate;
  function visit(node) {
    if (ts.isArrowFunction(node) && node.getText(file).startsWith("({ card }) =>") && node.getText(file).includes("data.state")) predicate = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(predicate);
  const make = (data) => vm.runInNewContext(ts.transpile(`(${predicate})`, { target: ts.ScriptTarget.ES2022 }), {
    data, lower: (value) => (value ?? "").toLowerCase(), regionOfListing: (card) => card.region,
    isWithinClassifiedRadius: ({ listingCity, cityState, listingState, radiusMiles }) => {
      assert.equal(cityState, "ID");
      assert.ok(["WA", "ID"].includes(listingState));
      assert.equal(radiusMiles, 25);
      return listingCity === "Near";
    },
  });
  assert.equal(make({ state: "ID" })({ card: { state: "WA" } }), false);
  assert.equal(make({ state: "ID" })({ card: { state: "ID" } }), true);
  assert.equal(make({ state: "ID", city: "Near" })({ card: { state: "WA", city: "Near" } }), true);
  assert.equal(make({ state: "ID", city: "Near" })({ card: { state: "ID", city: "Far" } }), false);
});

test("landing metadata lists the same region cards displayed and exposes statistics scope", () => {
  const route = read("../src/lib/place-page-route.ts");
  assert.match(route, /data\.regionGroups\.flatMap\(\(group\) => group\.listings\)/);
  const page = read("../src/components/classifieds/PlacePage.tsx");
  assert.match(page, /data\.statisticsNote/);
  assert.match(page, /Browse listings in \{group\.region\}/);
  assert.doesNotMatch(page, /See all \{group\.count\}/);
  assert.match(page, /Not a total sales count/);
  const functions = read("../src/lib/place-pages.functions.ts");
  assert.equal((functions.match(/statisticsNote: `/g) ?? []).length, 2);
  assert.match(functions, /category:\s*"cars-trucks",\s*state:\s*"ID",\s*make,[\s\S]*?limit:\s*8/);
});
