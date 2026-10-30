import test from "node:test";
import assert from "node:assert/strict";
import { serveMerchandiseImage } from "../src/lib/avantlink-images.server.ts";

const image = "https://images.guns.com/prod/photo.jpg?imwidth=1200";
const detail = async () => ({ images: [{ url: image }] });

test("serves the approved product photograph as an image with cache headers", async () => {
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const response = await serveMerchandiseImage("avantlink-1067506", "0", detail, async (url, init) => {
    assert.equal(url.toString(), image);
    assert.equal(init.redirect, "error");
    return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test("rejects arbitrary URLs, unknown products, invalid indexes and unsafe upstreams before fetching", async () => {
  let fetched = 0;
  const fetcher = async () => { fetched++; return new Response(); };
  for (const [id, index, read] of [
    ["https://evil.test", "0", detail],
    ["avantlink-1067506", "3", detail],
    ["avantlink-1067506", "0", async () => null],
    ["avantlink-1067506", "1", detail],
    ...["https://evil.test/photo.jpg", "http://images.guns.com/prod/a.jpg", "https://images.guns.com:444/prod/a.jpg", "https://images.guns.com/admin"].map(url =>
      ["avantlink-1067506", "0", async () => ({ images: [{ url }] })]),
  ]) {
    assert.equal((await serveMerchandiseImage(id, index, read, fetcher)).status, 404);
  }
  assert.equal(fetched, 0);
});

test("never serves blocked HTML or oversized photos as usable images", async () => {
  for (const upstream of [
    new Response("Blocked", { status: 403, headers: { "content-type": "text/html" } }),
    new Response("Blocked", { headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } }),
  ]) {
    const r = await serveMerchandiseImage("avantlink-1067506", "0", detail, async () => upstream);
    assert.equal(r.status, 502);
    assert.equal(r.headers.has("cache-control"), false);
  }
});