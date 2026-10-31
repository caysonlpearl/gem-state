import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { waitForHomeLead } from "../src/lib/home-lead-ready.ts";

test("ready lead data does not keep the deadline timer alive", async () => {
  assert.equal(await waitForHomeLead(Promise.resolve({ motors: [] }), 60000), true);
});
test("failed data falls back without propagating a route failure", async () => {
  assert.equal(await waitForHomeLead(Promise.reject(new Error("offline")), 60000), false);
});
test("a pending query cannot hold the initial page indefinitely and is not cancelled", async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  assert.equal(await waitForHomeLead(pending, 5), false);
  resolve("late result");
  assert.equal(await pending, "late result");
});
test("query finishing before deadline can be rendered in initial HTML", async () => {
  const pending = new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(await waitForHomeLead(pending, 200), true);
});
test("head preload uses the actual first default-location card and the same thumbnail transform", () => {
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.match(source, /await Promise\.all\(/);
  assert.doesNotMatch(source, /waitForHomeLead/);
  assert.match(source, /lead\?\.motors.find\(\(listing\) => listing.state === "ID"\)\?\.imageUrl/);
  assert.match(source, /leadImageUrl: firstImage \? listingCardImageUrl\(firstImage\) : null/);
  assert.match(source, /href: loaderData.leadImageUrl/);
  assert.match(source, /prefetchQuery\(homeQuery\)/);
});

test("real route loader and head agree on first image, empty inventory and missing data", async () => {
  const { default: ts } = await import("typescript");
  const vm = await import("node:vm");
  const { listingCardImageUrl } = await import("../src/lib/listing-card-image.ts");
  const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile(
    "index.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => s.declarationList.declarations)
    .find((d) => d.name.getText(file) === "Route");
  const code = ts.transpileModule("globalThis.route = " + declaration.initializer.getText(file), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  const context = vm.createContext({
    createFileRoute: () => (options) => options,
    waitForHomeLead,
    listingCardImageUrl,
    homeLeadQuery: { queryKey: ["lead"] },
    homeQuery: { queryKey: ["home"] },
    Home: () => null,
    brand: { name: "Bluebird" },
    jsonLdScript: (x) => x,
    siteStructuredData: () => ({}),
  });
  vm.runInContext(code, context);
  for (const [lead, expected] of [
    [
      {
        motors: [
          { state: "UT", imageUrl: "https://example.com/wrong.jpg" },
          { state: "ID", imageUrl: "https://images.craigslist.org/abc_1200x900.jpg" },
        ],
      },
      "https://images.craigslist.org/abc_600x450.jpg",
    ],
    [
      {
        motors: [
          { state: "ID", imageUrl: null },
          { state: "ID", imageUrl: "https://example.com/second.jpg" },
        ],
      },
      null,
    ],
    [{ motors: [] }, null],
    [undefined, null],
  ]) {
    let reads = 0;
    const loaderData = await context.route.loader({
      context: {
        queryClient: {
          prefetchQuery: async () => {
            reads++;
          },
          getQueryData: () => lead,
        },
      },
    });
    assert.equal(reads, 2);
    assert.equal(loaderData.leadImageUrl, expected);
    const links = context.route.head({ loaderData }).links.filter((x) => x.rel === "preload");
    assert.equal(links.length, expected ? 1 : 0);
    if (expected) {
      assert.equal(links[0].href, expected);
      assert.equal(links[0].fetchPriority, "high");
      assert.equal(links[0].as, "image");
    }
  }

  const waiting = new Map();
  let rendered = false;
  const loading = context.route
    .loader({
      context: {
        queryClient: {
          prefetchQuery: ({ queryKey }) =>
            new Promise((resolve) => waiting.set(queryKey[0], resolve)),
          getQueryData: () => ({ motors: [] }),
        },
      },
    })
    .then(() => {
      rendered = true;
    });
  waiting.get("lead")();
  await new Promise(setImmediate);
  assert.equal(rendered, false, "the first row alone cannot release a partially loaded page");
  waiting.get("home")();
  await loading;
  assert.equal(rendered, true, "the cached secondary rows settle before initial rendering");
});
