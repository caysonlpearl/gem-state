import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture() {
  const calls = { homes: 0, ratings: 0, merchandise: 0, homepage: 0 };
  const exports = {};
  const action = (name) => async () => {
    calls[name]++;
    return { ok: true };
  };
  vm.runInNewContext(
    ts.transpile(
      readFileSync(
        new URL("../src/routes/api/internal/service-ratings.ts", import.meta.url),
        "utf8",
      ),
      {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    ),
    {
      exports,
      URL,
      Response,
      require(name) {
        if (name === "@tanstack/react-router")
          return { createFileRoute: () => (options) => options };
        if (name === "@/integrations/supabase/cron-auth")
          return {
            authenticateCronRequest: async (request) =>
              request.headers.get("authorization") === "Bearer fixture"
                ? null
                : new Response("Unauthorized", { status: 401 }),
          };
        if (name === "@/lib/openwebninja-listings.server")
          return { advanceHomeFeed: action("homes") };
        if (name === "@/lib/service-directory.server")
          return { rateNextTradeCity: action("ratings") };
        if (name === "@/lib/avantlink.server")
          return { advanceMerchandiseFeed: action("merchandise") };
        if (name === "@/lib/homepage-snapshot.server")
          return { refreshHomepageSnapshot: action("homepage") };
        throw new Error("Unexpected module " + name);
      },
    },
  );
  return {
    calls,
    run: (query = "", auth = true) =>
      exports.Route.server.handlers.POST({
        request: new Request("https://fixture.invalid/api/internal/service-ratings" + query, {
          method: "POST",
          headers: auth ? { authorization: "Bearer fixture" } : {},
        }),
      }),
  };
}
test("home-only maintenance still requires cron authentication", async () => {
  const f = fixture();
  assert.equal((await f.run("?homesOnly=1", false)).status, 401);
  assert.deepEqual(f.calls, { homes: 0, ratings: 0, merchandise: 0, homepage: 0 });
});
test("an authorized home-only backfill does not spend unrelated provider allowances", async () => {
  const f = fixture();
  assert.equal((await f.run("?homesOnly=1")).status, 200);
  assert.deepEqual(f.calls, { homes: 1, ratings: 0, merchandise: 0, homepage: 0 });
});
test("the existing scheduled maintenance run retains all its source jobs", async () => {
  const f = fixture();
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(f.calls, { homes: 1, ratings: 1, merchandise: 1, homepage: 1 });
});

test("operator batches are bounded and cannot run unrelated source jobs", async () => {
  const f = fixture();
  const response = await f.run("?homesOnly=1&steps=1000");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).completedSteps, 5);
  assert.deepEqual(f.calls, { homes: 5, ratings: 0, merchandise: 0, homepage: 0 });
  const unauth = fixture();
  assert.equal((await unauth.run("?homesOnly=1&steps=5", false)).status, 401);
  assert.equal(unauth.calls.homes, 0);
});
