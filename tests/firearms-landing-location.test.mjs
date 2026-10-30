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