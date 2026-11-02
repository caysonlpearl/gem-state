import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PhotonImage } from "@cf-wasm/photon";
import { loadPhotoModules, photoStorageFixture } from "./photo-storage-fixture.mjs";
import {
  prepareImportedPhotoPreview,
  stageImportWithPhotoPreviews,
} from "../src/lib/import-photo-preview.browser.ts";

const load = loadPhotoModules();
const { readImportPhoto, stageImportedPhotos, ImportPhotoPreviewRequired } = load(
  "./import-photo-preview.server",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const url = "https://images.vinted.net/one.jpg";
const url2 = "https://images.vinted.net/two.jpg";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AACVz/8EYQJkPACksAAAAABJRU5ErkJggg==",
  "base64",
);
const thumb = { bytes: png, contentType: "image/png", width: 1, height: 1 };
const original = (bytes) => ({
  bytes: new Uint8Array(bytes),
  contentType: "image/jpeg",
  sourceSha256: sha(bytes),
});
const prepared = (u, bytes) => ({
  url: u,
  sourceSha256: sha(bytes),
  contentType: "image/png",
  base64: png.toString("base64"),
});

test("source reader rejects unsupported hosts and redirect escapes before contacting them", async () => {
  let calls = 0;
  for (const u of [
    "http://images.vinted.net/one",
    "https://vinted.net.evil.invalid/one",
    "https://user:pass@images.vinted.net/one",
    "https://images.vinted.net:444/one",
    "https://127.0.0.1/one",
  ])
    await assert.rejects(
      () =>
        readImportPhoto(u, async () => {
          calls++;
        }),
      /Unsupported/,
    );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      readImportPhoto(url, async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://private.invalid/photo" },
        });
      }),
    /Unsupported/,
  );
  assert.equal(calls, 1);
});
test("source reader bounds streamed bodies, MIME, empty/failed responses and redirect count", async () => {
  for (const response of [
    new Response("x", { status: 503 }),
    new Response(""),
    new Response("x", { headers: { "content-type": "text/html" } }),
    new Response("x", { headers: { "content-length": String(12 * 1024 * 1024 + 1) } }),
    new Response(new Uint8Array(12 * 1024 * 1024 + 1)),
  ]) {
    let calls = 0;
    await assert.rejects(() =>
      readImportPhoto(url, async () => {
        calls++;
        return response;
      }),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    () =>
      readImportPhoto(url, async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location: "/again.jpg" } });
      }),
    /redirect/,
  );
  assert.equal(calls, 4);
  const result = await readImportPhoto(url, async (_u, options) => {
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    return new Response(png, { headers: { "content-type": "image/png" } });
  });
  assert.equal(result.sourceSha256, sha(png));
  assert.deepEqual(Buffer.from(result.bytes), png);
});

test("all preview needs are discovered before any write; retry retains exact originals, order and private evidence", async () => {
  const small = new Uint8Array([1, 2, 3]),
    large = new Uint8Array([9, 8, 7]);
  const originals = new Map([
    [url, original(small)],
    [url2, original(large)],
  ]);
  const f = photoStorageFixture();
  let sequence = 0;
  const deps = {
    read: async (u) => originals.get(u),
    thumbnail: async (bytes) => {
      if (bytes[0] === 9) throw new Error("needs a prepared thumbnail");
      return thumb;
    },
    uuid: () => String(++sequence),
  };
  let need;
  try {
    await stageImportedPhotos("batch", [url, url2], [], f.store, deps);
    assert.fail("must request browser preview");
  } catch (error) {
    assert.ok(error instanceof ImportPhotoPreviewRequired);
    need = error;
  }
  assert.equal(f.state.puts.length, 0);
  assert.equal(f.state.records.size, 0);
  assert.equal(need.sources.length, 1);
  assert.equal(need.sources[0].url, url2);
  assert.equal(need.prepared[0].url, url);
  const paths = await stageImportedPhotos(
    "batch",
    [url, url2],
    [...need.prepared, prepared(url2, large)],
    f.store,
    deps,
  );
  assert.deepEqual([...paths], ["_staging/batch/1.jpg", "_staging/batch/2.jpg"]);
  assert.equal(f.state.sourceUploads, 0);
  assert.equal(f.state.records.size, 4);
  assert.equal(f.state.puts.length, 6);
  for (const [i, bytes] of [small, large].entries())
    for (const bucket of ["listing-media", "ask-evidence"]) {
      const receipt = f.state.records.get(`${bucket}/${paths[i]}`);
      assert.deepEqual(Buffer.from(f.state.r2.get(`${bucket}/${receipt.key}`)), Buffer.from(bytes));
      assert.equal(receipt.sha256, sha(bytes));
    }
});

test("a changed original, invalid supplied preview or failed CDN read never triggers browser recovery or writes", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  for (const supplied of [
    [{ ...prepared(url, bytes), sourceSha256: "a".repeat(64) }],
    [{ ...prepared(url, bytes), base64: "!" }],
    [{ ...prepared(url, bytes), url: url2 }],
    [prepared(url, bytes), prepared(url, bytes)],
  ]) {
    let writes = 0;
    await assert.rejects(() =>
      stageImportedPhotos(
        "batch",
        [url],
        supplied,
        { upload: async () => writes++ },
        { read: async () => original(bytes), thumbnail: async () => thumb, uuid: () => "1" },
      ),
    );
    assert.equal(writes, 0);
  }
  await assert.rejects(
    () =>
      stageImportedPhotos(
        "batch",
        [url],
        [],
        { upload: () => assert.fail() },
        {
          read: async () => {
            throw new Error("CDN unavailable");
          },
          thumbnail: () => assert.fail(),
          uuid: () => "1",
        },
      ),
    /CDN unavailable/,
  );
  let reads = 0,
    writes = 0;
  await assert.rejects(
    () =>
      stageImportedPhotos(
        "batch",
        [url, url2],
        [],
        { upload: async () => writes++ },
        {
          read: async () => original(++reads === 3 ? new Uint8Array([4, 5, 6]) : bytes),
          thumbnail: async () => thumb,
          uuid: () => "1",
        },
      ),
    /changed before storage/,
  );
  assert.equal(writes, 0);
});

test("actual 12.2MP source import accepts a small validated preview and stores unchanged originals in both R2 buckets", async () => {
  const image = new PhotonImage(new Uint8Array(4032 * 3024 * 4).fill(255), 4032, 3024);
  let jpeg;
  try {
    jpeg = image.get_bytes_jpeg(80);
  } finally {
    image.free();
  }
  const bytes = Buffer.from(jpeg);
  const f = photoStorageFixture();
  const { makePhotoThumbnail } = load("./photo-thumbnail.server");
  await assert.rejects(
    () =>
      stageImportedPhotos("batch", [url], [], f.store, {
        read: async () => original(bytes),
        thumbnail: makePhotoThumbnail,
        uuid: () => "large",
      }),
    (error) => error instanceof ImportPhotoPreviewRequired,
  );
  assert.equal(f.state.puts.length, 0);
  const paths = await stageImportedPhotos("batch", [url], [prepared(url, bytes)], f.store, {
    read: async () => original(bytes),
    thumbnail: makePhotoThumbnail,
    uuid: () => "large",
  });
  for (const bucket of ["listing-media", "ask-evidence"]) {
    const receipt = f.state.records.get(`${bucket}/${paths[0]}`);
    assert.equal(receipt.sha256, sha(bytes));
    assert.deepEqual(Buffer.from(f.state.r2.get(`${bucket}/${receipt.key}`)), bytes);
  }
  assert.equal(f.state.sourceUploads, 0);
});

test("browser preparation checks the handed source hash/length and bounds its preview", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const source = { url, sourceSha256: sha(bytes), bytes: bytes.length, contentType: "image/jpeg" };
  const body = { ...source, base64: Buffer.from(bytes).toString("base64") };
  const result = await prepareImportedPhotoPreview(
    source,
    async () => body,
    async () => new Blob([png], { type: "image/png" }),
  );
  assert.equal(result.sourceSha256, sha(bytes));
  assert.equal(result.base64, png.toString("base64"));
  for (const changes of [
    { bytes: 1 },
    { url: url2 },
    { sourceSha256: "a".repeat(64) },
    { base64: "AAAA" },
  ])
    await assert.rejects(() =>
      prepareImportedPhotoPreview(
        source,
        async () => ({ ...body, ...changes }),
        () => assert.fail("changed source cannot decode"),
      ),
    );
  for (const small of [
    new Blob([]),
    new Blob(["x"], { type: "text/html" }),
    new Blob([new Uint8Array(512 * 1024 + 1)], { type: "image/png" }),
  ])
    await assert.rejects(() =>
      prepareImportedPhotoPreview(
        source,
        async () => body,
        async () => small,
      ),
    );
});

const stageResult = (changes) => ({
  batchId: "batch",
  staged: 0,
  updated: 0,
  failed: 0,
  failedUrls: [],
  failures: [],
  flaggedRemoved: 0,
  preservedActive: 0,
  recaptured: 0,
  photoPreviewRequests: [],
  ...changes,
});
function browserFixture() {
  const bytes = new Uint8Array([1, 2, 3]);
  const source = { url, sourceSha256: sha(bytes), bytes: 3, contentType: "image/jpeg" };
  const item = {
    sourceUrl: "https://www.vinted.com/items/123-test",
    title: "Item",
    priceCents: 100,
    photoUrls: [url],
  };
  const first = stageResult({
    staged: 1,
    failed: 1,
    failedUrls: [item.sourceUrl],
    failures: [{ rowIndex: 1, reason: "photo_preview_required" }],
    photoPreviewRequests: [{ rowIndex: 1, prepared: [], sources: [source] }],
  });
  let calls = 0,
    reads = 0;
  const deps = {
    stage: async (options) => {
      calls++;
      if (calls === 1) return first;
      assert.equal(options.data.items.length, 1);
      assert.equal(options.data.batchId, "batch");
      assert.equal(options.data.items[0].preparedPhotoPreviews[0].sourceSha256, sha(bytes));
      return stageResult({ staged: 1 });
    },
    source: async (input) => {
      reads++;
      return { ...input, base64: Buffer.from(bytes).toString("base64") };
    },
    thumbnail: async () => new Blob([png], { type: "image/png" }),
  };
  const options = {
    data: {
      sourceProfileUrl: "https://www.vinted.com/member/1",
      items: [{ ...item, sourceUrl: "https://www.vinted.com/items/122-other" }, item],
    },
  };
  return { options, deps, first, stats: () => ({ calls, reads }) };
}
test("browser retries only the confirmed preview row once and preserves successful counts", async () => {
  const f = browserFixture();
  const result = await stageImportWithPhotoPreviews(f.options, f.deps);
  assert.deepEqual(f.stats(), { calls: 2, reads: 1 });
  assert.equal(result.staged, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.failedUrls, []);
  assert.deepEqual(result.failures, []);
});
test("interrupted preparation or stage acknowledgement never loops or changes other row results", async () => {
  for (const failure of ["source", "stage"]) {
    const f = browserFixture();
    if (failure === "source")
      f.deps.source = async () => {
        throw new Error("source interrupted");
      };
    else {
      const stage = f.deps.stage;
      let count = 0;
      f.deps.stage = async (options) => {
        if (++count === 2) throw new Error("unknown stage outcome");
        return stage(options);
      };
    }
    const result = await stageImportWithPhotoPreviews(f.options, f.deps);
    assert.equal(result.failed, 1);
    assert.equal(result.staged, 1);
    assert.equal(
      result.failures[0].reason,
      failure === "source" ? "photo_preview_failed" : "request_interrupted",
    );
  }
  const f = browserFixture();
  f.deps.stage = async () => {
    throw new Error("initial acknowledgement lost");
  };
  await assert.rejects(stageImportWithPhotoPreviews(f.options, f.deps), /lost/);
  assert.equal(f.stats().reads, 0);
});
test("a preview request cannot substitute another photo or replay a duplicate row", async () => {
  const f = browserFixture();
  f.first.photoPreviewRequests.push(f.first.photoPreviewRequests[0]);
  const result = await stageImportWithPhotoPreviews(f.options, f.deps);
  assert.equal(result.failed, 0);
  assert.equal(f.stats().calls, 2);
  const g = browserFixture();
  g.first.photoPreviewRequests[0].sources[0].url = url2;
  const denied = await stageImportWithPhotoPreviews(g.options, g.deps);
  assert.equal(g.stats().calls, 1);
  assert.equal(g.stats().reads, 0);
  assert.equal(denied.failed, 1);
});

test("eight source photos keep their order and both private copies with sequential original reads", async () => {
  const f = photoStorageFixture();
  let reads = 0,
    inFlight = 0;
  const urls = Array.from({ length: 8 }, (_, i) => `https://images.vinted.net/${i}.jpg`);
  const paths = await stageImportedPhotos("batch", urls, [], f.store, {
    read: async (u) => {
      assert.equal(inFlight++, 0);
      await Promise.resolve();
      reads++;
      inFlight--;
      return original(new Uint8Array([urls.indexOf(u) + 1]));
    },
    thumbnail: async () => thumb,
    uuid: () => String(f.state.records.size / 2),
  });
  assert.equal(paths.length, 8);
  assert.equal(reads, 15);
  assert.equal(f.state.records.size, 16);
  assert.equal(f.state.sourceUploads, 0);
  for (let i = 0; i < 8; i++)
    for (const bucket of ["listing-media", "ask-evidence"]) {
      const receipt = f.state.records.get(`${bucket}/${paths[i]}`);
      assert.equal(f.state.r2.get(`${bucket}/${receipt.key}`)[0], i + 1);
    }
});
test("small SVG source imports retain existing vector previews and unchanged originals", async () => {
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
  );
  const f = photoStorageFixture();
  const { makePhotoThumbnail } = load("./photo-thumbnail.server");
  const paths = await stageImportedPhotos("batch", [url], [], f.store, {
    read: async () => ({ ...original(svg), contentType: "image/svg+xml" }),
    thumbnail: makePhotoThumbnail,
    uuid: () => "vector",
  });
  const receipt = f.state.records.get(`listing-media/${paths[0]}`);
  assert.equal(receipt.thumbnailContentType, "image/svg+xml");
  assert.deepEqual(
    Buffer.from(f.state.r2.get(`listing-media/${receipt.thumbnailKey}`)),
    Buffer.from(svg),
  );
});
