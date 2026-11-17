import test from "node:test";
import assert from "node:assert/strict";
import { addComparison } from "../src/lib/listing-comparison.ts";
const vehicle = (id) => ({ id, title: id, image: null, kind: "vehicle", rows: [] });
test("comparison is capped, removable, and cannot mix homes with vehicles", () => {
  const one = vehicle("one"),
    two = vehicle("two"),
    three = vehicle("three");
  let items = addComparison([], one);
  assert.equal(addComparison(items, { ...vehicle("home"), kind: "home" }), items);
  items = addComparison(addComparison(items, two), three);
  assert.equal(addComparison(items, vehicle("four")), items);
  assert.deepEqual(
    addComparison(items, two).map((item) => item.id),
    ["one", "three"],
  );
  assert.equal(addComparison([], { ...one, kind: "home" })[0].kind, "home");
});
