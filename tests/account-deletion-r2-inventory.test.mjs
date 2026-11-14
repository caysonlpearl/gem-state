import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import {
  r2FixtureConfig,
  r2ListXml,
  r2XmlResponse,
} from "./helpers/account-deletion-r2-database.mjs";
const load = loadPhotoModules();
const { createAccountDeletionR2Inventory } = load("./account-deletion-r2-inventory.server");
const { createAccountDeletionPhotoEraser } = load("./account-deletion-photo.server");
const { photoSha256 } = load("./r2-photo-storage.server");
const unavailable = (e) =>
  e.code === "inventory_unavailable" && e.message === "inventory_unavailable" && !e.cause;
const signal = () => AbortSignal.timeout(15000);
function fixture({ authorize = async () => true, response, config = r2FixtureConfig() } = {}) {
  const requests = [],
    auth = [];
  const provider = createAccountDeletionR2Inventory(
    config,
    async (t, s) => {
      auth.push(t);
      assert(Object.isFrozen(t));
      return authorize(t, s);
    },
    async (request) => {
      requests.push(request);
      return response
        ? response(request, requests)
        : r2XmlResponse(r2ListXml(new URL(request.url), ["a".repeat(64), "b".repeat(64)]));
    },
  );
  const target = {
    bucket: "listing-media",
    path: "fixture-member/photo.jpg",
    pathHash: photoSha256("fixture-member/photo.jpg"),
    variant: "original",
    storeFingerprint: provider.fingerprint("listing-media"),
  };
  return { provider, target, requests, auth, config };
}
test("R2 inventory lists old and new hash copies using signed bounded metadata reads, without downloading private bytes", async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  const p = await f.provider.scan(f.target, signal());
  assert.equal(p.done, true);
  assert.equal(p.nextCursor, null);
  assert.equal(p.objects.length, 2);
  assert.equal(f.auth.length, 2);
  assert(Object.isFrozen(p.objects));
  assert.deepEqual(Object.keys(p.objects[0]), ["key", "sha256", "bytes", "etag", "modifiedAt"]);
  assert(!JSON.stringify(p).includes("PRIVATE-NAME"));
  const request = f.requests[0],
    url = new URL(request.url);
  assert.equal(request.method, "GET");
  assert.equal(request.redirect, "error");
  assert.equal(request.cache, "no-store");
  assert.equal(url.origin, `https://${f.config.accountId}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname, "/fixture-listing-media");
  assert.equal(url.searchParams.get("prefix"), `original/v1/${photoSha256(f.target.path)}/`);
  assert.equal(url.searchParams.get("max-keys"), "50");
  assert.equal(url.searchParams.get("list-type"), "2");
  assert.equal(url.searchParams.get("encoding-type"), "url");
  assert(!url.searchParams.has("delimiter"));
  assert(request.headers.get("authorization").startsWith("AWS4-HMAC-SHA256"));
  assert.equal(
    f.provider.fingerprint("listing-media"),
    createAccountDeletionPhotoEraser(f.config, async () => true).fingerprint("listing-media"),
  );
});
test("R2 listing preserves opaque continuation tokens and isolates evidence/thumbnail prefixes", async () => {
  const token = "opaque/+&=next";
  for (const [bucket, variant] of [
    ["listing-media", "thumbnail"],
    ["ask-evidence", "original"],
  ]) {
    const f = fixture({
      response: (request) => {
        const url = new URL(request.url);
        return r2XmlResponse(
          r2ListXml(url, ["a".repeat(64)], {
            next: url.searchParams.has("continuation-token") ? null : token,
          }),
        );
      },
    });
    const target = {
      ...f.target,
      bucket,
      variant,
      storeFingerprint: f.provider.fingerprint(bucket),
    };
    const first = await f.provider.scan(target, signal(), null, 1);
    assert.equal(first.nextCursor, token);
    assert.equal(first.done, false);
    const second = await f.provider.scan(target, signal(), token, 1);
    assert.equal(second.done, true);
    assert.equal(new URL(f.requests[1].url).searchParams.get("continuation-token"), token);
    assert(new URL(f.requests[0].url).searchParams.get("prefix").startsWith(`${variant}/v1/`));
  }
});
test("R2 inventory rejects malformed XML, wrong scope, missing counts, duplicate keys and nonprogressing pagination", async () => {
  const patches = [
    (xml) => xml.replace("fixture-listing-media", "other-bucket"),
    (xml) => xml.replace(/<Prefix>.*?<\/Prefix>/, "<Prefix>wrong</Prefix>"),
    (xml) => xml.replace("<EncodingType>url</EncodingType>", ""),
    (xml) => xml.replace("<KeyCount>2</KeyCount>", "<KeyCount>1</KeyCount>"),
    (xml) => xml.replace("<MaxKeys>50</MaxKeys>", "<MaxKeys>1000</MaxKeys>"),
    (xml) => xml.replace("<IsTruncated>false</IsTruncated>", "<IsTruncated>true</IsTruncated>"),
    (xml) => xml.replace("</ListBucketResult>", ""),
    (xml) => '<!DOCTYPE ListBucketResult [<!ENTITY private "secret">]>' + xml,
    (xml) =>
      xml.replace(
        "<Contents>",
        "<CommonPrefixes><Prefix>hidden</Prefix></CommonPrefixes><Contents>",
      ),
    (xml) => xml.replace("b".repeat(64), "a".repeat(64)),
    (xml) => xml.replace("<Size>100</Size>", "<Size>9007199254740992</Size>"),
    (xml) => xml.replace("2026-11-13T12:00:00.000Z", "invalid"),
    (xml) => xml.replace('"' + "e".repeat(32) + '"', "weak-etag"),
  ];
  for (const patch of patches) {
    const f = fixture({
      response: (request) =>
        r2XmlResponse(patch(r2ListXml(new URL(request.url), ["a".repeat(64), "b".repeat(64)]))),
    });
    await assert.rejects(f.provider.scan(f.target, signal()), unavailable);
    assert.equal(f.requests.length, 1);
    assert.equal(f.auth.length, 1);
  }
  const f = fixture({
    response: (request) =>
      r2XmlResponse(r2ListXml(new URL(request.url), ["a".repeat(64)], { next: "same" })),
  });
  await assert.rejects(f.provider.scan(f.target, signal(), "same"), unavailable);
});
test("R2 discovery pins copied configuration and literal path hashes even if the caller changes its input", async () => {
  let f;
  f = fixture({
    authorize: async () => {
      f.config.accountId = "f".repeat(32);
      f.config.buckets["listing-media"] = "other-bucket";
      f.target.path = "different/path";
      f.target.pathHash = "f".repeat(64);
      f.target.variant = "thumbnail";
      return true;
    },
  });
  const originalPath = "fixture/%?literal#name\\.jpg";
  f.target.path = originalPath;
  f.target.pathHash = photoSha256(originalPath);
  await f.provider.scan(f.target, signal());
  const url = new URL(f.requests[0].url);
  assert.equal(url.hostname, `${"a".repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(url.searchParams.get("prefix"), `original/v1/${photoSha256(originalPath)}/`);
  assert.equal(url.pathname, "/fixture-listing-media");
  for (const patch of [
    { storeFingerprint: "f".repeat(64) },
    { bucket: "profile-avatars" },
    { bucket: "ask-evidence", variant: "thumbnail" },
    { path: "" },
    { pathHash: "invalid" },
  ]) {
    const denied = fixture();
    await assert.rejects(
      denied.provider.scan({ ...denied.target, ...patch }, signal()),
      unavailable,
    );
    assert.equal(denied.requests.length, 0);
  }
});
test("R2 discovery refuses invalid configuration and pre-cancelled work before requesting the provider", async () => {
  for (const patch of [
    { accountId: "other-account" },
    { accessKeyId: 123 },
    { secretAccessKey: "" },
    { accessKeyId: "key\nvalue" },
    { buckets: { "listing-media": "same-bucket", "ask-evidence": "same-bucket" } },
  ]) {
    assert.throws(
      () => createAccountDeletionR2Inventory({ ...r2FixtureConfig(), ...patch }, async () => true),
      unavailable,
    );
  }
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(f.provider.scan(f.target, controller.signal), unavailable);
  assert.equal(f.requests.length, 0);
  assert.equal(f.auth.length, 0);
});
test("R2 discovery cancels unfinished bodies, bounds response bytes and sanitizes denied/provider errors without retries", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const hanging = fixture({
    response: async () =>
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(new TextEncoder().encode("<ListBucketResult>"));
            setTimeout(() => controller.abort(), 10);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "application/xml" } },
      ),
  });
  await assert.rejects(hanging.provider.scan(hanging.target, controller.signal), unavailable);
  assert.equal(cancelled, true);
  for (const response of [
    () => r2XmlResponse("x".repeat(1024 * 1024 + 1)),
    () => new Response("private@example.invalid", { status: 403 }),
    () => new Response("redirect", { status: 302 }),
    (request) => {
      throw Error(request.url + request.headers.get("authorization"));
    },
  ]) {
    const f = fixture({ response });
    await assert.rejects(f.provider.scan(f.target, signal()), unavailable);
    assert.equal(f.requests.length, 1);
  }
  for (const refuseAt of [1, 2]) {
    let n = 0;
    const f = fixture({ authorize: async () => (++n === refuseAt ? false : true) });
    await assert.rejects(f.provider.scan(f.target, signal()), unavailable);
    assert.equal(f.requests.length, refuseAt - 1);
  }
});
