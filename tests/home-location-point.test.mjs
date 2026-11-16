import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { classifiedCoordinatesForCity } from "../src/config/classifieds.ts";
import { parseLocationSearch } from "../src/lib/location-search.ts";

const source = readFileSync(new URL("../src/lib/location-suggest.ts", import.meta.url), "utf8");
const file = ts.createSourceFile("location.ts", source, ts.ScriptTarget.Latest, true);
const fn = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "locationMapPoint",
);
const context = vm.createContext({
  classifiedCoordinatesForCity,
  parseLocationSearch,
  zips: JSON.parse(
    readFileSync(new URL("../src/config/location-places.json", import.meta.url), "utf8"),
  ).zips,
});
vm.runInContext(
  ts.transpileModule(fn.getText(file).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
  context,
);

test("city and ZIP search share their known map center without a geocoder request", () => {
  for (const value of ["Twin Falls", "Twin Falls, ID", "83301", "83301-1234"]) {
    const point = context.locationMapPoint(value);
    assert.equal(point.city, "Twin Falls");
    assert.deepEqual(
      [point.latitude, point.longitude],
      classifiedCoordinatesForCity("Twin Falls", "ID"),
    );
  }
  for (const state of ["OR", "UT"]) {
    const point = context.locationMapPoint(`Sandy, ${state}`);
    assert.deepEqual(
      [point.latitude, point.longitude],
      classifiedCoordinatesForCity("Sandy", state),
    );
  }
});
test("unresolved and statewide searches retain text without applying an invented map point", () => {
  for (const value of ["", "Idaho", "Treasure Valley", "99999", "Unknown Town, ID"]) {
    assert.equal(context.locationMapPoint(value), undefined, value);
  }
});
