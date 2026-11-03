import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { homepageCard } from "../src/lib/homepage-snapshot-contract.ts";
import { seoHostPolicy } from "../src/lib/seo-policy.ts";

function compile(path, dependencies) {
  const exports = {};
  vm.runInNewContext(
    ts.transpile(readFileSync(new URL(path, import.meta.url), "utf8"), {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    }),
    {
      exports, console, crypto, TextEncoder, TextDecoder, TransformStream,
      AbortSignal, Request, Response, Headers, URL, performance,
      require(name) {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    },
  );
  return exports;
}

function fixture({ failRefresh = false } = {}) {
  const { createSeoPageCache, SEO_REFRESH_MS } = compile("../src/lib/seo-page-cache.server.ts", {
    "./homepage-snapshot-contract": { homepageCard },
    "./runtime-env.server": { serverEnv: () => "" },
  });
  const key = "place-page:part-time-jobs:";
  let saved = {
    version: 1, key, generatedAt: 1,
    value: { heading: "Part-time jobs", total: 3, indexable: false,
      listings: [], regionGroups: [], recentlySold: [] },
  };
  const pending = new Map();
  let builds = 0;
  const cache = createSeoPageCache({
    async read() { return saved; },
    async acquire() { return true; },
    async write(_key, entry) { saved = entry; },
  }, () => SEO_REFRESH_MS + 2, (key, task) => pending.set(key, task));
  const server = compile("../src/server.ts", {
    "./lib/error-capture": { consumeLastCapturedError: () => null },
    "./lib/error-page": { renderErrorPage: () => "error" },
    "./lib/runtime-env.server": { registerRuntimeBindings() {} },
    "./lib/stripe-marketplace.server": { handleStripeWebhook() { assert.fail("Unexpected webhook"); } },
    "./lib/seo-policy": { seoHostPolicy },
    "@tanstack/react-start/server-entry": { default: {
      async fetch() {
        const value = await cache.read(key, async () => {
          builds++;
          if (failRefresh) throw new Error("Stored inventory unavailable");
          return { ...saved.value, total: 13, indexable: true };
        });
        return new Response(String(value.total), { headers: { "Content-Type": "text/html" } });
      },
    } },
    "./lib/seo-page-cache.server": {
      pendingSeoPageRefreshes() {
        const tasks = [...pending.values()];
        pending.clear();
        return tasks.map(run => run());
      },
    },
  }).default;
  const background = [];
  const hook = {
    waitUntil(task) {
      assert.equal(this, hook, "Background hook lost its receiver");
      background.push(task);
    },
  };
  const request = new Request("https://onbluebird.com/idaho/part-time-jobs");
  return { server, request, hook, background, saved: () => saved, builds: () => builds };
}

test("a request-provided background hook refreshes stale landing data after serving its saved page", async () => {
  const f = fixture();
  f.request.waitUntil = f.hook.waitUntil.bind(f.hook);
  const response = await f.server.fetch(f.request, {}, undefined);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "3");
  assert.equal(f.background.length, 1);
  await Promise.all(f.background);
  assert.equal(f.builds(), 1);
  assert.equal(f.saved().value.total, 13);
  assert.equal(f.saved().value.indexable, true);
});

test("the context background hook takes precedence without executing the refresh twice", async () => {
  const f = fixture();
  f.request.waitUntil = () => assert.fail("Request fallback used despite context hook");
  await f.server.fetch(f.request, {}, f.hook);
  await Promise.all(f.background);
  assert.equal(f.background.length, 1);
  assert.equal(f.builds(), 1);
  assert.equal(f.saved().value.total, 13);
});

test("a request-only background refresh failure preserves the successful cached page", async () => {
  const f = fixture({ failRefresh: true });
  f.request.waitUntil = f.hook.waitUntil.bind(f.hook);
  const original = f.saved();
  const response = await f.server.fetch(f.request, {}, undefined);
  await Promise.all(f.background);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "3");
  assert.equal(f.builds(), 1);
  assert.equal(f.saved(), original);
});
