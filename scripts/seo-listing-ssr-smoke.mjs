// Exercise the actual production build, including TanStack loaders, server
// functions and SSR. All source traffic is intercepted; no real API is called.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

// The deployed Cloudflare runtime imports a compiled WebAssembly.Module.
// Node needs an equivalent local loader for that build artifact, without
// substituting the image library or skipping any production route code.
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));

process.env.GEM_STATE_SUPABASE_URL = "http://127.0.0.1:48997";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only_not_real";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture_only_not_real";

const home = {
  id: "111261092",
  address: "414 4th Ave W",
  city: "Twin Falls",
  state: "ID",
  zip: "83301",
  priceCents: 150000,
  mode: "rent",
  propertyType: "House",
  beds: 3,
  baths: 2,
  sqft: 1200,
  imageUrl: null,
  sourceUrl: "https://example.org/fixture-home",
  isFeatured: false,
};
const extra = {
  description: "Fixture rental description supplied by the saved property cache.",
  images: ["https://images.example.org/one.jpg", "https://images.example.org/two.jpg"],
  amenities: ["Central air"],
  priceHistory: [],
  taxHistory: [],
};
let mode = "healthy";
const calls = [],
  external = [],
  results = [],
  pending = [];
const originalFetch = globalThis.fetch;
const originalError = console.error;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  if (!["127.0.0.1", "udxxfuticbxwiehoepeg.supabase.co"].includes(url.hostname)) {
    external.push(url.hostname);
    throw new Error("Unexpected external network in SSR fixture");
  }
  calls.push({ path: url.pathname, method: init.method ?? "GET" });
  if (url.pathname.includes("/storage/")) return Response.json({}, { status: 404 });
  if (url.pathname === "/rest/v1/asks" && mode === "stalled") {
    return new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  }
  if (url.pathname === "/rest/v1/asks" && mode === "native-offline")
    return Response.json({ message: "Fixture database unavailable" }, { status: 503 });
  let body = [];
  if (url.pathname === "/rest/v1/openwebninja_cache") {
    const searches = url.searchParams.get("cache_key")?.includes("search");
    if (!searches && mode === "home-offline")
      return Response.json({ message: "Fixture property cache unavailable" }, { status: 503 });
    body = searches
      ? [
          {
            cache_key: '{"v":1,"kind":"area-search","mode":"rent"}',
            payload: { homes: [home] },
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          },
        ]
      : [{ cache_key: '{"v":3,"kind":"property","id":"111261092"}', payload: extra }];
  }
  return Response.json(body, { headers: { "content-range": "0-0/0" } });
};

// The expected source-outage cases log their generic SSR error. Keep that noise
// out of CI; assertion failures still print normally after cleanup.
console.error = process.env.SSR_SMOKE_DEBUG ? originalError : () => {};
try {
  const worker = (await import(pathToFileURL(process.cwd() + "/.output/server/index.mjs"))).default;
  async function render(path, expected, nextMode = "healthy") {
    mode = nextMode;
    calls.length = 0;
    const started = performance.now();
    const response = await worker.fetch(
      new Request("https://onbluebird.com" + path),
      {},
      { waitUntil: (task) => pending.push(task) },
    );
    const html = await response.text();
    const milliseconds = Math.round(performance.now() - started);
    assert.equal(response.status, expected, path + ": " + nextMode);
    assert.equal(
      response.headers.get("location"),
      null,
      "unrelated category redirects are not replacements for removed listings",
    );
    assert.equal(html.includes("sb_secret_fixture"), false);
    if (expected === 200) {
      assert.ok(html.includes(home.address));
      assert.ok(
        html.includes(extra.description),
        "saved descriptions must render without JavaScript",
      );
      for (const image of extra.images)
        assert.ok(html.includes(image), "all saved photos reach the existing gallery");
      assert.equal(html.includes("Something went wrong"), false);
    }
    if (expected === 404) assert.ok(html.includes("This listing is no longer live"));
    if (nextMode === "malformed")
      assert.equal(calls.length, 0, "malformed identifiers must not query any source");
    if (nextMode === "stalled") {
      assert.ok(milliseconds < 12000, "eight-second SELECT deadline must cover the built route");
      assert.equal(
        calls.filter((call) => call.path === "/rest/v1/asks").length,
        1,
        "no retries or archive fan-out after a source timeout",
      );
    }
    results.push({ path, mode: nextMode, status: response.status, milliseconds });
  }
  const native = "/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await render("/listings/openwebninja-111261092", 200);
  await render(native, 404);
  await render("/listings/openwebninja-999999999", 404);
  await render("/listings/not-a-real-listing-id", 404, "malformed");
  await render("/listings/------------------------------------", 404, "malformed");
  await render("/listings/openwebninja-abc", 404, "malformed");
  await render(native, 500, "native-offline");
  await render("/listings/openwebninja-111261092", 500, "home-offline");
  await render(native, 500, "stalled");
  await render("/listings/openwebninja-111261092", 200);
  assert.deepEqual(external, [], "SSR must not contact a provider or other external host");
  console.log(
    JSON.stringify(
      { productionBuildSsr: "passed", realExternalRequests: 0, cases: results },
      null,
      2,
    ),
  );
} finally {
  await Promise.allSettled(pending);
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
