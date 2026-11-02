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
