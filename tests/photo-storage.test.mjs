import test from "node:test";
import assert from "node:assert/strict";
import { photoStorageFixture, loadPhotoModules } from "./photo-storage-fixture.mjs";

test("completed migrations resume from verified receipts without repeating source egress or writes", async () => {
  const f = photoStorageFixture();
  const entries = ["ask-evidence", "listing-media"].map((bucket) => ({
    bucket,
    path: f.path,
    expected: f.metadata,
  }));
  await f.store.migrate(entries, f.content.length);
  const writes = f.state.puts.length;
  const resumed = await f.store.migrate(entries, f.content.length);
  assert.equal(resumed.downloadedBytes, 0);
  assert.equal(resumed.receipts.length, 2);
  assert.equal(f.state.sourceDownloads, 1);
  assert.equal(f.state.puts.length, writes);
  const receipt = f.state.records.get(`listing-media/${f.path}`);
  f.state.r2.delete(`listing-media/${receipt.thumbnailKey}`);
  await assert.rejects(() => f.store.migrate(entries, f.content.length), /checksum/);
  assert.equal(f.state.sourceDownloads, 1);
});

test("Supabase mode does not read migration tables, touch R2 or generate thumbnails", async () => {
  const f = photoStorageFixture("supabase");
  await f.store.upload(f.path, f.content, "image/jpeg");
  const urls = await f.store.sign("listing-media", [f.path]);
  await f.store.copy("listing-media", f.path, "new/photo.jpg");
  assert.equal(f.state.sourceUploads, 2);
  assert.equal(f.state.receiptReads, 0);
  assert.equal(f.state.puts.length, 0);
  assert.equal(f.state.reservations.length, 0);
  assert.equal(f.state.sourceCopies.length, 1);
  assert.match(urls.get(f.path), /^source:/);
});

test("R2 originals and small card variants get independent byte checks before receipts", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  assert.equal(f.state.puts.length, 3);
  assert.equal(f.state.checks.length, 3);
  assert.equal(f.state.records.size, 2);
  assert.equal(f.state.sourceUploads, 0);
  const original = await f.store.sign("listing-media", [f.path]);
  const small = await f.store.sign("listing-media", [f.path], 86400, true);
  assert.match(original.get(f.path), /original\/v1/);
  assert.match(small.get(f.path), /thumbnail\/v1/);
  assert.notEqual(original.get(f.path), small.get(f.path));
});

test("outages and missing receipts retain source images rather than losing all cards", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  f.state.healthy = false;
  const urls = await f.store.sign("listing-media", [f.path, "seller/legacy.jpg"]);
  assert.equal(urls.size, 2);
  assert.match(urls.get(f.path), /^source:/);
  f.state.failReceipts = true;
  assert.equal((await f.store.sign("ask-evidence", [f.path])).size, 1);
});

test("unverified or wrong-store rows cannot publish private R2 links", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  const receipt = f.state.records.get(`listing-media/${f.path}`);
  f.state.records.set(`listing-media/${f.path}`, { ...receipt, bucket: "ask-evidence" });
  assert.match((await f.store.sign("listing-media", [f.path])).get(f.path), /^source:/);
  f.state.records.set(`listing-media/${f.path}`, { ...receipt, verifiedAt: null });
  assert.match((await f.store.sign("listing-media", [f.path])).get(f.path), /^source:/);
});

test("failed verification commits no receipt; mirror failures retain successful source uploads", async () => {
  const strict = photoStorageFixture();
  strict.state.failVerify = true;
  await assert.rejects(
    () => strict.store.upload(strict.path, strict.content, "image/jpeg"),
    /checksum/,
  );
  assert.equal(strict.state.records.size, 0);
  const mirror = photoStorageFixture("mirror");
  mirror.state.failVerify = true;
  await mirror.store.upload(mirror.path, mirror.content, "image/jpeg");
  assert.equal(mirror.state.sourceUploads, 2);
  assert.equal(mirror.state.records.size, 0);
  assert.equal(mirror.state.warnings.length, 1);
});

test("budget rejection happens before any R2 write", async () => {
  const f = photoStorageFixture();
  f.state.failReserve = true;
  await assert.rejects(() => f.store.upload(f.path, f.content, "image/jpeg"), /budget/);
  assert.equal(f.state.puts.length, 0);
});

test("seller claim copies preserve private buckets and reuse verified immutable bytes", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  const puts = f.state.puts.length;
  await f.store.copy("ask-evidence", f.path, "new-seller/claimed.jpg");
  assert.equal(f.state.puts.length, puts);
  assert.equal(f.state.sourceCopies.length, 0);
  const source = f.state.records.get(`ask-evidence/${f.path}`);
  const target = f.state.records.get("ask-evidence/new-seller/claimed.jpg");
  assert.equal(source.key, target.key);
  assert.equal(target.bucket, "ask-evidence");
  await f.store.copy("listing-media", "legacy/photo.jpg", "new/legacy.jpg");
  assert.equal(f.state.sourceCopies.length, 1);
});

test("one matching photo pair downloads once, checks its source ETag and verifies both targets", async () => {
  const f = photoStorageFixture("supabase");
  const entries = ["ask-evidence", "listing-media"].map((bucket) => ({
    bucket,
    path: f.path,
    expected: f.metadata,
  }));
  const result = await f.store.migrate(entries, f.content.length);
  assert.equal(result.downloadedBytes, f.content.length);
  assert.equal(result.receipts.length, 2);
  assert.equal(f.state.sourceDownloads, 1);
  assert.equal(f.state.records.size, 2);
  assert.equal(f.state.checks.length, 3);
  assert.equal(f.state.sourceCopies.length, 0);
});

test("changed source metadata and insufficient/invalid budgets prevent source-photo downloads", async () => {
  for (const budget of [0, 1, Infinity, NaN]) {
    const f = photoStorageFixture();
    await assert.rejects(() =>
      f.store.migrate([{ bucket: "listing-media", path: f.path, expected: f.metadata }], budget),
    );
    assert.equal(f.state.sourceDownloads, 0);
  }
  const f = photoStorageFixture();
  f.state.info = () => ({ ...f.metadata, etag: "changed" });
  await assert.rejects(
    () => f.store.migrate([{ bucket: "listing-media", path: f.path, expected: f.metadata }], 1000),
    /changed/,
  );
  assert.equal(f.state.sourceDownloads, 0);
});

test("false paired ETags cannot mark different bytes as migrated", async () => {
  const f = photoStorageFixture();
  const expected = { ...f.metadata, etag: "a".repeat(32) };
  f.state.info = () => expected;
  await assert.rejects(
    () =>
      f.store.migrate(
        ["listing-media", "ask-evidence"].map((bucket) => ({ bucket, path: f.path, expected })),
        1000,
      ),
    /ETag/,
  );
  assert.equal(f.state.puts.length, 0);
  assert.equal(f.state.records.size, 0);
});

test("path and source timestamp normalization preserve legitimate keys and reject traversal", () => {
  const m = loadPhotoModules()("./photo-storage");
  for (const path of [
    "/photo.jpg",
    "seller/../photo.jpg",
    "seller\\photo.jpg",
    "seller//photo.jpg",
  ])
    assert.throws(() => m.photoPath(path));
  assert.equal(m.photoPath("seller/space here.jpg"), "seller/space here.jpg");
  assert.equal(
    m.samePhotoSource(
      {
        bytes: 1,
        contentType: "image/jpeg",
        etag: '"abc"',
        updatedAt: "2026-11-01T00:00:00.000000Z",
      },
      { bytes: 1, contentType: "image/jpeg", etag: "abc", updatedAt: "2026-11-01T00:00:00Z" },
    ),
    true,
  );
});
