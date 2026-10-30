import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("browse.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "inputFromSearch",
);
assert.ok(declaration);
const context = vm.createContext({
  isMotorsCategory: (category) => category === "cars-trucks",
  normalizedCondition: (value) => value,
  thresholdValue: () => undefined,
  postedWindow: () => undefined,
});
vm.runInContext(ts.transpile(declaration.getText(file), { target: ts.ScriptTarget.ES2022 }), context);
const showcaseDeclaration = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "showcaseSearch",
);
assert.ok(showcaseDeclaration);
context.URL = URL;
vm.runInContext(ts.transpile(showcaseDeclaration.getText(file), { target: ts.ScriptTarget.ES2022 }), context);
const inputFromSearch = (search) => context.inputFromSearch(search);
const location = {
  state: "ID", region: "Magic Valley", city: "Twin Falls", postalCode: "83301",
  radiusMiles: 25, latitude: 42.5629, longitude: -114.4609,
};

test("Firearms landing ignores every carried location filter without mutating the URL search", () => {
  for (const firearmMode of [undefined, "landing"]) {
    const search = { category: "firearms", firearmMode, ...location };
    const result = inputFromSearch(search);
    for (const key of Object.keys(location)) assert.equal(result[key], undefined, key);
    assert.equal(result.category, "firearms");
    assert.deepEqual(search, { category: "firearms", firearmMode, ...location });
  }
});

test("Firearms results retain Twin Falls and the 25-mile radius plus all other location filters", () => {
  const result = inputFromSearch({ category: "firearms", firearmMode: "results", ...location });
  for (const [key, value] of Object.entries(location)) assert.equal(result[key], value, key);
});

test("Other categories keep their existing geographic filtering", () => {
  for (const category of ["apparel-accessories", "pets", "services", "cars-trucks"]) {
    const result = inputFromSearch({ category, ...location });
    for (const [key, value] of Object.entries(location)) assert.equal(result[key], value, key);
  }
});

test("Every Firearms showcase row keeps its specific inventory filter without carried location", () => {
  const rowsDeclaration = file.statements.find(
    (node) => ts.isVariableStatement(node) && node.declarationList.declarations.some(
      (item) => item.name.getText(file) === "firearmShowcaseRows",
    ),
  );
  assert.ok(rowsDeclaration);
  vm.runInContext(ts.transpile(rowsDeclaration.getText(file), { target: ts.ScriptTarget.ES2022 }), context);
  const rows = vm.runInContext("firearmShowcaseRows", context);
  assert.equal(rows.length, 8);
  for (const row of rows) {
    const preview = context.showcaseSearch({ category: "firearms", ...location }, row.href);
    const input = inputFromSearch(preview);
    for (const key of Object.keys(location)) assert.equal(input[key], undefined, `${row.title}: ${key}`);
    const params = new URL(row.href, "https://onbluebird.com").searchParams;
    assert.equal(params.get("firearmMode"), "results");
    for (const key of ["firearmListingType", "firearmType", "firearmAccessoryType"]) {
      if (params.has(key)) assert.equal(input[key], params.get(key), `${row.title}: ${key}`);
    }
  }
});

test("Showcase queries on results pages still retain location filters", () => {
  const preview = context.showcaseSearch(
    { category: "firearms", firearmMode: "results", ...location },
    "/browse?category=firearms&firearmMode=results&firearmType=Rifle",
  );
  const input = inputFromSearch(preview);
  for (const [key, value] of Object.entries(location)) assert.equal(input[key], value, key);
  assert.equal(input.firearmType, "Rifle");
});