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

test("migration reserves source allowance once, immediately before the actual download", async () => {
  const f = photoStorageFixture();
  const entries = [{ bucket: "listing-media", path: f.path, expected: f.metadata }];
  await assert.rejects(
    () =>
      f.store.migrate(entries, f.content.length, undefined, async () => {
        throw new Error("source budget denied");
      }),
    /source budget denied/,
  );
  assert.equal(f.state.sourceDownloads, 0);
  assert.equal(f.state.puts.length, 0);
  let reservations = 0;
  const reserve = async (bytes) => {
    assert.equal(bytes, f.content.length);
    assert.equal(f.state.sourceDownloads, 0);
    reservations++;
  };
  await f.store.migrate(entries, f.content.length, undefined, reserve);
  await f.store.migrate(entries, f.content.length, undefined, () => {
    throw new Error("verified resume must not reserve again");
  });
  assert.equal(reservations, 1);
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

test("missing and altered R2 objects fall back independently while the bucket is healthy", async () => {
  for (const small of [false, true]) {
    const f = photoStorageFixture();
    await f.store.upload(f.path, f.content, "image/jpeg");
    const receipt = f.state.records.get(`listing-media/${f.path}`);
    const key = small ? receipt.thumbnailKey : receipt.key;
    f.state.r2.delete(`listing-media/${key}`);
    assert.match(
      (await f.store.sign("listing-media", [f.path], 600, small)).get(f.path),
      /^source:/,
    );
    // A missing preview does not force the available original onto Supabase, or vice versa.
    assert.match(
      (await f.store.sign("listing-media", [f.path], 600, !small)).get(f.path),
      /^private:/,
    );
    f.state.r2.set(`listing-media/${key}`, new TextEncoder().encode("changed"));
    f.state.now += 30_001;
    assert.match(
      (await f.store.sign("listing-media", [f.path], 600, small)).get(f.path),
      /^source:/,
    );
    assert.equal(f.state.sourceDownloads, 0);
  }
});

test("object checks coalesce concurrent reads and expire before signing stale copies", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  const results = await Promise.all(
    Array.from({ length: 5 }, () => f.store.sign("listing-media", [f.path])),
  );
  assert.ok(results.every((urls) => urls.get(f.path).startsWith("private:")));
  assert.equal(f.state.objectChecks.length, 1);
  const receipt = f.state.records.get(`listing-media/${f.path}`);
  f.state.r2.delete(`listing-media/${receipt.key}`);
  f.state.now += 30_001;
  assert.match((await f.store.sign("listing-media", [f.path])).get(f.path), /^source:/);
  assert.equal(f.state.objectChecks.length, 2);
  assert.equal(f.state.sourceDownloads, 0);
});

test("object-check outages retain source links without downloading originals", async () => {
  const f = photoStorageFixture();
  await f.store.upload(f.path, f.content, "image/jpeg");
  f.state.failObjectCheck = true;
  assert.match((await f.store.sign("listing-media", [f.path])).get(f.path), /^source:/);
  assert.equal(f.state.sourceDownloads, 0);
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

test("mirror receipt outages preserve a verified legacy seller-claim copy", async () => {
  const f = photoStorageFixture("mirror");
  f.state.failReceipts = true;
  await f.store.copy("ask-evidence", f.path, "new/claimed.jpg");
  assert.equal(f.state.sourceCopies.length, 1);
  assert.equal(f.state.warnings.length, 1);
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

test(
  "both pair metadata checks run together before the single source download",
  { timeout: 2000 },
  async () => {
    const f = photoStorageFixture("supabase");
    const gates = Array.from({ length: 2 }, () => {
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      return { promise, release, started: 0 };
    });
    let calls = 0;
    f.state.info = async () => {
      const gate = gates[Math.floor(calls++ / 2)];
      if (++gate.started === 2) gate.release();
      await gate.promise;
      return { ...f.metadata };
    };
    const result = await f.store.migrate(
      ["ask-evidence", "listing-media"].map((bucket) => ({
        bucket,
        path: f.path,
        expected: f.metadata,
      })),
      f.content.length,
    );
    assert.equal(calls, 4);
    assert.equal(result.receipts.length, 2);
    assert.equal(f.state.sourceDownloads, 1);
  },
);

test("a changed second source prevents either target write after downloading", async () => {
  const f = photoStorageFixture("supabase");
  const counts = new Map();
  f.state.info = (bucket) => {
    const count = (counts.get(bucket) ?? 0) + 1;
    counts.set(bucket, count);
    return bucket === "listing-media" && count === 2
      ? { ...f.metadata, etag: "changed" }
      : { ...f.metadata };
  };
  await assert.rejects(
    () =>
      f.store.migrate(
        ["ask-evidence", "listing-media"].map((bucket) => ({
          bucket,
          path: f.path,
          expected: f.metadata,
        })),
        f.content.length,
      ),
    /changed during copying/,
  );
  assert.equal(f.state.sourceDownloads, 1);
  assert.equal(f.state.puts.length, 0);
  assert.equal(f.state.records.size, 0);
});

test(
  "a failed target waits for its paired write to settle before migration rejects",
  { timeout: 2000 },
  async () => {
    const f = photoStorageFixture("supabase");
    let releaseWrite, listingStarted;
    const writeGate = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const started = new Promise((resolve) => {
      listingStarted = resolve;
    });
    f.state.beforePut = async (bucket, key) => {
      if (bucket === "ask-evidence") throw new Error("planned evidence failure");
      if (key.startsWith("original/")) {
        listingStarted();
        await writeGate;
      }
    };
    let settled = false;
    const attempt = f.store
      .migrate(
        ["ask-evidence", "listing-media"].map((bucket) => ({
          bucket,
          path: f.path,
          expected: f.metadata,
        })),
        f.content.length,
      )
      .then(
        () => {
          settled = true;
        },
        (error) => {
          settled = true;
          throw error;
        },
      );
    const rejection = assert.rejects(attempt, /planned evidence failure/);
    await started;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    releaseWrite();
    await rejection;
    assert.equal(f.state.sourceDownloads, 1);
    assert.equal(f.state.records.has(`listing-media/${f.path}`), true);
    assert.equal(f.state.records.has(`ask-evidence/${f.path}`), false);
  },
);

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

test("prepared original reuse verifies both sources and hashes without another source GET", async () => {
  const f = photoStorageFixture();
  const entries = ["listing-media", "ask-evidence"].map((bucket) => ({
    bucket,
    path: f.path,
    expected: f.metadata,
  }));
  let acknowledgements = 0;
  const result = await f.store.migrate(
    entries,
    f.content.length,
    undefined,
    async (bytes) => {
      acknowledgements++;
      assert.equal(bytes, f.content.length);
    },
    f.content,
  );
  assert.equal(result.downloadedBytes, f.content.length);
  assert.equal(f.state.sourceDownloads, 0);
  assert.equal(acknowledgements, 1);
  assert.equal(f.state.records.size, 2);
  const resumed = await f.store.migrate(
    entries,
    f.content.length,
    undefined,
    () => assert.fail("Completed targets cannot reserve or acknowledge again"),
    f.content,
  );
  assert.equal(resumed.downloadedBytes, 0);
  assert.equal(f.state.sourceDownloads, 0);
});

test("prepared original reuse rejects wrong bytes, lengths and changed source metadata before writes", async () => {
  for (const fault of ["length", "hash", "source"]) {
    const f = photoStorageFixture();
    const bytes = f.content.slice();
    if (fault === "hash") bytes[0] ^= 1;
    const expected = {
      ...f.metadata,
      ...(fault === "source" ? { updatedAt: "2020-01-01T00:00:00Z" } : {}),
    };
    await assert.rejects(
      () =>
        f.store.migrate(
          [{ bucket: "listing-media", path: f.path, expected }],
          f.content.length,
          undefined,
          async () => {},
          fault === "length" ? bytes.subarray(1) : bytes,
        ),
      /changed|ETag/,
    );
    assert.equal(f.state.sourceDownloads, 0);
    assert.equal(f.state.puts.length, 0);
  }
});
