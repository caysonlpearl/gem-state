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
