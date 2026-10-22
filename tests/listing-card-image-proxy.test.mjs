import test from "node:test";
import assert from "node:assert/strict";
import {
  priorityListingCardImageUrl,
  listingCardImageFallbacks,
} from "../src/lib/listing-card-image.ts";
import { serveListingCardImage } from "../src/lib/listing-card-image.server.ts";
const file = "00x0x_accRZPM5AdB_0CI0t2_600x450.jpg";
const path = "/media/listing-card/" + file;
const original = "https://images.craigslist.org/" + file.replace("600x450", "1200x900");
const jpeg = () =>
  new Response(new Uint8Array([255, 216, 255, 224, 1, 2, 3]), {
    headers: { "Content-Type": "image/jpeg", "Set-Cookie": "untrusted=1" },
  });
const request = (suffix = "", init) => new Request("https://onbluebird.com" + path + suffix, init);
function cache() {
  const entries = new Map();
  return {
    entries,
    async match(key) {
      return entries.get(key.url)?.clone();
    },
    async put(key, response) {
      entries.set(key.url, response.clone());
    },
  };
}
test("only exact public Craigslist thumbnails become same-origin priority images", () => {
  assert.equal(priorityListingCardImageUrl(original), path);
  assert.equal(priorityListingCardImageUrl(original.replace("1200x900", "600x450")), path);
  for (const url of [
    original + "?signed=1",
    original + "#hash",
    original.replace("https:", "http:"),
    original.replace("images.craigslist.org", "images.craigslist.org.evil.test"),
    "https://dealer.test/car.jpg",
    "/local.jpg",
    "invalid",
  ])
    assert.ok(!priorityListingCardImageUrl(url).startsWith("/media/listing-card/"));
});
test("fallback order preserves direct thumbnail then original, without loops", () => {
  assert.deepEqual(listingCardImageFallbacks(original, true), [
    original.replace("1200x900", "600x450"),
    original,
  ]);
  assert.deepEqual(listingCardImageFallbacks(original), [original]);
  assert.deepEqual(listingCardImageFallbacks(original.replace("1200x900", "600x450"), true), [
    original.replace("1200x900", "600x450"),
  ]);
  assert.deepEqual(listingCardImageFallbacks("https://dealer.test/car.jpg", true), []);
});
test("successful JPEG is cached with a clean key and no upstream cookies", async () => {
  const store = cache();
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://images.craigslist.org/" + file);
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.deepEqual(init.headers, { Accept: "image/jpeg" });
    assert.ok(init.signal instanceof AbortSignal);
    return jpeg();
  };
  const first = await serveListingCardImage(
    request("", { headers: { Cookie: "private=not-forwarded", Authorization: "not-forwarded" } }),
    { cache: store, fetch },
  );
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("X-Bluebird-Image-Cache"), "miss");
  assert.equal(first.headers.get("Set-Cookie"), null);
  assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(first.headers.get("Cache-Control"), /max-age=86400/);
  assert.equal((await first.arrayBuffer()).byteLength, 7);
  const second = await serveListingCardImage(request(), { cache: store, fetch });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("X-Bluebird-Image-Cache"), "hit");
  assert.equal(calls, 1);
  assert.deepEqual([...store.entries.keys()], ["https://onbluebird.com" + path]);
});
test("HEAD has no body and can reuse a cached full image", async () => {
  const store = cache();
  let calls = 0;
  const options = {
    cache: store,
    fetch: async () => {
      calls++;
      return jpeg();
    },
  };
  const first = await serveListingCardImage(request("", { method: "HEAD" }), options);
  assert.equal(first.status, 200);
  assert.equal(await first.text(), "");
  const second = await serveListingCardImage(request(), options);
  assert.equal((await second.arrayBuffer()).byteLength, 7);
  assert.equal(calls, 1);
});
test("rejects arbitrary URLs, queries, traversal and methods without upstream requests", async () => {
  const fetch = async () => {
    throw new Error("must not fetch");
  };
  for (const url of [
    "https://onbluebird.com" + path + "?url=https://private.test",
    "https://onbluebird.com/media/listing-card/%2Fetc_600x450.jpg",
    "https://onbluebird.com/media/listing-card/../../private",
    "https://onbluebird.com/media/listing-card/image.svg",
    "https://onbluebird.com/media/listing-card/" + "a".repeat(161) + "_600x450.jpg",
  ]) {
    assert.equal((await serveListingCardImage(new Request(url), { fetch })).status, 404);
  }
  const response = await serveListingCardImage(request("", { method: "POST" }), { fetch });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, HEAD");
});
test("upstream errors, redirects, HTML and oversized streams are never cached", async () => {
  const responses = [
    new Response("gone", { status: 404 }),
    new Response("limited", { status: 429 }),
    new Response("redirect", { status: 302, headers: { Location: "https://private.test" } }),
    new Response("<html>bad</html>", { headers: { "Content-Type": "image/jpeg" } }),
    new Response("bad", { headers: { "Content-Type": "text/html" } }),
    new Response(new Uint8Array(524289), { headers: { "Content-Type": "image/jpeg" } }),
    new Response("small", {
      headers: { "Content-Type": "image/jpeg", "Content-Length": "524289" },
    }),
  ];
  for (const upstream of responses) {
    const store = cache();
    const response = await serveListingCardImage(request(), {
      cache: store,
      fetch: async () => upstream,
    });
    assert.ok([404, 502].includes(response.status));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(store.entries.size, 0);
  }
});
test("cache failures and unavailable cache do not hide a valid image", async () => {
  const broken = {
    match: async () => {
      throw new Error("unavailable");
    },
    put: async () => {
      throw new Error("unavailable");
    },
  };
  assert.equal(
    (await serveListingCardImage(request(), { cache: broken, fetch: async () => jpeg() })).status,
    200,
  );
  assert.equal((await serveListingCardImage(request(), { fetch: async () => jpeg() })).status, 200);
  assert.equal(
    (
      await serveListingCardImage(request(), {
        fetch: async () => {
          throw new Error("timeout");
        },
      })
    ).status,
    502,
  );
});
test("cache writes can use runtime lifetime without delaying the response", async () => {
  let complete;
  let work;
  const store = {
    match: async () => undefined,
    put: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  };
  const response = await serveListingCardImage(request(), {
    cache: store,
    fetch: async () => jpeg(),
    waitUntil: (p) => {
      work = p;
    },
  });
  assert.equal(response.status, 200);
  assert.ok(work instanceof Promise);
  complete();
  await work;
});

test("unrelated cached HTML cannot become an image response", async () => {
  let calls = 0;
  const store = {
    match: async () => new Response("old route", { headers: { "Content-Type": "text/html" } }),
    put: async () => {},
  };
  const response = await serveListingCardImage(request(), {
    cache: store,
    fetch: async () => {
      calls++;
      return jpeg();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(calls, 1);
});
