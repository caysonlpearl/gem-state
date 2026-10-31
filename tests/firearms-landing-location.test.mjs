import { firearmShowcaseRows } from "../src/config/landing-preview-rows.ts";
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
const latestDeclaration = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "latestListingsInput",
);
assert.ok(latestDeclaration);
vm.runInContext(ts.transpile(latestDeclaration.getText(file), { target: ts.ScriptTarget.ES2022 }), context);
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

test("Latest firearms requests firearms only and allows a variety of firearm types", () => {
  const search = {
    category: "firearms", ...location, firearmListingType: "Accessory",
    firearmAccessoryType: "Ammunition", firearmType: "Rifle", firearmBrand: "Glock",
  };
  const input = context.latestListingsInput(search);
  assert.equal(input.firearmListingType, "Firearm");
  assert.equal(input.firearmType, undefined);
  assert.equal(input.firearmBrand, undefined);
  assert.equal(input.firearmAccessoryType, undefined);
  assert.equal(input.page, 1);
  for (const key of Object.keys(location)) assert.equal(input[key], undefined, key);
  assert.equal(search.firearmListingType, "Accessory");
});

test("Latest-only restriction does not change ammunition previews or full browse results", () => {
  const results = { category: "firearms", firearmMode: "results", firearmListingType: "Accessory", firearmAccessoryType: "Ammunition", ...location };
  assert.deepEqual(context.latestListingsInput(results), context.inputFromSearch(results));
  const preview = context.showcaseSearch({ category: "firearms", ...location },
    "/browse?category=firearms&firearmMode=results&firearmListingType=Accessory&firearmAccessoryType=Ammunition");
  assert.equal(inputFromSearch(preview).firearmListingType, "Accessory");
  assert.equal(inputFromSearch(preview).firearmAccessoryType, "Ammunition");
  assert.deepEqual(context.latestListingsInput({ category: "pets", ...location }), inputFromSearch({ category: "pets", ...location }));
});

test("Latest firearm selection mixes available firearm types and rejects ammunition and gear", () => {
  for (const name of ["varietyOf", "varietyOfFirearms"]) {
    const node = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node);
    vm.runInContext(ts.transpile(node.getText(file), { target: ts.ScriptTarget.ES2022 }), context);
  }
  const card = (id, listingType, firearmType) => ({ id, title: id, itemDetails: { listingType, firearmType } });
  const inventory = [card("ammo", "Accessory"), card("case", "Accessory"),
    card("shotgun1", "Firearm", "Shotgun"), card("shotgun2", "Firearm", "Shotgun"),
    card("rifle", "Firearm", "Rifle"), card("handgun", "Firearm", "Handgun")];
  assert.deepEqual(Array.from(context.varietyOfFirearms(inventory, 4), (card) => card.id),
    ["shotgun1", "rifle", "handgun", "shotgun2"]);
});

test("Every Firearms showcase row keeps its specific inventory filter without carried location", () => {
  const rows = firearmShowcaseRows;
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