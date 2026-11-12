// Exercise the actual production build, including TanStack loaders, server
// functions and SSR. All source traffic is intercepted; no real API is called.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { register } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { toJSON } from "seroval";

// The deployed Cloudflare runtime imports a compiled WebAssembly.Module.
// Node needs an equivalent local loader for that build artifact, without
// substituting the image library or skipping any production route code.
register(new URL("./worker-wasm-test-loader.mjs", import.meta.url));

process.env.GEM_STATE_SUPABASE_URL = "http://127.0.0.1:48997";
process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only_not_real";
process.env.GEM_STATE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture_only_not_real";
process.env.MARKETCHECK_API_KEY = "fixture_only_not_real";

const home = {
  id: "111261092",
  address: "414 4th Ave W",
  city: "Idaho Falls",
  state: "ID",
  zip: "83401",
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
const redfinHome = {
  ...home,
  id: "redfin-111261092",
  provider: "redfin",
  city: "Sandpoint",
  zip: "83864",
  sourceUrl: "https://www.redfin.com/ID/Sandpoint/414-4th-Ave-W/home/111261092",
};
const extra = {
  bedrooms: 3,
  bathrooms: 2,
  squareFeet: 1200,
  description: "Fixture rental description supplied by the saved property cache.",
  images: ["https://images.example.org/one.jpg", "https://images.example.org/two.jpg"],
  amenities: ["Central air"],
  priceHistory: [],
  taxHistory: [],
};
const vehicle = {
  id: "marketcheck-fsbo-fixture-vehicle",
  providerId: "fixture-vehicle",
  sourceKind: "fsbo",
  heading: "Fixture vehicle",
  price: 20000,
  location: { city: "Burley", state: "ID", latitude: 42.5, longitude: -113.8 },
  build: {},
  raw: {},
  extra: {},
  media: {
    photoLinks: [],
    photoLinksCached: [
      "https://platform.cstatic-images.com/bluebird-share-fixture-missing.jpg",
      "https://platform.cstatic-images.com/bluebird-share-fixture-blue.jpg",
    ],
  },
};
let mode = "healthy";
const calls = [],
  external = [],
  results = [],
  pending = [];
const imageChecks = [];
const originalFetch = globalThis.fetch;
const originalError = console.error;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input.href));
  if (
    url.hostname === "platform.cstatic-images.com" &&
    ["/bluebird-share-fixture-missing.jpg", "/bluebird-share-fixture-blue.jpg"].includes(
      url.pathname,
    )
  ) {
    assert.equal(init.method, "HEAD", "partner fallback must not download image bodies");
    assert.equal(init.redirect, "manual");
    imageChecks.push({ path: url.pathname, method: init.method });
    return new Response(null, {
      status: url.pathname.includes("missing") ? 404 : 200,
      headers: { "content-type": "image/jpeg" },
    });
  }
  if (!["127.0.0.1", "udxxfuticbxwiehoepeg.supabase.co"].includes(url.hostname)) {
    external.push(url.hostname);
    throw new Error("Unexpected external network in SSR fixture");
  }
  calls.push({ path: url.pathname, method: init.method ?? "GET", search: url.search });
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
  if (
    url.pathname === "/rest/v1/marketcheck_cache" &&
    url.searchParams.get("payload")?.includes("fixture-vehicle")
  ) {
    body = [{ cache_key: '{"v":1,"kind":"fsbo"}', payload: { listings: [vehicle] } }];
  }
  if (url.pathname === "/rest/v1/openwebninja_cache") {
    const searches = url.searchParams.get("cache_key")?.includes("search");
    if (!searches && mode === "home-offline")
      return Response.json({ message: "Fixture property cache unavailable" }, { status: 503 });
    body = searches
      ? [
          {
            cache_key:
              '{"v":3,"kind":"area-search","area":"eastern-idaho","mode":"rent","provider":"realestate","page":1}',
            payload: { homes: [home] },
            expires_at: new Date(Date.now() + 8 * 86400000).toISOString(),
          },
          {
            cache_key:
              '{"v":3,"kind":"area-search","area":"north-idaho","mode":"rent","provider":"redfin","page":1}',
            payload: { homes: [redfinHome] },
            expires_at: new Date(Date.now() + 8 * 86400000).toISOString(),
          },
        ]
      : [
          {
            cache_key: JSON.stringify({
              v: 4,
              kind: "property",
              id: url.searchParams.get("cache_key")?.includes("redfin-") ? redfinHome.id : home.id,
            }),
            expires_at: new Date(
              Date.now() + (mode === "home-stale" ? -1 : 31) * 86400000,
            ).toISOString(),
            payload: mode === "home-incomplete" ? { ...extra, description: null } : extra,
          },
        ];
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
      assert.match(html, /property="og:image" content="https:\/\/images.example.org\/one.jpg"/);
      assert.match(html, /name="twitter:image" content="https:\/\/images.example.org\/one.jpg"/);
      assert.ok(
        html.includes(
          '"image":["https://images.example.org/one.jpg","https://images.example.org/two.jpg"]',
        ),
      );
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
  await render("/listings/openwebninja-redfin-111261092", 200);
  // Previously advertised partner image URLs must also recover, even with a
  // normal browser UA. No API budget reservation or external fetch is allowed.
  for (const [path, status, location] of [
    ["/media/listings/openwebninja-111261092/0", 302, extra.images[0]],
    ["/media/listings/openwebninja-redfin-111261092/1", 302, extra.images[1]],
    ["/media/listings/openwebninja-111261092/1", 302, extra.images[1]],
    ["/media/listings/openwebninja-111261092/2", 404, null],
    ["/media/listings/marketcheck-fsbo-fixture-vehicle/0", 302, vehicle.media.photoLinksCached[1]],
    ["/media/listings/marketcheck-fsbo-missing/0", 404, null],
  ]) {
    calls.length = 0;
    const response = await worker.fetch(
      new Request("https://onbluebird.com" + path, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }),
      {},
      { waitUntil: (task) => pending.push(task) },
    );
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("Location"), location);
    assert.ok(
      calls.every((call) => call.method === "GET"),
      "photo lookup cannot reserve provider budget or write cache",
    );
    assert.equal(
      calls.some((call) => call.path === "/rest/v1/asks"),
      false,
    );
    if (path.includes("fixture-vehicle")) {
      const searches = calls.filter(
        (call) => call.path === "/rest/v1/marketcheck_cache" && call.search.includes("limit="),
      );
      assert.equal(searches.length, 1);
      assert.ok(new URLSearchParams(searches[0].search).get("payload").includes("fixture-vehicle"));
    }
    results.push({ path, mode: "partner-photo", status });
  }
  await render("/listings/openwebninja-111261092", 404, "home-incomplete");
  await render("/listings/openwebninja-redfin-111261092", 404, "home-stale");
  await render(native, 404);
  await render("/listings/openwebninja-999999999", 404);
  await render("/listings/not-a-real-listing-id", 404, "malformed");
  await render("/listings/------------------------------------", 404, "malformed");
  await render("/listings/openwebninja-abc", 404, "malformed");
  await render(native, 500, "native-offline");
  await render("/listings/openwebninja-111261092", 500, "home-offline");
  await render(native, 500, "stalled");
  await render("/listings/openwebninja-111261092", 200);
  // Stable photo routes have their own server handler, outside listing-page
  // loaders. Exercise the actual built handler rather than only its mock.
  for (const [path, expected, photoMode] of [
    ["/media/listings/------------------------------------/0", 404, "malformed"],
    ["/media/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/0", 503, "native-offline"],
    ["/media/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/0", 503, "stalled"],
  ]) {
    mode = photoMode;
    calls.length = 0;
    const started = performance.now();
    const response = await worker.fetch(
      new Request("https://onbluebird.com" + path),
      {},
      {
        waitUntil: (task) => pending.push(task),
      },
    );
    const body = await response.text();
    const milliseconds = Math.round(performance.now() - started);
    assert.equal(response.status, expected, path + ": " + mode);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("location"), null);
    assert.equal(body.includes("sb_secret_fixture"), false);
    if (mode === "malformed") assert.equal(calls.length, 0);
    else {
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.equal(calls.filter((call) => call.path === "/rest/v1/asks").length, 1);
    }
    if (mode === "stalled") assert.ok(milliseconds < 12000);
    results.push({ path, mode, status: response.status, milliseconds });
  }
  // A valid public-CDN descriptor must still be denied before any source read.
  const importModule = readdirSync(".output/server/_ssr").find(
    (name) => name.startsWith("fb-import.functions-") && name.endsWith(".mjs"),
  );
  assert.ok(importModule, "compiled import module exists");
  const importCode = readFileSync(".output/server/_ssr/" + importModule, "utf8");
  const actionId = importCode.match(
    /id:\s*"([^"]+)",\s*name:\s*"prepareFacebookImportPhotoPreviewSource"/,
  )?.[1];
  assert.ok(actionId, "compiled private source handoff action exists");
  calls.length = 0;
  const privateResponse = await worker.fetch(
    new Request("https://onbluebird.com/_serverFn/" + actionId, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://onbluebird.com",
        "Sec-Fetch-Site": "same-origin",
        "x-tsr-serverFn": "true",
      },
      body: JSON.stringify(
        toJSON({
          data: {
            url: "https://images.vinted.net/never-read.jpg",
            sourceSha256: "a".repeat(64),
            bytes: 3,
            contentType: "image/jpeg",
          },
          context: {},
        }),
      ),
    }),
    {},
    { waitUntil: (task) => pending.push(task) },
  );
  const privateBody = await privateResponse.text();
  // TanStack RPC transports typed application errors in a 200 JSON envelope.
  // Inspect that error rather than mistaking transport success for access.
  assert.equal(privateResponse.status, 200);
  const envelope = JSON.parse(privateBody);
  const denied = envelope.p.v[envelope.p.k.indexOf("error")];
  assert.equal(denied.c, "$TSR/Error");
  assert.equal(denied.s.message.s, "Unauthorized: No authorization header provided");
  assert.equal(calls.length, 0, "missing authorization must not read the database or CDN");
  assert.equal(privateBody.includes("base64"), false);
  assert.equal(privateBody.includes("sb_secret_fixture"), false);
  results.push({
    path: "/_serverFn/[import-photo-source]",
    mode: "anonymous-denied",
    status: privateResponse.status,
    authorized: false,
    sourceReads: calls.length,
  });
  assert.deepEqual(external, [], "SSR must not contact a provider or other external host");
  assert.equal(imageChecks.length, 2, "one bounded HEAD per missing lead and valid fallback");
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
