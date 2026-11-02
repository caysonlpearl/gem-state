import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules, photoStorageFixture } from "./photo-storage-fixture.mjs";
import { photoSourceFallbackPolicy } from "../src/lib/photo-storage.ts";

const tokenUrl = (exp) =>
  `https://fixture.supabase.co/storage/v1/object/sign/listing-media/photo.jpg?token=h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
const epoch = Date.parse("2026-11-02T00:00:00Z");

test("an absent cutoff preserves fallback, valid explicit ISO timestamps expire, malformed dates fail closed", () => {
  assert.deepEqual(photoSourceFallbackPolicy(" ", epoch), {
    state: "unrestricted",
    expiresAt: null,
  });
  assert.deepEqual(photoSourceFallbackPolicy("2026-11-03T00:00:00Z", epoch), {
    state: "until",
    expiresAt: epoch + 86400000,
  });
  assert.deepEqual(photoSourceFallbackPolicy("2026-11-02T01:00:00+01:00", epoch), {
    state: "expired",
    expiresAt: epoch,
  });
  for (const value of [
    "tomorrow",
    "2026-11-03",
    "2026-11-03T00:00:00",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-11-03T25:00:00Z",
  ])
    assert.deepEqual(photoSourceFallbackPolicy(value, epoch), { state: "invalid", expiresAt: 0 });
});

test("R2 fallback TTL is clipped and both private stores stop signing after the same absolute deadline", async () => {
  const deadline = epoch + 125500;
  const f = photoStorageFixture("r2", { sourceFallbackExpiresAt: deadline });
  f.state.now = epoch;
  f.source.sign = async (bucket, paths, seconds, thumbnail) => {
    f.state.sourceSigns.push({ bucket, paths, seconds, thumbnail });
    return new Map(paths.map((path) => [path, tokenUrl(Math.floor(f.state.now / 1000) + seconds)]));
  };
  for (const bucket of ["listing-media", "ask-evidence"]) {
    const urls = await f.store.sign(bucket, [f.path], 86400, true);
    assert.equal(urls.size, 1);
  }
  assert.deepEqual(
    f.state.sourceSigns.map((call) => call.seconds),
    [125, 125],
  );
  f.state.now = deadline;
  for (const bucket of ["listing-media", "ask-evidence"])
    assert.equal((await f.store.sign(bucket, [f.path], 86400)).size, 0);
  assert.equal(f.state.sourceSigns.length, 2, "expiry never calls the old signer again");
});

test("actual token expiry prevents slow signing and provider clock skew from extending fallback", async () => {
  const cutoff = epoch + 100000;
  const f = photoStorageFixture("r2", { sourceFallbackExpiresAt: cutoff });
  f.state.now = epoch;
  f.source.sign = async (_bucket, paths, seconds) => {
    assert.equal(seconds, 100);
    f.state.now += 10000;
    return new Map(paths.map((path) => [path, tokenUrl(f.state.now / 1000 + seconds)]));
  };
  assert.equal((await f.store.sign("listing-media", [f.path], 3600)).size, 0);
  f.state.now = epoch;
  f.source.sign = async (_bucket, paths) =>
    new Map(paths.map((path) => [path, tokenUrl(epoch / 1000 + 90)]));
  assert.equal((await f.store.sign("listing-media", [f.path], 3600)).size, 1);
  for (const u of [
    tokenUrl(epoch / 1000 - 1),
    tokenUrl(epoch / 1000 + 101),
    tokenUrl("future"),
    tokenUrl(null),
    "https://fixture.invalid/no-token",
    "https://fixture.invalid/?token=bad",
    `https://fixture.invalid/?token=h.${"a".repeat(8193)}.s`,
  ]) {
    f.source.sign = async (_bucket, paths) => new Map(paths.map((path) => [path, u]));
    assert.equal((await f.store.sign("listing-media", [f.path], 3600)).size, 0);
  }
  f.source.sign = async (_bucket, paths) => {
    f.state.now = cutoff + 1;
    return new Map(paths.map((path) => [path, tokenUrl(epoch / 1000 + 99)]));
  };
  assert.equal((await f.store.sign("listing-media", [f.path], 3600)).size, 0);
});

test("expired or malformed fallback does not hide healthy R2 objects or change other read modes", async () => {
  for (const cutoff of [0, epoch - 1, NaN]) {
    const f = photoStorageFixture("r2", { sourceFallbackExpiresAt: cutoff });
    f.state.now = epoch;
    await f.store.migrate(
      ["listing-media", "ask-evidence"].map((bucket) => ({
        bucket,
        path: f.path,
        expected: f.metadata,
      })),
      f.content.length,
    );
    for (const bucket of ["listing-media", "ask-evidence"]) {
      const urls = await f.store.sign(bucket, [f.path], 3600);
      assert.match(urls.get(f.path), /^private:/);
    }
    assert.equal(f.state.sourceSigns.length, 0);
    f.state.failReceipts = true;
    assert.equal((await f.store.sign("listing-media", [f.path], 3600)).size, 0);
    assert.equal(f.state.sourceSigns.length, 0);
  }
  for (const mode of ["supabase", "mirror"]) {
    const f = photoStorageFixture(mode, { sourceFallbackExpiresAt: 0 });
    assert.match((await f.store.sign("listing-media", [f.path], 86400)).get(f.path), /^source:/);
    assert.equal(f.state.sourceSigns[0].seconds, 86400);
  }
  const legacy = photoStorageFixture("r2");
  assert.match(
    (await legacy.store.sign("listing-media", [legacy.path], 86400)).get(legacy.path),
    /^source:/,
  );
});

test("a missing R2 object uses only its bounded fallback while other originals/previews retain R2 links", async () => {
  const f = photoStorageFixture("r2", { sourceFallbackExpiresAt: epoch + 60000 });
  f.state.now = epoch;
  await f.store.migrate(
    ["listing-media", "ask-evidence"].map((bucket) => ({
      bucket,
      path: f.path,
      expected: f.metadata,
    })),
    f.content.length,
  );
  const receipt = f.state.records.get(`listing-media/${f.path}`);
  f.state.r2.delete(`listing-media/${receipt.thumbnailKey}`);
  f.source.sign = async (_bucket, paths) =>
    new Map(paths.map((path) => [path, tokenUrl(epoch / 1000 + 59)]));
  assert.match((await f.store.sign("listing-media", [f.path], 86400, true)).get(f.path), /^https:/);
  assert.match(
    (await f.store.sign("listing-media", [f.path], 86400, false)).get(f.path),
    /^private:/,
  );
  f.state.now = epoch + 60000;
  assert.equal((await f.store.sign("listing-media", [f.path], 86400, true)).size, 0);
  assert.match(
    (await f.store.sign("listing-media", [f.path], 86400, false)).get(f.path),
    /^private:/,
  );
});

test("the server adapter keys its singleton by the fallback cutoff and does not need a new deployment to observe expiry", async () => {
  const env = {};
  let stores = 0;
  const module = loadPhotoModules({
    "./runtime-env.server": { serverEnv: (name) => env[name] ?? "" },
    "@/integrations/supabase/client.server": { supabaseAdmin: {} },
    "./photo-storage-core.server": {
      createPhotoStorage: (options) => ({ ...options, instance: ++stores }),
    },
  })("./photo-storage.server");
  assert.equal(module.currentPhotoSourceFallbackPolicy().state, "unrestricted");
  const first = await module.getPhotoStorage();
  assert.equal(first.sourceFallbackExpiresAt, null);
  env.BLUEBIRD_PHOTO_SOURCE_FALLBACK_UNTIL = "2099-01-01T00:00:00Z";
  const second = await module.getPhotoStorage();
  assert.notEqual(first.instance, second.instance);
  assert.equal(
    second.sourceFallbackExpiresAt,
    Date.parse(env.BLUEBIRD_PHOTO_SOURCE_FALLBACK_UNTIL),
  );
  assert.equal((await module.getPhotoStorage()).instance, second.instance);
  env.BLUEBIRD_PHOTO_SOURCE_FALLBACK_UNTIL = "not a date";
  const invalid = await module.getPhotoStorage();
  assert.equal(invalid.sourceFallbackExpiresAt, 0);
  assert.equal(module.currentPhotoSourceFallbackPolicy().state, "invalid");
});
