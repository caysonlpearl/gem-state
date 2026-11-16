import test from "node:test";
import assert from "node:assert/strict";
import { shoppingImageInput } from "../src/lib/shopping-contract.ts";
import { listingCoverRevision } from "../src/lib/listing-cover-revision.server.ts";
import { nativeListingCoverUrl } from "../src/lib/listing-card-image.ts";
import { loadSourceModule } from "./helpers/load-source-module.mjs";

test("changing a cover invalidates its embedding identity, while expiring signatures do not", async () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const first = nativeListingCoverUrl(id, await listingCoverRevision("owner/first.jpg"));
  const next = nativeListingCoverUrl(id, await listingCoverRevision("owner/next.jpg"));
  const old = shoppingImageInput(first),
    changed = shoppingImageInput(next);
  assert(old.url.startsWith("https://onbluebird.com/media/listings/"));
  assert.notEqual(old.identity, changed.identity);
  assert.equal(
    old.identity,
    shoppingImageInput(old.url + "&signature=rotated&size=large").identity,
  );
  assert.equal(
    shoppingImageInput("https://cdn.example/item.jpg?signature=one").identity,
    shoppingImageInput("https://cdn.example/item.jpg?signature=two").identity,
  );
  assert.equal(
    shoppingImageInput("https://other.example/media/listings/" + id + "/0?rev=" + "a".repeat(64))
      .identity,
    "https://other.example/media/listings/" + id + "/0",
  );
  for (const input of [
    undefined,
    "invalid",
    "data:image/png;base64,abc",
    "file:///private/photo.jpg",
    "http://cdn.example/image.jpg",
    "https://secret@cdn.example/image.jpg",
    "https://cdn.example:8443/image.jpg",
  ])
    assert.deepEqual(shoppingImageInput(input), { url: null, identity: "" });
});

test("actual private embedding endpoint gives the worker absolute public image addresses and rejects unsigned requests", async () => {
  const calls = [];
  const route = loadSourceModule("routes/api/internal/shopping-embeddings.ts", {
    "@tanstack/react-router": { createFileRoute: () => (v) => v },
    "@/lib/runtime-env.server": { serverEnv: () => "synthetic-job-secret" },
    "@/lib/shopping.server": {
      shoppingDb: async () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data: [
              {
                listing_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
                content_hash: "fixture-hash",
                card: {
                  title: "Public fixture",
                  categorySlug: "home-garden",
                  imageUrl:
                    "/media/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/0?size=card&rev=" +
                    "a".repeat(64),
                },
              },
            ],
          };
        },
      }),
      shoppingControls: async () => ({ embeddings: true }),
    },
  }).Route;
  const get = (authorization) =>
    route.server.handlers.GET({
      request: new Request("https://onbluebird.com/api/internal/shopping-embeddings", {
        headers: authorization ? { authorization } : {},
      }),
    });
  assert.equal((await get()).status, 401);
  assert.equal(calls.length, 0);
  const result = await get("Bearer synthetic-job-secret");
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(
    body.items[0].image,
    "https://onbluebird.com/media/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/0?size=card&rev=" +
      "a".repeat(64),
  );
  assert(!JSON.stringify(body).includes("storage_path"));
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ name: "shopping_embedding_candidates", args: { batch_size: 96 } }]);
});

test("the actual catalog sweep invalidates a changed cover but preserves identity across signature renewal", async () => {
  let image =
    "/media/listings/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/0?size=card&rev=" + "a".repeat(64);
  const records = new Map();
  const card = () => ({
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    title: "Public desk",
    categorySlug: "home-garden",
    priceCents: 5000,
    createdAt: new Date().toISOString(),
    imageUrl: image,
  });
  const db = {
    from(table) {
      let updates;
      const q = {
        select() {
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        eq() {
          return q;
        },
        is() {
          return q;
        },
        in() {
          return q;
        },
        update() {
          return q;
        },
        upsert(rows) {
          updates = rows;
          return q;
        },
        single: async () => ({ data: { model: {}, catalog_ready_at: new Date().toISOString() } }),
        then(resolve) {
          if (updates) for (const row of updates) records.set(row.listing_id, row);
          return Promise.resolve({
            data: table === "shopping_inventory" ? [...records.values()] : [],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  const service = loadSourceModule("lib/shopping.server.ts", {
    "./homepage-snapshot.server": { readHomepageSnapshot: async () => ({}) },
    "./homepage-snapshot-build.server": {
      buildHomepageSnapshot: async () => ({
        sections: { native: { updatedAt: Date.now(), cards: [card()] } },
        sourceFailures: {},
      }),
    },
  });
  assert.equal(await service.syncShoppingInventory(db), 1);
  const original = records.get(card().id).content_hash;
  image += "&signature=renewed";
  await service.syncShoppingInventory(db);
  assert.equal(records.get(card().id).content_hash, original);
  image = image.replace("a".repeat(64), "b".repeat(64));
  await service.syncShoppingInventory(db);
  assert.notEqual(records.get(card().id).content_hash, original);
});
