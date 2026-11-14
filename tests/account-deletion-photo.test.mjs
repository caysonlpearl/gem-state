import test from "node:test";
import assert from "node:assert/strict";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const load = loadPhotoModules();
const { createAccountDeletionPhotoEraser } = load("./account-deletion-photo.server");
const { photoObjectKey, createR2PhotoStore } = load("./r2-photo-storage.server");
const config = {
  accountId: "a".repeat(32),
  accessKeyId: "b".repeat(32),
  secretAccessKey: "c".repeat(64),
  buckets: { "listing-media": "fixture-listing-media", "ask-evidence": "fixture-ask-evidence" },
};
const checksum = "d".repeat(64);
const originalEtag = '"' + "e".repeat(32) + '"';
const erasedHeaders = {
  "content-length": "0",
  "content-type": "application/octet-stream",
  "cache-control": "no-store",
  "x-amz-meta-bluebird-erasure": "v1",
  etag: '"' + "f".repeat(32) + '"',
};
const signal = () => new AbortController().signal;
const unavailable = (error) => {
  assert.equal(error.code, "media_unavailable");
  assert.equal(error.message, "media_unavailable");
  assert.equal(error.cause, undefined);
  return true;
};

function fixture({ missing = false, authorize, intercept, beforePut, afterPut } = {}) {
  const calls = [],
    authorizations = [];
  const objects = new Map();
  const fetcher = async (request) => {
    calls.push(request);
    assert.equal(request.redirect, "error");
    assert(request.signal instanceof AbortSignal);
    assert.equal(new URL(request.url).hostname, `${config.accountId}.r2.cloudflarestorage.com`);
    const special = await intercept?.(request, objects, calls);
    if (special) return special;
    const path = new URL(request.url).pathname;
    if (request.method === "HEAD") {
      if (path.split("/").length === 2) return new Response(null, { status: 200 });
      const object = objects.get(path);
      return new Response(null, { status: object ? 200 : 404, headers: object?.headers });
    }
    assert.equal(request.method, "PUT", "Erasure never deletes a fence or a bucket");
    await beforePut?.(request, objects);
    const body = new Uint8Array(await request.arrayBuffer());
    // R2 evaluates conditions at the atomic commit, after reading the body.
    // No asynchronous work may separate this check from the fixture's commit.
    const existing = objects.get(path);
    if (
      (request.headers.has("if-match") &&
        request.headers.get("if-match") !== existing?.headers.etag) ||
      (request.headers.get("if-none-match") === "*" && existing)
    )
      return new Response(null, { status: 412 });
    objects.set(path, { body, headers: { ...erasedHeaders } });
    await afterPut?.(request, objects);
    return new Response(null, { status: 200 });
  };
  const eraser = createAccountDeletionPhotoEraser(
    config,
    async (target, parentSignal) => {
      authorizations.push(target);
      assert(Object.isFrozen(target));
      parentSignal.throwIfAborted();
      await authorize?.(target, authorizations.length);
      return true;
    },
    fetcher,
  );
  const target = {
    bucket: "listing-media",
    path: "synthetic-member/private photo.jpg",
    variant: "original",
    sha256: checksum,
    bytes: 5,
    storeFingerprint: eraser.fingerprint("listing-media"),
  };
  const path = `/${config.buckets[target.bucket]}/${photoObjectKey(target.path, checksum)}`;
  if (!missing)
    objects.set(path, {
      body: new TextEncoder().encode("photo"),
      headers: {
        "content-length": "5",
        "content-type": "image/jpeg",
        "x-amz-meta-sha256": checksum,
        "x-amz-meta-original-name": "private photo.jpg",
        etag: originalEtag,
      },
    });
  return { eraser, target, path, objects, calls, authorizations, fetcher };
}

test("private R2 erasure replaces bytes and original metadata with a verified empty fence, keeping ordinary storage read/write APIs separate", async () => {
  const f = fixture();
  assert.equal("erase" in createR2PhotoStore(config), false);
  assert.deepEqual(
    { ...(await f.eraser.erase(f.target, signal())) },
    {
      contentErased: true,
      fenceRetained: true,
    },
  );
  assert.deepEqual(
    f.calls.map((request) => request.method),
    ["HEAD", "PUT", "HEAD"],
  );
  assert.equal(f.authorizations.length, 3);
  const write = f.calls[1];
  assert.equal(write.headers.get("if-match"), originalEtag);
  assert.equal(write.headers.get("if-none-match"), null);
  assert.equal(write.headers.get("content-length"), "0");
  assert.equal(write.headers.get("x-amz-meta-sha256"), null);
  assert(write.headers.get("authorization").includes("if-match"));
  assert(write.headers.get("authorization").includes("x-amz-meta-bluebird-erasure"));
  assert.equal(f.objects.get(f.path).body.length, 0);
  assert.equal(f.objects.get(f.path).headers["x-amz-meta-original-name"], undefined);
  assert(!write.url.includes("synthetic-member"));
});

test("retained fences make retries read-only and reject late immutable upload commits", async () => {
  const f = fixture();
  await f.eraser.erase(f.target, signal());
  const before = f.calls.length;
  await f.eraser.erase(f.target, signal());
  assert.deepEqual(
    f.calls.slice(before).map((request) => request.method),
    ["HEAD"],
  );
  const lateUpload = new Request(f.calls[0].url, {
    method: "PUT",
    headers: { "if-none-match": "*" },
    body: "photo",
    redirect: "error",
  });
  // The same conditional provider behavior rejects an old create-only upload.
  assert.equal((await f.fetcher(lateUpload)).status, 412);
  assert.equal(f.objects.get(f.path).body.length, 0);
});

test("a committed write with a lost response is recovered by verification without another replacement", async () => {
  const f = fixture({
    afterPut: async () => {
      throw Error("response lost after commit");
    },
  });
  await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
  assert.equal(f.objects.get(f.path).body.length, 0);
  const result = await f.eraser.erase(f.target, signal());
  assert.equal(result.contentErased, true);
  assert.equal(f.calls.filter((request) => request.method === "PUT").length, 1);
});

test("missing photos are fenced only after the planned bucket is verified, and never treated as absent on permission or bucket errors", async () => {
  const f = fixture({ missing: true });
  await f.eraser.erase(f.target, signal());
  assert.deepEqual(
    f.calls.map((request) => request.method),
    ["HEAD", "HEAD", "PUT", "HEAD"],
  );
  assert.equal(f.calls[2].headers.get("if-none-match"), "*");
  for (const status of [403, 404, 500]) {
    const denied = fixture({
      missing: true,
      intercept: async (request) =>
        new URL(request.url).pathname.split("/").length === 2
          ? new Response(null, { status })
          : undefined,
    });
    await assert.rejects(denied.eraser.erase(denied.target, signal()), unavailable);
    assert(!denied.calls.some((request) => request.method === "PUT"));
  }
  for (const status of [301, 403, 429, 500]) {
    const denied = fixture({ intercept: async () => new Response(null, { status }) });
    await assert.rejects(denied.eraser.erase(denied.target, signal()), unavailable);
    assert.equal(denied.calls.length, 1);
  }
});

test("changed content, weak or wildcard ETags, and changed provider configuration cannot authorize a replacement", async () => {
  for (const headers of [
    { "content-length": "6" },
    { "x-amz-meta-sha256": "f".repeat(64) },
    { etag: 'W/"' + "e".repeat(32) + '"' },
    { etag: "*" },
    { etag: '"' + "e".repeat(32) + '", "*"' },
  ]) {
    const f = fixture();
    Object.assign(f.objects.get(f.path).headers, headers);
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  for (const change of [
    { storeFingerprint: "f".repeat(64) },
    { bucket: "other" },
    { path: "../another-photo" },
    { variant: "other" },
    { bytes: 0 },
    { sha256: "invalid" },
    {
      bucket: "ask-evidence",
      variant: "thumbnail",
      storeFingerprint: f.eraser.fingerprint("ask-evidence"),
    },
  ])
    await assert.rejects(f.eraser.erase({ ...f.target, ...change }, signal()), unavailable);
  assert.equal(f.calls.length, 0);
  assert.equal(f.authorizations.length, 0);
});

test("provider-side preconditions reject a race after inspection and before replacement", async () => {
  for (const missing of [false, true]) {
    const f = fixture({
      missing,
      beforePut: async (request, objects) => {
        objects.set(new URL(request.url).pathname, {
          body: new TextEncoder().encode("new content"),
          headers: { etag: '"' + "a".repeat(32) + '"' },
        });
      },
    });
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
    assert.equal(new TextDecoder().decode(f.objects.get(f.path).body), "new content");
    assert.equal(f.calls.filter((request) => request.method === "PUT").length, 1);
  }
});

test("a successful provider write is not completion until the empty body and scrubbed metadata are rechecked", async () => {
  for (const bad of [
    { "content-length": "5" },
    { "x-amz-meta-bluebird-erasure": "wrong" },
    { "x-amz-meta-original-name": "retained private name" },
    { "cache-control": "private, max-age=3600" },
    { "content-disposition": "private.jpg" },
    { "content-encoding": "gzip" },
  ]) {
    const f = fixture({
      intercept: async (request, objects, calls) => {
        if (request.method === "HEAD" && calls.some((prior) => prior.method === "PUT"))
          return new Response(null, { status: 200, headers: { ...erasedHeaders, ...bad } });
      },
    });
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
  }
  for (const status of [200, 204, 403, 500]) {
    const f = fixture({
      intercept: async (request, objects, calls) => {
        if (request.method === "PUT") return new Response(null, { status });
      },
    });
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
    assert.equal(f.calls.filter((request) => request.method === "PUT").length, 1);
  }
});

test("exclusive-ownership and current-lease authorization is required again immediately before a write and before returning success", async () => {
  for (const refuseAt of [1, 2, 3]) {
    const f = fixture({
      authorize: async (target, count) => {
        if (count === refuseAt)
          throw Error("shared reference or expired lease: private@example.invalid");
      },
    });
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
    assert.equal(
      f.calls.filter((request) => request.method === "PUT").length,
      refuseAt === 3 ? 1 : 0,
    );
  }
  assert.throws(() => createAccountDeletionPhotoEraser(config, undefined), unavailable);
});

test("missing, false, truthy or malformed authorization results cannot start provider access", async () => {
  for (const result of [undefined, false, null, "true", 1, { allowed: true }]) {
    let requests = 0;
    const eraser = createAccountDeletionPhotoEraser(
      config,
      async () => result,
      async () => {
        requests++;
        assert.fail("Unverified authorization reached the storage provider");
      },
    );
    const target = { ...fixture().target, storeFingerprint: eraser.fingerprint("listing-media") };
    await assert.rejects(eraser.erase(target, signal()), unavailable);
    assert.equal(requests, 0);
  }
  for (const invalid of [
    undefined,
    { ...config, accountId: "wrong" },
    { ...config, buckets: {} },
    { ...config, accessKeyId: new String("not-primitive") },
  ])
    assert.throws(() => createAccountDeletionPhotoEraser(invalid, async () => true), unavailable);
});

test("cancellation and ambiguous provider failures never report completion, leak signed requests or retry implicitly", async () => {
  const cancelled = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cancelled.eraser.erase(cancelled.target, controller.signal), unavailable);
  assert.equal(cancelled.calls.length, 0);
  for (const failOn of ["HEAD", "PUT"]) {
    const f = fixture({
      intercept: async (request) => {
        if (request.method === failOn)
          throw Error(
            `private@example.invalid ${request.url} ${request.headers.get("authorization")}`,
          );
      },
    });
    await assert.rejects(f.eraser.erase(f.target, signal()), unavailable);
    assert.equal(f.calls.filter((request) => request.method === failOn).length, 1);
  }
  const afterResponse = new AbortController();
  const f = fixture({
    intercept: async () => {
      afterResponse.abort();
      return new Response(null, { status: 200, headers: erasedHeaders });
    },
  });
  await assert.rejects(f.eraser.erase(f.target, afterResponse.signal), unavailable);
  assert.equal(f.calls.length, 1);
});

test("thumbnail and evidence targets use their own canonical keys and copies of input scope cannot be retargeted during authorization", async () => {
  for (const [bucket, variant] of [
    ["listing-media", "thumbnail"],
    ["ask-evidence", "original"],
  ]) {
    const f = fixture({ missing: true });
    const target = { ...f.target, bucket, variant, storeFingerprint: f.eraser.fingerprint(bucket) };
    await f.eraser.erase(target, signal());
    const expected = `/${config.buckets[bucket]}/${photoObjectKey(target.path, checksum, variant === "thumbnail")}`;
    assert(f.objects.has(expected));
  }
  let f;
  f = fixture({
    authorize: async (target, count) => {
      if (count === 1) {
        f.target.path = "another-member/photo.jpg";
        f.target.bucket = "ask-evidence";
      }
    },
  });
  await f.eraser.erase(f.target, signal());
  assert.equal(f.objects.size, 1);
  assert.equal(f.objects.get(f.path).body.length, 0);
});

test("independent verification only reads current provider state and rejects later content restoration without repairing it", async () => {
  const f = fixture();
  await f.eraser.erase(f.target, signal());
  const start = f.calls.length;
  const authorizations = f.authorizations.length;
  assert.deepEqual(
    { ...(await f.eraser.verify(f.target, signal())) },
    {
      contentErased: true,
      fenceRetained: true,
    },
  );
  assert.equal(f.authorizations.length - authorizations, 2);
  assert.deepEqual(
    f.calls.slice(start).map((r) => r.method),
    ["HEAD"],
  );
  f.objects.set(f.path, {
    body: new TextEncoder().encode("restored"),
    headers: { "content-length": "8", "x-amz-meta-sha256": checksum, etag: originalEtag },
  });
  const before = f.calls.length;
  await assert.rejects(f.eraser.verify(f.target, signal()), unavailable);
  assert.deepEqual(
    f.calls.slice(before).map((r) => r.method),
    ["HEAD"],
  );
  assert.equal(new TextDecoder().decode(f.objects.get(f.path).body), "restored");
});

test("verification does not accept missing, denied, malformed or metadata-bearing objects as erased", async () => {
  const responses = [
    ...[301, 403, 404, 429, 500].map((status) => ({ status, headers: erasedHeaders })),
    ...[
      { "content-length": "1" },
      { "content-length": undefined },
      { "content-type": "image/jpeg" },
      { "x-amz-meta-bluebird-erasure": "other" },
      { "x-amz-meta-private-name": "private@example.invalid" },
      { "content-encoding": "gzip" },
      { "content-disposition": "private filename.jpg" },
      { "cache-control": "public" },
    ].map((patch) => {
      const headers = { ...erasedHeaders, ...patch };
      for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
      return { status: 200, headers };
    }),
  ];
  for (const response of responses) {
    const f = fixture({ intercept: async () => new Response(null, response) });
    await assert.rejects(f.eraser.verify(f.target, signal()), unavailable);
    assert.deepEqual(
      f.calls.map((r) => r.method),
      ["HEAD"],
    );
  }
});

test("verification reauthorizes a current lease before and after the read, and cannot use another store or mutated target", async () => {
  for (const refuseAt of [1, 2]) {
    const f = fixture({
      authorize: async (target, count) => {
        if (count === refuseAt) throw Error("private@example.invalid stale ownership or lease");
      },
      intercept: async () => new Response(null, { status: 200, headers: erasedHeaders }),
    });
    await assert.rejects(f.eraser.verify(f.target, signal()), unavailable);
    assert.equal(f.calls.length, refuseAt - 1);
  }
  const f = fixture();
  await assert.rejects(
    f.eraser.verify({ ...f.target, storeFingerprint: "f".repeat(64) }, signal()),
    unavailable,
  );
  assert.equal(f.calls.length, 0);
  let reads = 0;
  const pinned = fixture({
    authorize: async () => {
      pinned.target.path = "another-member/photo.jpg";
    },
    intercept: async () => {
      reads++;
      return new Response(null, { status: 200, headers: erasedHeaders });
    },
  });
  const path = pinned.path;
  await pinned.eraser.verify(pinned.target, signal());
  assert.equal(new URL(pinned.calls[0].url).pathname, path);
  assert.equal(reads, 1);
});

test("verification honors cancellation before provider access and after a response without retaining signed failure details", async () => {
  const controller = new AbortController();
  controller.abort();
  const f = fixture();
  await assert.rejects(f.eraser.verify(f.target, controller.signal), unavailable);
  assert.equal(f.calls.length, 0);
  const duringRead = new AbortController();
  const cancelled = fixture({
    intercept: async () => {
      duringRead.abort();
      return new Response(null, { status: 200, headers: erasedHeaders });
    },
  });
  await assert.rejects(cancelled.eraser.verify(cancelled.target, duringRead.signal), unavailable);
  const failedRead = fixture({
    intercept: async (request) => {
      throw Error(`private@example.invalid ${request.url} ${request.headers.get("authorization")}`);
    },
  });
  await assert.rejects(failedRead.eraser.verify(failedRead.target, signal()), unavailable);
  assert.equal(failedRead.calls.length, 1);
});

test("concurrent attempts cannot overwrite the winning fence and the losing attempt reconciles without another write", async () => {
  for (const missing of [false, true]) {
    let arrivals = 0,
      release;
    const bothArrived = new Promise((resolve) => {
      release = resolve;
    });
    const f = fixture({
      missing,
      beforePut: async () => {
        if (++arrivals === 2) release();
        await bothArrived;
      },
    });
    const attempts = await Promise.allSettled([
      f.eraser.erase(f.target, signal()),
      f.eraser.erase(f.target, signal()),
    ]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = attempts.find((r) => r.status === "rejected");
    assert(rejected);
    unavailable(rejected.reason);
    const writes = f.calls.filter((r) => r.method === "PUT").length;
    assert.equal(writes, 2);
    assert.equal(f.objects.get(f.path).body.length, 0);
    await f.eraser.erase(f.target, signal());
    await f.eraser.verify(f.target, signal());
    assert.equal(f.calls.filter((r) => r.method === "PUT").length, writes);
  }
});
