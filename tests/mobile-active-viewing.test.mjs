import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compiled = ts.transpileModule(
  readFileSync(new URL("../apps/mobile/src/shopping-activity.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
test("native active viewing excludes background/hidden time and cleans up observers", () => {
  let now = 1000,
    interval,
    cleanup;
  const events = [],
    listeners = new Map();
  const doc = {
    visibilityState: "visible",
    modal: false,
    querySelector: () => (doc.modal ? {} : null),
    dispatchEvent: (event) => listeners.get(event.type)?.(),
    addEventListener: (k, fn) => listeners.set(k, fn),
    removeEventListener: (k) => listeners.delete(k),
  };
  const modules = {
      react: {
        useEffect: (fn) => {
          cleanup = fn();
        },
      },
      "./shopping": { trackShopping: (...e) => events.push(e) },
    },
    exports = {};
  new Function("require", "exports", "document", "setInterval", "clearInterval", "Date", compiled)(
    (name) => modules[name],
    exports,
    doc,
    (fn) => {
      interval = fn;
      return 1;
    },
    () => {},
    { now: () => now },
  );
  exports.useListingActivity("dealerfeed-car", true);
  now += 5000;
  exports.setShoppingForeground(false);
  now += 300000;
  interval();
  assert.deepEqual(
    events.filter((e) => e[0] === "active").map((e) => e[2].seconds),
    [5],
  );
  exports.setShoppingForeground(true);
  now += 5000;
  interval();
  assert.deepEqual(
    events.filter((e) => e[0] === "active").map((e) => e[2].seconds),
    [5, 5],
  );
  doc.visibilityState = "hidden";
  listeners.get("visibilitychange")();
  now += 600000;
  interval();
  assert.equal(events.filter((e) => e[0] === "active").length, 2);
  doc.visibilityState = "visible";
  doc.modal = true;
  listeners.get("bluebird-visibility-change")();
  now += 120000;
  interval();
  assert.equal(
    events.filter((e) => e[0] === "active").length,
    2,
    "A modal does not count as listing engagement",
  );
  doc.modal = false;
  listeners.get("bluebird-visibility-change")();
  listeners.get("bluebird-shopping-session")();
  assert.equal(
    events.filter((e) => e[0] === "view").length,
    2,
    "A renewed app session records a fresh visible visit",
  );
  cleanup();
  const count = events.length;
  exports.setShoppingForeground(false);
  assert.equal(events.length, count);
  assert.equal(listeners.size, 0);
});
