import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { dueSeoReviewPeriods } from "../src/lib/seo-review-schedule.ts";

test("review periods respect Boise morning across DST and use completed UTC weeks/months", () => {
  assert.equal(dueSeoReviewPeriods(Date.parse("2026-11-02T15:59:00Z"))[0].key, "weekly-2026-10-26");
  const winter = dueSeoReviewPeriods(Date.parse("2026-11-02T16:00:00Z"));
  assert.equal(winter[0].key, "weekly-2026-11-02");
  assert.equal(winter[0].days, 7);
  assert.equal(new Date(winter[0].until).toISOString(), "2026-11-02T00:00:00.000Z");
  const summer = dueSeoReviewPeriods(Date.parse("2026-06-01T15:00:00Z"));
  assert.deepEqual(
    summer.map((period) => [period.key, period.days]),
    [
      ["weekly-2026-06-01", 7],
      ["monthly-2026-06-01", 31],
    ],
  );
  assert.equal(dueSeoReviewPeriods(Date.parse("2028-03-01T16:00:00Z"))[1].days, 29);
  assert.equal(dueSeoReviewPeriods(Date.parse("2026-11-03T17:00:00Z"))[0].key, "weekly-2026-11-02");
});

const exports = {};
const source = readFileSync(
  new URL("../src/lib/seo-review-reports.server.ts", import.meta.url),
  "utf8",
);
vm.runInNewContext(
  ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }),
  {
    exports,
    require(name) {
      if (name === "./seo-review-schedule") return { dueSeoReviewPeriods };
      if (name === "./traffic-report.server")
        return {
          loadTrafficReport: () => {
            throw new Error("unexpected real event read");
          },
        };
      throw new Error(name);
    },
  },
);
test("concurrent maintenance runs save a report once and never replace the saved baseline", async () => {
  const saved = new Map(),
    leases = new Set();
  let builds = 0;
  const writer = exports.createSeoReviewWriter(
    {
      async exists(key) {
        return saved.has(key);
      },
      async acquire(key) {
        if (leases.has(key)) return false;
        leases.add(key);
        return true;
      },
      async write(key, report) {
        assert.equal(saved.has(key), false);
        saved.set(key, report);
      },
      async release(key) {
        leases.delete(key);
      },
    },
    async () => {
      builds++;
      return { organicVisits: 3 };
    },
  );
  const period = { key: "weekly-2026-11-02", days: 7, until: 1793577600000 };
  const results = await Promise.all([writer(period), writer(period)]);
  assert.equal(results.filter((result) => result.saved).length, 1);
  assert.equal(builds, 1);
  assert.equal((await writer(period)).reason, "already_saved");
  assert.equal(saved.get(period.key).organicVisits, 3);
});
test("failed event reads release the report lease and cannot save invented zeroes", async () => {
  let held = false,
    writes = 0,
    failed = true;
  const writer = exports.createSeoReviewWriter(
    {
      async exists() {
        return false;
      },
      async acquire() {
        if (held) return false;
        held = true;
        return true;
      },
      async write() {
        writes++;
      },
      async release() {
        held = false;
      },
    },
    async () => {
      if (failed) throw new Error("event database unavailable");
      return { organicVisits: 2 };
    },
  );
  const period = { key: "test", days: 7, until: 1 };
  await assert.rejects(writer(period), /event database unavailable/);
  assert.equal(writes, 0);
  assert.equal(held, false);
  failed = false;
  assert.equal((await writer(period)).saved, true);
  assert.equal(writes, 1);
});
test("saved analytics stay in private storage behind the existing administrator role", () => {
  assert.match(source, /public: false/);
  assert.match(source, /existing\.data\?\.public/);
  assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/);
  const api = readFileSync(new URL("../src/lib/traffic.functions.ts", import.meta.url), "utf8");
  assert.match(api, /if \(data !== true\) throw new Error/);
  assert.equal((api.match(/await requireTrafficAdmin\(context\)/g) || []).length, 2);
});
