import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function getLoader(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let loader;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "loader") loader = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const homes = { slug: "other-real-estate" };
  const categories = { homes, "other-real-estate": homes, trailers: { slug: "trailers" } };
  const places = { boise: { name: "Boise" }, "treasure-valley": { name: "Treasure Valley" } };
  const slug = (value) => value.toLowerCase().replaceAll(" ", "-");
  return vm.runInNewContext(`(${loader})`, {
    categoryFromUrlSlug: (value) => categories[value] ?? null,
    categoryUrlSlug: (value) => value === "other-real-estate" ? "homes" : value,
    categoryPagePath: () => "/idaho/homes",
    placeFromSlug: (value) => places[value] ?? null,
    placePath: (name) => `/idaho/${slug(name)}/homes`,
    redirect: (options) => ({ ...options, redirect: true }),
    notFound: () => ({ notFound: true }),
    placePageQuery: (...args) => args,
  });
}

test("Idaho aliases redirect permanently before any inventory lookup", async () => {
  const single = getLoader("../src/routes/idaho.$place.index.tsx");
  const double = getLoader("../src/routes/idaho.$place.$category.tsx");
  let calls = 0;
  const context = { queryClient: { ensureQueryData: async () => { calls++; return {}; } } };
  for (const [loader, params, expected] of [
    [single, { place: "other-real-estate" }, "/idaho/homes"],
    [double, { place: "boise", category: "other-real-estate" }, "/idaho/boise/homes"],
    [double, { place: "treasure-valley", category: "other-real-estate" }, "/idaho/treasure-valley/homes"],
  ]) {
    await assert.rejects(loader({ context, params }), (error) => error.redirect && error.statusCode === 301 && error.href === expected);
  }
  assert.equal(calls, 0);
  for (const params of [{ place: "homes" }, { place: "boise" }, { place: "trailers" }]) await single({ context, params });
  await double({ context, params: { place: "boise", category: "homes" } });
  assert.equal(calls, 4);
  const missingContext = { queryClient: { ensureQueryData: async () => null } };
  await assert.rejects(double({ context: missingContext, params: { place: "unknown", category: "other-real-estate" } }), (e) => e.notFound === true);
  await assert.rejects(double({ context: missingContext, params: { place: "boise", category: "unknown" } }), (e) => e.notFound === true);
});
