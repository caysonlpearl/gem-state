import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const m = loadPhotoModules()("./r2-photo-storage.server");
const config = {
  accountId: "a".repeat(32),
  accessKeyId: "b".repeat(32),
  secretAccessKey: "c".repeat(64),
  buckets: { "listing-media": "bluebird-listing-media", "ask-evidence": "bluebird-ask-evidence" },
};

test("immutable card URLs remain reusable across workers within an hour without extending expiry", async () => {
  let now = Date.parse("2026-11-03T03:05:00Z");
  let network = 0;
  const fetcher = async () => {
    network++;
    throw new Error("signing must not fetch");
  };
  const key = `thumbnail/v1/${"d".repeat(64)}/${"e".repeat(64)}`;
  const store = m.createR2PhotoStore(config, fetcher, () => now);
  const first = await store.sign("listing-media", key, 86400);
  now = Date.parse("2026-11-03T03:59:59Z");
  const otherWorker = m.createR2PhotoStore(config, fetcher, () => now);
  assert.equal(await otherWorker.sign("listing-media", key, 86400), first);
  const params = new URL(first).searchParams;
  assert.equal(params.get("X-Amz-Date"), "20261103T030000Z");
  assert.equal(params.get("X-Amz-Expires"), "86400");
  const expiry = Date.parse("2026-11-04T03:00:00Z");
  assert.ok(expiry > now + 23 * 3600000);
  assert.ok(expiry <= now + 24 * 3600000);
  now = Date.parse("2026-11-03T04:00:00Z");
  assert.notEqual(await store.sign("listing-media", key, 86400), first);
  assert.equal(network, 0);
});

test("short previews, original photos, evidence and signed uploads keep their exact signing time", async () => {
  let now = Date.parse("2026-11-03T03:05:37Z");
  const store = m.createR2PhotoStore(config, undefined, () => now);
  const thumb = `thumbnail/v1/${"d".repeat(64)}/${"e".repeat(64)}`;
  for (const [bucket, key, ttl] of [
    ["listing-media", "original/v1/key", 3600],
    ["listing-media", thumb, 600],
    ["ask-evidence", thumb, 86400],
  ]) {
    const url = new URL(await store.sign(bucket, key, ttl));
    assert.equal(url.searchParams.get("X-Amz-Date"), "20261103T030537Z");
    assert.equal(url.searchParams.get("X-Amz-Expires"), String(ttl));
  }
  const ticket = await store.signUpload(
    "listing-media",
    "original/v1/key",
    5,
    "image/jpeg",
    "d".repeat(64),
  );
  assert.equal(new URL(ticket.url).searchParams.get("X-Amz-Date"), "20261103T030537Z");
  assert.equal(new URL(ticket.url).searchParams.get("X-Amz-Expires"), "900");
});

test("R2 presigned uploads bind length, type, immutable key and checksum without exposing secret key", async () => {
  let calls = 0;
  const store = m.createR2PhotoStore(config, async () => {
    calls++;
    throw new Error("must not fetch");
  });
  const signed = await store.signUpload(
    "listing-media",
    "original/v1/key",
    5,
    "image/jpeg",
    "d".repeat(64),
  );
  const url = new URL(signed.url);
  assert.equal(url.hostname, `${config.accountId}.r2.cloudflarestorage.com`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  for (const name of ["content-length", "content-type", "if-none-match", "x-amz-meta-sha256"])
    assert.ok(url.searchParams.get("X-Amz-SignedHeaders").split(";").includes(name));
  assert.equal(signed.headers["content-length"], undefined);
  assert.equal(signed.headers["content-type"], "image/jpeg");
  assert.equal(JSON.stringify(signed).includes(config.secretAccessKey), false);
  assert.equal(calls, 0);
});

test("GET signing keeps object path encoding and rejects unsupported logical stores and TTLs", async () => {
  const store = m.createR2PhotoStore(config);
  const signed = await store.sign("ask-evidence", "folder/space here?#.jpg", 600);
  assert.ok(signed.includes("space%20here%3F%23.jpg"));
  await assert.rejects(() => store.sign("other", "a.jpg", 600));
  await assert.rejects(() => store.sign("listing-media", "../a.jpg", 600));
  await assert.rejects(() => store.sign("listing-media", "a.jpg", 604801));
});

test("an immutable PUT conflict is not overwritten and still requires verification", async () => {
  const bytes = new TextEncoder().encode("photo");
  const seen = [];
  const store = m.createR2PhotoStore(config, async (request) => {
    seen.push(request);
    return request.method === "PUT" ? new Response(null, { status: 412 }) : new Response(bytes);
  });
  await store.put("listing-media", "photo.jpg", bytes, "image/jpeg");
  await store.verify("listing-media", "photo.jpg", bytes.length, m.photoSha256(bytes));
  assert.equal(seen[0].headers.get("if-none-match"), "*");
  assert.equal(seen.length, 2);
});

test("streamed verification rejects truncated, oversized and mismatched data", async () => {
  const good = new TextEncoder().encode("photo");
  for (const body of [
    good.slice(0, 2),
    new TextEncoder().encode("photos"),
    new TextEncoder().encode("other"),
  ]) {
    const store = m.createR2PhotoStore(config, async () => new Response(body));
    await assert.rejects(() =>
      store.verify("listing-media", "photo.jpg", good.length, m.photoSha256(good)),
    );
  }
});

test("network errors do not disclose a signed request or automatically retry", async () => {
  let calls = 0;
  const store = m.createR2PhotoStore(config, async () => {
    calls++;
    throw new Error("secret signed URL");
  });
  await assert.rejects(
    () => store.available("listing-media"),
    (error) => !error.message.includes("secret"),
  );
  assert.equal(calls, 1);
});

test("per-object availability uses a bounded HEAD and requires receipt-matching metadata", async () => {
  const sha256 = "d".repeat(64);
  for (const [status, length, hash, expected] of [
    [200, "5", sha256, true],
    [404, "5", sha256, false],
    [403, "5", sha256, false],
    [200, "6", sha256, false],
    [200, null, sha256, false],
    [200, "5", null, false],
    [200, "5", "e".repeat(64), false],
  ]) {
    const seen = [];
    const store = m.createR2PhotoStore(config, async (request) => {
      seen.push(request);
      const headers = {};
      if (length !== null) headers["content-length"] = length;
      if (hash !== null) headers["x-amz-meta-sha256"] = hash;
      return new Response(null, { status, headers });
    });
    assert.equal(await store.matches("listing-media", "original/v1/key", 5, sha256), expected);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "HEAD");
    assert.ok(seen[0].signal);
  }
});

test("invalid object-check metadata performs no network request", async () => {
  const store = m.createR2PhotoStore(config, async () => {
    throw new Error("must not fetch");
  });
  assert.equal(await store.matches("listing-media", "original/v1/key", 0, "d".repeat(64)), false);
  assert.equal(await store.matches("listing-media", "original/v1/key", 5, "invalid"), false);
});
