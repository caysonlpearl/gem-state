import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { shouldDehydrateHomepageQuery } from "../src/lib/home-query-serialization.ts";

const queryKey = ["classifieds-home-lead", "cars-trucks"];
const options = { shouldDehydrateQuery: shouldDehydrateHomepageQuery };

test("a slow or interrupted SSR lead cannot trap the browser on the server promise", async () => {
  const server = new QueryClient();
  const browser = new QueryClient();
  let finish;
  const pending = server.fetchQuery({
    queryKey,
    queryFn: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const initial = dehydrate(server, options);
  assert.deepEqual(initial.queries, []);
  hydrate(browser, initial);
  let browserCalls = 0;
  const result = await browser.fetchQuery({
    queryKey,
    queryFn: async () => {
      browserCalls++;
      return { motors: [{ id: "working-car" }] };
    },
  });
  assert.equal(result.motors[0].id, "working-car");
  assert.equal(browserCalls, 1);
  finish(result);
  await pending;
  server.clear();
  browser.clear();
});

test("prompt server results hydrate without another browser fetch", async () => {
  const server = new QueryClient();
  const browser = new QueryClient();
  const result = { motors: [{ id: "server-car" }] };
  await server.fetchQuery({ queryKey, queryFn: async () => result });
  hydrate(browser, dehydrate(server, options));
  assert.deepEqual(
    await browser.fetchQuery({
      queryKey,
      staleTime: 60_000,
      queryFn: () => {
        throw new Error("Must reuse server data");
      },
    }),
    result,
  );
  server.clear();
  browser.clear();
});

test("both homepage queries recover independently while other routes retain streaming", () => {
  assert.equal(
    shouldDehydrateHomepageQuery({ queryKey: ["classifieds-home"], state: { status: "pending" } }),
    false,
  );
  assert.equal(
    shouldDehydrateHomepageQuery({ queryKey: ["browse"], state: { status: "pending" } }),
    true,
  );
  assert.equal(shouldDehydrateHomepageQuery({ queryKey, state: { status: "error" } }), true);
  assert.equal(shouldDehydrateHomepageQuery({ queryKey, state: { status: "success" } }), true);
});
