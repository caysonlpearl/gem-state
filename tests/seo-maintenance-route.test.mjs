import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function fixture({ authorized = true, sourceFails = false, reviewsFail = false } = {}) {
  const calls = [];
  const exports = {};
  const dependencies = {
    "@tanstack/react-router": { createFileRoute: () => (options) => options },
    "@/integrations/supabase/cron-auth": {
      authenticateCronRequest: async () =>
        authorized ? null : new Response("Unauthorized", { status: 401 }),
    },
    "@/lib/seo-review-reports.server": {
      async refreshSeoReviewReports() {
        calls.push("reports");
        if (reviewsFail) throw new Error("report storage unavailable");
        return [{ saved: true }];
      },
    },
    "@/lib/seo-prewarm.server": {
      async prewarmSeoPages() {
        calls.push("stored-pages");
        return { checked: 2, available: 2 };
      },
    },
    "@/lib/editorial-store.server": {
      async refreshEditorialSources() {
        calls.push("publishers");
        if (sourceFails) throw new Error("publisher unavailable");
        return [{ status: "not_due" }];
      },
    },
  };
  vm.runInNewContext(
    ts.transpile(
      readFileSync(new URL("../src/routes/api/internal/news-refresh.ts", import.meta.url), "utf8"),
      { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    ),
    {
      exports,
      Response,
      require(name) {
        assert.ok(dependencies[name], "Unexpected provider/dependency: " + name);
        return dependencies[name];
      },
    },
  );
  return { calls, run: () => exports.Route.server.handlers.POST({ request: {} }) };
}

test("the installed news job warms saved pages and records its outcome", async () => {
  const f = fixture();
  const response = await f.run();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).seo, { checked: 2, available: 2 });
  assert.deepEqual([...f.calls].sort(), ["publishers", "reports", "stored-pages"]);
});

test("a publisher outage does not cancel saved-page warming or review reports", async () => {
  const f = fixture({ sourceFails: true });
  assert.equal((await f.run()).status, 503);
  assert.deepEqual([...f.calls].sort(), ["publishers", "reports", "stored-pages"]);
});

test("failed report storage does not stop the successful publisher and page work", async () => {
  const f = fixture({ reviewsFail: true });
  const response = await f.run();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.reviews, []);
  assert.deepEqual(body.seo, { checked: 2, available: 2 });
});

test("anonymous maintenance requests cannot trigger work", async () => {
  const f = fixture({ authorized: false });
  assert.equal((await f.run()).status, 401);
  assert.deepEqual(f.calls, []);
});
