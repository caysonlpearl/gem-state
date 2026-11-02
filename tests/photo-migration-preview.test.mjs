import test from "node:test";
import assert from "node:assert/strict";
import { prepareMigrationPreview } from "../src/lib/photo-migration-preview.browser.ts";
import { MAX_THUMBNAIL_BYTES } from "../src/lib/photo-storage.ts";

const source = {
  ordinal: 7,
  sourceEtag: "a".repeat(32),
  bytes: 3,
  contentType: "image/jpeg",
  url: "https://offline.invalid/private",
};
test("the default fetch adapter does not rebind the browser's native function to its dependency object", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = function () {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    calls++;
    return Promise.resolve(new Response("", { status: 503 }));
  };
  try {
    await assert.rejects(() => prepareMigrationPreview(source), /source could not be read/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("preview performs exactly one reserved GET and binds its small result to the failed source", async () => {
  let calls = 0;
  const result = await prepareMigrationPreview(source, {
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, source.url);
      assert.equal(options.credentials, "omit");
      assert.equal(options.referrerPolicy, "no-referrer");
      assert.equal(options.cache, "no-store");
      return new Response(new Uint8Array([1, 2, 3]));
    },
    thumbnail: async (blob) => {
      assert.equal(blob.size, 3);
      assert.equal(blob.type, "image/jpeg");
      return new Blob([new Uint8Array([4, 5])], { type: "image/webp" });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    ordinal: 7,
    sourceEtag: source.sourceEtag,
    contentType: "image/webp",
    base64: "BAU=",
    sourceBase64: "AQID",
  });
});
test("size errors and failed responses are not retried or sent to the decoder", async () => {
  for (const response of [
    new Response("xx"),
    new Response("xxxx"),
    new Response("", { status: 503 }),
  ]) {
    let calls = 0;
    await assert.rejects(() =>
      prepareMigrationPreview(source, {
        fetch: async () => {
          calls++;
          return response;
        },
        thumbnail: () => assert.fail("No decoding of failed/unbounded data"),
      }),
    );
    assert.equal(calls, 1);
  }
});
test("preview size and content type remain bounded after browser decoding", async () => {
  for (const blob of [
    new Blob([new Uint8Array(MAX_THUMBNAIL_BYTES + 1)], { type: "image/webp" }),
    new Blob(["x"], { type: "text/html" }),
    new Blob([], { type: "image/png" }),
  ])
    await assert.rejects(
      () =>
        prepareMigrationPreview(source, {
          fetch: async () => new Response("123"),
          thumbnail: async () => blob,
        }),
      /invalid or too large/,
    );
});

test("large originals retain preview recovery without exceeding the optional handoff bound", async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  const result = await prepareMigrationPreview(
    { ...source, bytes: bytes.length },
    {
      fetch: async () => new Response(bytes),
      thumbnail: async () => new Blob(["small"], { type: "image/webp" }),
    },
  );
  assert.equal("sourceBase64" in result, false);
  assert.equal(result.base64, Buffer.from("small").toString("base64"));
});
test("bounded source handoff preserves every original byte across base64 chunk boundaries", async () => {
  const bytes = Uint8Array.from({ length: 102401 }, (_, n) => n % 256);
  const result = await prepareMigrationPreview(
    { ...source, bytes: bytes.length },
    {
      fetch: async () => new Response(bytes),
      thumbnail: async () => new Blob(["small"], { type: "image/webp" }),
    },
  );
  assert.deepEqual(Buffer.from(result.sourceBase64, "base64"), Buffer.from(bytes));
});
