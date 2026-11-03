import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";

const { createSupabasePhotoReceipts } = loadPhotoModules()("./photo-storage.server");

test("actual receipt SDK queries cover homepage inventory within a bounded encoded URL", async () => {
  const paths = Array.from(
    { length: 400 },
    (_, i) => `11111111-1111-4111-8111-111111111111/${String(i).padStart(36, "0")}.jpg`,
  );
  paths.push(`seller/${"é".repeat(490)}.jpg`);
  const seen = [];
  let calls = 0;
  const db = createClient("https://unit.supabase.co", "unit-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        calls++;
        assert.ok(url.href.length < 8000, `oversized receipt URL: ${url.href.length}`);
        assert.equal(url.searchParams.get("bucket"), "eq.listing-media");
        const selected = url.searchParams.get("path").slice(4, -1).split(",");
        assert.ok(selected.length <= 50);
        seen.push(...selected);
        return new Response(
          JSON.stringify(
            selected.map((path) => ({
              bucket: "listing-media",
              path,
              r2_key: "key",
              sha256: "a".repeat(64),
              byte_size: 1,
              content_type: "image/jpeg",
              thumbnail_key: null,
              thumbnail_sha256: null,
              thumbnail_bytes: null,
              thumbnail_content_type: null,
              source_etag: null,
              source_updated_at: null,
              verified_at: "2026-11-03T00:00:00Z",
            })),
          ),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  });
  const rows = await createSupabasePhotoReceipts(db).read("listing-media", [...paths, paths[0]]);
  assert.deepEqual(seen, paths);
  assert.deepEqual(
    Array.from(rows, (row) => row.path),
    paths,
  );
  assert.ok(calls > 1);
});

test("a later receipt batch failure rejects the whole read without retries or partial success", async () => {
  let calls = 0;
  const db = createClient("https://unit.supabase.co", "unit-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async () => {
        calls++;
        return calls === 1
          ? new Response("[]", { headers: { "content-type": "application/json" } })
          : new Response(JSON.stringify({ code: "57014", message: "private diagnostic" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
      },
    },
  });
  await assert.rejects(
    () =>
      createSupabasePhotoReceipts(db).read(
        "listing-media",
        Array.from({ length: 100 }, (_, i) => `seller/${i}.jpg`),
      ),
    /Photo verification records are unavailable/,
  );
  assert.equal(calls, 2);
});
