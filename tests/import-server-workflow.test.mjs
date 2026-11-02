import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { z } from "zod";
import {
  canonicalImportSource,
  mayInferScanAbsence,
  scannableProfiles,
  stagingFailureCode,
  isSettledImportRemoval,
} from "../src/lib/import-refresh.ts";
import { canonicalSellerSourceProfile, dieselDepotListingId } from "../src/lib/seller-claims.ts";

// Exercise actual handler bodies offline. Imports are replaced only at the boundary.
function handlers(
  rows,
  {
    claimed = false,
    paused = false,
    writeError = null,
    verified = true,
    setupActive = true,
    archivedProfiles = [],
    photoMode = "supabase",
    photoBackend = {},
    photoStore = null,
    isAdmin = true,
  } = {},
) {
  const headers = [];
  const writes = [],
    rpcs = [],
    lookups = { count: 0 };
  const db = {
    storage: {
      from: (bucket) => ({
        upload: async (path) => {
          writes.push({ table: "storage:" + bucket, action: "upload", values: { path } });
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email_confirmed_at: verified ? "confirmed" : null, app_metadata: {} } },
        }),
      },
    },
    from(table) {
      let action, values;
      const filters = [];
      const q = {
        select() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        in(k, v) {
          filters.push([k, v]);
          return q;
        },
        is(k, value) {
          filters.push([k, value]);
          return q;
        },
        not(k, op, value) {
          filters.push([k, op, value]);
          return q;
        },
        insert(v) {
          action = "insert";
          values = v;
          return q;
        },
        update(v) {
          action = "update";
          values = v;
          return q;
        },
        upsert(v) {
          action = "upsert";
          values = v;
          return q;
        },
        single() {
          return q;
        },
        maybeSingle() {
          return q;
        },
        then(resolve) {
          if (action) writes.push({ table, action, values, filters });
          const data =
            table === "import_source_archives"
              ? archivedProfiles.map((source_profile_url) => ({ source_profile_url }))
              : table === "managed_import_sellers"
                ? { id: "seller", owner_user_id: "owner", sync_enabled: !paused }
                : table === "seller_profiles"
                  ? { terms_accepted_at: setupActive ? "accepted" : null, status: "active" }
                  : table === "fb_marketplace_import_batches"
                    ? { id: "batch", seller_name: "Seller" }
                    : rows;
          resolve({
            data,
            error: table === "fb_marketplace_import_items" && action ? writeError : null,
          });
        },
      };
      return q;
    },
    rpc: async (name, args) => {
      rpcs.push({ name, args });
      return { data: "listing", error: null };
    },
  };
  const c = vm.createContext({
    z,
    MAX_IMPORT_PHOTO_BYTES: 12 * 1024 * 1024,
    MAX_IMPORT_PREVIEW_BYTES: 512 * 1024,
    console,
    crypto: { randomUUID: () => "fresh-photo" },
    AbortSignal,
    fetch: async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }),
    URL,
    Map,
    Set,
    canonicalImportSource,
    mayInferScanAbsence,
    stagingFailureCode,
    isSettledImportRemoval,
    canonicalSellerSourceProfile,
    dieselDepotListingId,
    requireSupabaseAuth: {},
    getPhotoStorageModule: async () => ({
      currentPhotoMode: () => "supabase",
      currentPhotoUploadMode: () => photoMode,
      getPhotoStorage: async () => photoStore,
    }),
    classifiedCategories: [{ slug: "general" }],
    inferFacebookCategorySlug: (slug) => slug || "general",
    normalizeFacebookCondition: (v) => v || "used_good",
    inferImportItemDetails: (_a, _b, details) => details || {},
    findIdahoPlace: () => undefined,
    createServerFn: () => {
      let validate = (v) => v;
      const builder = {
        middleware: () => builder,
        validator(fn) {
          validate = fn;
          return builder;
        },
        handler(fn) {
          return (input) => fn({ ...input, data: validate(input.data) });
        },
      };
      return builder;
    },
    boundaries: {
      ...photoBackend,
      setResponseHeader: (...value) => headers.push(value),
      supabaseAdmin: db,
      allImportRows: async () => {
        lookups.count++;
        return rows;
      },
      ensureManagedImportSeller: async () => ({
        id: "seller",
        owner_user_id: "owner",
        claimed_at: claimed ? "claimed" : null,
      }),
      pingListingChange() {},
    },
  });
  let source = readFileSync(new URL("../src/lib/fb-import.functions.ts", import.meta.url), "utf8");
  source = source
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
    .replace(/await import\(["'][^"']+["']\)/g, "boundaries");
  source = stripTypeScriptTypes(source, { mode: "transform" }).replaceAll("export ", "");
  vm.runInContext(
    source +
      "\nglobalThis.stage = stageFacebookImportBatch; globalThis.apply = publishFacebookImportItems; globalThis.clear = discardAllFacebookImportItems; globalThis.queue = getFacebookImportItems; globalThis.previewSource = prepareFacebookImportPhotoPreviewSource;",
    c,
  );
  const context = {
    userId: "admin",
    supabase: { rpc: async () => ({ data: isAdmin, error: null }) },
  };
  return {
    stage: (data) => c.stage({ data, context }),
    previewSource: (data) => c.previewSource({ data, context }),
    headers,
    apply: (data) => c.apply({ data, context }),
    clear: () => c.clear({ context }),
    queue: () => c.queue({ context }),
    writes,
    rpcs,
    lookups,
  };
}
const profile = "https://www.vinted.com/member/1";
const row = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  source_url: "https://www.vinted.com/items/2-old",
  source_profile_url: profile,
  title: "Existing listing",
  description: "A complete source description",
  price_cents: 500,
  status: "published",
  listing_id: "listing",
  listing: { status: "active" },
  seller_id: "owner",
  category_slug: "general",
  item_details: {},
  city: "Boise",
  evidence_paths: [],
};
const item = {
  sourceUrl: "https://www.vinted.com/items/2-new",
  title: row.title,
  description: row.description,
  priceCents: 600,
  photoUrls: [],
};

test("refresh accepts a known listing without photos and preserves stored media", async () => {
  const h = handlers([row]);
  const { photoUrls, ...withoutPhotos } = item;
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [withoutPhotos],
  });
  assert.equal(out.failed, 0);
  assert.equal(out.updated, 1);
  assert.equal(
    h.writes.some((w) => w.values?.public_paths),
    false,
  );
});

test("refresh and complete-scan finalization never queue an offline listing again", async () => {
  const h = handlers([{ ...row, listing: { status: "cancelled" } }]);
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [{ ...item, unavailable: true }],
  });
  assert.equal(out.flaggedRemoved, 0);
  assert.equal(out.updated, 0);
  const final = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [],
    finalizeScan: true,
    scan: { complete: true, termination: "count", challenged: false, unreadable: 0 },
    seenUrls: [],
  });
  assert.equal(final.flaggedRemoved, 0);
  assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
});

test("only previously applied removals disappear from the pending review queue", () => {
  const settled = {
    status: "possibly_removed",
    listing_id: "listing",
    listing: { status: "cancelled" },
    last_applied_snapshot: { status: "cancelled" },
  };
  assert.equal(isSettledImportRemoval(settled), true);
  assert.equal(
    isSettledImportRemoval({ ...settled, last_applied_snapshot: { status: "active" } }),
    false,
  );
  assert.equal(isSettledImportRemoval({ ...settled, listing: { status: "active" } }), false);
  assert.equal(isSettledImportRemoval({ ...settled, listing: null }), false);
});

test("actual stage handler dedupes an existing slug and queues update without changing identity/photos", async () => {
  const h = handlers([row]);
  const outcome = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [item],
  });
  assert.equal(outcome.updated, 1);
  assert.equal(outcome.staged, 0);
  const update = h.writes.find((w) => w.table === "fb_marketplace_import_items");
  assert.equal(update.values.status, "needs_update");
  assert.equal(update.values.listing_id, undefined);
  assert.equal(update.values.evidence_paths, undefined);
  assert.ok(update.filters.some(([k, v]) => k === "source_url" && v === row.source_url));
});
test("actual stage handler creates new source inventory as draft and preserves pending admin edits", async () => {
  let h = handlers([]);
  let outcome = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [item],
  });
  assert.equal(outcome.staged, 1);
  assert.equal(h.writes.find((w) => w.action === "upsert").values.status, "draft");
  h = handlers([{ ...row, status: "needs_update" }]);
  outcome = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [item],
  });
  assert.equal(outcome.updated, 0);
  assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
});
test("even a claimed complete inventory scan cannot queue removal of unseen active listings", async () => {
  const scan = { complete: true, termination: "end", challenged: false, unreadable: 0 };
  for (const evidence of [scan, { ...scan, unreadable: 31 }, { ...scan, complete: false }]) {
    const h = handlers([row]);
    const outcome = await h.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: [],
      scan: evidence,
      finalizeScan: true,
      seenUrls: [],
    });
    assert.equal(outcome.flaggedRemoved, 0);
    assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
    assert.equal(h.rpcs.length, 0);
  }
});

test("actual stage handler refuses a seller whose sync is paused", async () => {
  const h = handlers([row], { paused: true });
  await assert.rejects(
    h.stage({ sourceProfileUrl: profile, authorized: true, mode: "refresh", items: [item] }),
    /paused/,
  );
  assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
});
test("actual apply preserves account gates and never rotates a claim on success or retry", async () => {
  const h = handlers([row]);
  const data = { itemIds: [row.id], mode: "managed", authorized: true };
  const result = await h.apply(data);
  assert.equal(result.created + result.updated + result.removed, 0);
  assert.deepEqual(
    h.rpcs.map((r) => r.name),
    ["apply_managed_import_item"],
  );
  assert.equal(h.rpcs[0].args._item, row.id);
  assert.throws(() => h.apply({ ...data, authorized: false }), /authorized/);
  const claimed = handlers([row], { claimed: true });
  await claimed.apply(data);
  assert.equal(claimed.rpcs.length, 1);
});

test("actual handler enforces one-seller application and scan authorization", async () => {
  const h = handlers([row]);
  assert.throws(
    () => h.apply({ itemIds: [row.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], authorized: true }),
    /at most|Too big/i,
  );
  assert.throws(
    () => h.stage({ sourceProfileUrl: profile, mode: "refresh", items: [item] }),
    /authorization/,
  );
});

test("paused profiles are never handed to the scanner, for Refresh all or a single seller", () => {
  const all = [
    { sourceProfileUrl: "a", syncPaused: false },
    { sourceProfileUrl: "b", syncPaused: true },
  ];
  assert.deepEqual(
    scannableProfiles(all, null).profiles.map((p) => p.sourceProfileUrl),
    ["a"],
  );
  const single = scannableProfiles(all, "b");
  assert.equal(single.requested.length, 1);
  assert.equal(single.profiles.length, 0);
});

test("300+ discovered rows stage in 50-row chunks sharing one batch with one lookup per chunk", async () => {
  const h = handlers([]);
  const discovered = Array.from({ length: 320 }, (_, i) => ({
    ...item,
    sourceUrl: `https://www.vinted.com/items/${1000 + i}-n`,
  }));
  discovered[7] = { ...discovered[7], title: "" }; // malformed row
  let staged = 0,
    failed = 0,
    batchId;
  const failedUrls = [];
  for (let i = 0; i < discovered.length; i += 50) {
    const out = await h.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: discovered.slice(i, i + 50),
      ...(batchId ? { batchId } : {}),
    });
    batchId = out.batchId;
    staged += out.staged;
    failed += out.failed;
    failedUrls.push(...out.failedUrls);
  }
  assert.equal(staged, 319);
  assert.equal(failed, 1);
  assert.deepEqual(failedUrls, [discovered[7].sourceUrl]);
  assert.equal(h.lookups.count, 7);
  const batches = h.writes.filter(
    (w) => w.table === "fb_marketplace_import_batches" && w.action === "insert",
  );
  assert.equal(batches.length, 1);
  await assert.rejects(
    async () =>
      h.stage({
        sourceProfileUrl: profile,
        authorized: true,
        mode: "refresh",
        items: discovered.slice(0, 51),
      }),
    /at most 50/,
  );
});

test("actual staging reports sanitized per-row database failures, including singleton invalid rows", async () => {
  const h = handlers([], { writeError: { code: "23514", message: "private title and token" } });
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [item],
  });
  assert.equal(out.failed, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(out.failures)), [
    { rowIndex: 0, reason: "database_constraint" },
  ]);
  assert.doesNotMatch(JSON.stringify(out.failures), /private|token|title|sourceUrl/);
  const invalid = await handlers([]).stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [{ ...item, title: "" }],
  });
  assert.equal(invalid.failed, 1);
  assert.equal(invalid.failures[0].reason, "invalid_row");
});

test("a legacy client's finalization cannot remove 300 missing listings", async () => {
  const published = Array.from({ length: 300 }, (_, i) => ({
    ...row,
    source_url: `https://www.vinted.com/items/${5000 + i}`,
  }));
  const h = handlers(published);
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [],
    scan: { complete: true, termination: "count", challenged: false, unreadable: 0 },
    finalizeScan: true,
    seenUrls: [],
  });
  assert.equal(out.flaggedRemoved, 0);
  assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
  assert.equal(h.rpcs.length, 0);
});

test("claimed seller auto-routing still enforces verified email and seller setup", async () => {
  for (const option of [
    { claimed: true, verified: false },
    { claimed: true, setupActive: false },
  ]) {
    const h = handlers([row], option);
    await assert.rejects(
      h.apply({ itemIds: [row.id], mode: "managed", authorized: true }),
      /verify their email and complete seller setup/,
    );
    assert.equal(h.rpcs.length, 0);
  }
});

test("Clear list excludes recoverable removed import sources", async () => {
  const h = handlers([row], { archivedProfiles: [profile] });
  await h.clear();
  const write = h.writes.find((w) => w.table === "fb_marketplace_import_items");
  assert.ok(
    write.filters.some(
      (f) =>
        f[0] === "source_profile_url" && f[1] === "in" && f[2] === `(${JSON.stringify(profile)})`,
    ),
  );
});

test("actual queue getter excludes completed removals but preserves unresolved conflicts", async () => {
  const settled = {
    ...row,
    status: "possibly_removed",
    listing: { status: "cancelled" },
    last_applied_snapshot: { status: "cancelled" },
  };
  const h = handlers([
    settled,
    { ...settled, id: "unresolved", last_applied_snapshot: { status: "active" } },
    { ...row, id: "new", status: "draft", listing_id: null },
  ]);
  const queue = await h.queue();
  assert.deepEqual(
    Array.from(queue, (r) => r.id),
    ["unresolved", "new"],
  );
});

test("source unavailable and sold observations preserve active listings and their snapshots", async () => {
  for (const sold of [false, true]) {
    const h = handlers([row]);
    const result = await h.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: [{ sourceUrl: item.sourceUrl, unavailable: true, sold }],
    });
    assert.equal(result.failed, 0);
    assert.equal(result.flaggedRemoved, 0);
    assert.equal(result.preservedActive, 1);
    assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
    assert.equal(h.rpcs.length, 0);
  }
  const unknown = await handlers([]).stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [{ sourceUrl: item.sourceUrl, unavailable: true }],
  });
  assert.equal(unknown.failed, 0);
  assert.equal(unknown.staged, 0);
  assert.equal(unknown.flaggedRemoved, 0);
});

test("legacy removal suggestions cannot reach the publication RPC", async () => {
  const h = handlers([{ ...row, status: "possibly_removed", removed_reason: "unavailable" }]);
  await assert.rejects(
    h.apply({ itemIds: [row.id], mode: "managed", authorized: true }),
    /separate removal action/,
  );
  assert.equal(h.rpcs.length, 0);
  assert.equal(h.writes.length, 0);
});

test("fresh source data recaptures a cleared never-published item for review, never auto-publishes", async () => {
  const h = handlers([
    {
      ...row,
      status: "discarded",
      listing_id: null,
      listing: null,
      public_paths: ["old/wrong.jpg"],
    },
  ]);
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [{ ...item, photoUrls: ["https://images1.vinted.net/t/photo/test.jpg"] }],
  });
  assert.equal(out.recaptured, 1);
  assert.equal(out.staged, 1);
  assert.equal(out.updated, 0);
  assert.equal(out.flaggedRemoved, 0);
  const write = h.writes.find((w) => w.table === "fb_marketplace_import_items");
  assert.equal(write.action, "update");
  assert.equal(write.values.status, "draft");
  assert.equal(write.values.city, "Boise");
  assert.equal(write.values.title, item.title);
  assert.match(write.values.public_paths[0], /^_staging\/batch\/fresh-photo/);
  assert.ok(write.filters.some((f) => f[0] === "status" && f[1] === "discarded"));
  assert.ok(write.filters.some((f) => f[0] === "listing_id" && f[1] === null));
  assert.equal(h.rpcs.length, 0);
});

test("cleared published rows, offline listings, unavailable pages and incomplete recaptures stay untouched", async () => {
  for (const prior of [
    { ...row, status: "discarded", price_cents: item.priceCents, description: item.description },
    { ...row, status: "discarded", listing: { status: "cancelled" } },
  ]) {
    const h = handlers([prior]);
    const out = await h.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: [{ ...item, photoUrls: ["https://images1.vinted.net/t/photo/test.jpg"] }],
    });
    assert.equal(out.recaptured, 0);
    assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
  }
  for (const observation of [
    { sourceUrl: item.sourceUrl, unavailable: true },
    { ...item, photoUrls: [] },
  ]) {
    const h = handlers([{ ...row, status: "discarded", listing_id: null, listing: null }]);
    const out = await h.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: [observation],
    });
    assert.equal(out.recaptured, 0);
    assert.equal(h.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
  }
});

test("an explicit fresh manual batch can also recapture a never-published cleared row", async () => {
  const h = handlers([{ ...row, status: "discarded", listing_id: null, listing: null }]);
  const out = await h.stage({
    sourceProfileUrl: profile,
    items: [{ ...item, photoUrls: ["https://images1.vinted.net/t/photo/test.jpg"] }],
  });
  assert.equal(out.recaptured, 1);
  assert.equal(out.staged, 1);
  assert.equal(h.rpcs.length, 0);
});

test("a cleared live review row can stage a genuinely new source update without recreating or removing its listing", async () => {
  const h = handlers([{ ...row, status: "discarded" }]);
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [item],
  });
  assert.equal(out.updated, 1);
  assert.equal(out.staged, 0);
  assert.equal(out.recaptured, 0);
  assert.equal(out.flaggedRemoved, 0);
  const write = h.writes.find((w) => w.table === "fb_marketplace_import_items");
  assert.equal(write.values.status, "needs_update");
  assert.ok(write.filters.some(([key, value]) => key === "status" && value === "discarded"));
  assert.equal(h.rpcs.length, 0);
  const missing = handlers([{ ...row, status: "discarded" }]);
  const kept = await missing.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [{ sourceUrl: item.sourceUrl, unavailable: true }],
  });
  assert.equal(kept.preservedActive, 1);
  assert.equal(missing.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
});

test("R2 staging returns confirmed photo-preview needs without a draft write and preserves supplied previews on retry", async () => {
  class ImportPhotoPreviewRequired extends Error {
    constructor() {
      super("Browser preview required");
      this.prepared = [];
      this.sources = [
        {
          url: "https://images.vinted.net/photo.jpg",
          sourceSha256: "a".repeat(64),
          bytes: 10,
          contentType: "image/jpeg",
        },
      ];
    }
  }
  let photoCalls = 0;
  const f = handlers([], {
    photoMode: "r2",
    photoStore: {},
    photoBackend: {
      ImportPhotoPreviewRequired,
      stageImportedPhotos: async (_batch, urls, previews) => {
        photoCalls++;
        assert.deepEqual([...urls], ["https://images.vinted.net/photo.jpg"]);
        if (!previews.length) throw new ImportPhotoPreviewRequired();
        assert.equal(previews[0].sourceSha256, "a".repeat(64));
        return ["_staging/batch/photo.jpg"];
      },
    },
  });
  const item = {
    sourceUrl: "https://www.vinted.com/items/99-new",
    title: "New item",
    description: "A useful item description",
    priceCents: 1000,
    photoUrls: ["https://images.vinted.net/photo.jpg"],
  };
  const first = await f.stage({ sourceProfileUrl: profile, items: [item] });
  assert.equal(first.staged, 0);
  assert.equal(first.failed, 1);
  assert.equal(first.failures[0].reason, "photo_preview_required");
  assert.equal(first.photoPreviewRequests[0].rowIndex, 0);
  assert.equal(
    f.writes.some((w) => w.table === "fb_marketplace_import_items"),
    false,
  );
  const second = await f.stage({
    sourceProfileUrl: profile,
    batchId: first.batchId,
    items: [
      {
        ...item,
        preparedPhotoPreviews: [
          {
            url: item.photoUrls[0],
            sourceSha256: "a".repeat(64),
            contentType: "image/png",
            base64: "AQID",
          },
        ],
      },
    ],
  });
  assert.equal(second.staged, 1);
  assert.equal(second.failed, 0);
  assert.equal(photoCalls, 2);
  const draft = f.writes.find((w) => w.table === "fb_marketplace_import_items").values;
  assert.deepEqual([...draft.public_paths], ["_staging/batch/photo.jpg"]);
  assert.deepEqual([...draft.evidence_paths], ["_staging/batch/photo.jpg"]);
});

test("unchanged published refresh rows never request or prepare R2 photos", async () => {
  const f = handlers([row], {
    photoMode: "r2",
    photoBackend: {
      stageImportedPhotos: () =>
        assert.fail("Existing unchanged listings must not download or prepare photos"),
    },
  });
  const result = await f.stage({
    sourceProfileUrl: profile,
    mode: "refresh",
    authorized: true,
    items: [
      {
        sourceUrl: row.source_url,
        title: row.title,
        description: row.description,
        priceCents: row.price_cents,
        photoUrls: ["https://images.vinted.net/photo.jpg"],
      },
    ],
  });
  assert.equal(result.failed, 0);
  assert.equal(result.photoPreviewRequests.length, 0);
  assert.equal(f.writes.filter((w) => w.table.startsWith("storage:")).length, 0);
});

test("original handoff requires admin before reading any photo and explicitly disables caching", async () => {
  let calls = 0;
  const input = {
    url: "https://images.vinted.net/photo.jpg",
    sourceSha256: "a".repeat(64),
    bytes: 3,
    contentType: "image/jpeg",
  };
  const backend = {
    importPreviewSource: async (data) => {
      calls++;
      return { ...data, base64: "AQID" };
    },
  };
  const denied = handlers([], { isAdmin: false, photoBackend: backend });
  await assert.rejects(() => denied.previewSource(input), /Administrator/);
  assert.equal(calls, 0);
  const allowed = handlers([], { photoBackend: backend });
  const source = await allowed.previewSource(input);
  assert.equal(calls, 1);
  assert.equal(source.base64, "AQID");
  assert.deepEqual(allowed.headers, [["Cache-Control", "private, no-store"]]);
  assert.throws(() => allowed.previewSource({ ...input, bytes: 12 * 1024 * 1024 + 1 }));
  assert.equal(calls, 1);
});

test("large preview responses stay bounded by handing remaining originals to the browser individually", async () => {
  const urls = Array.from({ length: 8 }, (_, i) => `https://images.vinted.net/${i}.jpg`);
  class ImportPhotoPreviewRequired extends Error {
    constructor() {
      super("Needs browser");
      this.allSources = urls.map((url) => ({
        url,
        sourceSha256: "a".repeat(64),
        bytes: 100,
        contentType: "image/jpeg",
      }));
      this.sources = this.allSources.slice(7);
      this.prepared = urls
        .slice(0, 7)
        .map((url) => ({
          url,
          sourceSha256: "a".repeat(64),
          contentType: "image/png",
          base64: "A".repeat(700000),
        }));
    }
  }
  const f = handlers([], {
    photoMode: "r2",
    photoStore: {},
    photoBackend: {
      ImportPhotoPreviewRequired,
      stageImportedPhotos: async () => {
        throw new ImportPhotoPreviewRequired();
      },
    },
  });
  const result = await f.stage({
    sourceProfileUrl: profile,
    items: [
      {
        sourceUrl: "https://www.vinted.com/items/99-new",
        title: "New item",
        priceCents: 100,
        photoUrls: urls,
      },
    ],
  });
  assert.equal(result.failed, 1);
  assert.equal(result.photoPreviewRequests[0].prepared.length, 0);
  assert.equal(result.photoPreviewRequests[0].sources.length, 8);
  assert.ok(JSON.stringify(result).length < 10000);
  assert.equal(
    f.writes.some((w) => w.table === "fb_marketplace_import_items"),
    false,
  );
});
test("prepared rows are bounded to single-row retries without rejecting other valid batch rows", async () => {
  const f = handlers([]);
  const item = {
    sourceUrl: "https://www.vinted.com/items/99-new",
    title: "New item",
    priceCents: 100,
    photoUrls: [],
  };
  const result = await f.stage({
    sourceProfileUrl: profile,
    items: [
      {
        ...item,
        preparedPhotoPreviews: [
          {
            url: "https://images.vinted.net/photo.jpg",
            sourceSha256: "a".repeat(64),
            contentType: "image/png",
            base64: "AQID",
          },
        ],
      },
      { ...item, sourceUrl: "https://www.vinted.com/items/100-other" },
    ],
  });
  assert.equal(result.failed, 1);
  assert.equal(result.staged, 1);
  assert.equal(result.failures[0].rowIndex, 0);
  assert.equal(result.failures[0].reason, "invalid_row");
});
