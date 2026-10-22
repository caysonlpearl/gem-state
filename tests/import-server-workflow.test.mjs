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
} from "../src/lib/import-refresh.ts";
import { canonicalSellerSourceProfile, dieselDepotListingId } from "../src/lib/seller-claims.ts";

// Exercise actual handler bodies offline. Imports are replaced only at the boundary.
function handlers(rows, { claimed = false, paused = false, writeError = null, verified = true, setupActive = true } = {}) {
  const writes = [],
    rpcs = [],
    lookups = { count: 0 };
  const db = {
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
        not() {
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
            table === "managed_import_sellers"
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
    console,
    URL,
    Map,
    Set,
    canonicalImportSource,
    mayInferScanAbsence,
    stagingFailureCode,
    canonicalSellerSourceProfile,
    dieselDepotListingId,
    requireSupabaseAuth: {},
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
      "\nglobalThis.stage = stageFacebookImportBatch; globalThis.apply = publishFacebookImportItems;",
    c,
  );
  const context = { userId: "admin", supabase: { rpc: async () => ({ data: true, error: null }) } };
  return {
    stage: (data) => c.stage({ data, context }),
    apply: (data) => c.apply({ data, context }),
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
test("actual absence handler leaves unread/incomplete scans unchanged, and bulk-flags only unseen published rows", async () => {
  const scan = { complete: true, termination: "end", challenged: false, unreadable: 0 };
  for (const evidence of [{ ...scan, unreadable: 31 }, { ...scan, complete: false }, scan]) {
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
    assert.equal(outcome.flaggedRemoved, evidence === scan ? 1 : 0);
  }
  // One finalize call bulk-marks every unseen published row in a single update.
  const missing = { ...row, source_url: `${row.source_url}?other` };
  const bulk = handlers([row, missing]);
  const bulkOutcome = await bulk.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [],
    scan,
    finalizeScan: true,
    seenUrls: [],
  });
  assert.equal(bulkOutcome.flaggedRemoved, 2);
  const bulkUpdate = bulk.writes.find(
    (w) => w.action === "update" && w.values.status === "possibly_removed",
  );
  assert.ok(bulkUpdate);
  // A row the complete scan did see is never flagged.
  const seen = handlers([row]);
  const kept = await seen.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [],
    scan,
    finalizeScan: true,
    seenUrls: [row.source_url],
  });
  assert.equal(kept.flaggedRemoved, 0);
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

test("one finalization bulk-flags 300 confirmed-absent published rows in bounded updates only", async () => {
  const published = Array.from({ length: 300 }, (_, i) => ({
    ...row,
    source_url: `https://www.vinted.com/items/${5000 + i}-p`,
  }));
  const edited = { ...row, source_url: "https://www.vinted.com/items/9-e", status: "needs_update" };
  const seen = { ...row, source_url: "https://www.vinted.com/items/8-s" };
  const scan = { complete: true, termination: "end", challenged: false, unreadable: 0 };
  const h = handlers([...published, edited, seen]);
  const out = await h.stage({
    sourceProfileUrl: profile,
    authorized: true,
    mode: "refresh",
    items: [],
    scan,
    finalizeScan: true,
    seenUrls: [seen.source_url],
  });
  assert.equal(out.flaggedRemoved, 300);
  assert.equal(h.lookups.count, 1);
  const flags = h.writes.filter(
    (w) => w.action === "update" && w.values.status === "possibly_removed",
  );
  assert.equal(flags.length, 3);
  const flagged = flags.flatMap((w) => w.filters.find(([k]) => k === "source_url")[1]);
  assert.ok(flags.every((w) => w.filters.find(([k]) => k === "source_url")[1].length <= 100));
  assert.ok(flags.every((w) => w.filters.some(([k, v]) => k === "status" && v === "published")));
  assert.ok(!flagged.includes(edited.source_url) && !flagged.includes(seen.source_url));
  const reasons = h.writes.filter(
    (w) => w.action === "update" && w.values.removed_reason === "missing",
  );
  assert.equal(reasons.length, 3);

  for (const bad of [
    { ...scan, complete: false },
    { ...scan, unreadable: 2 },
  ]) {
    const f = handlers([...published]);
    const res = await f.stage({
      sourceProfileUrl: profile,
      authorized: true,
      mode: "refresh",
      items: [],
      scan: bad,
      finalizeScan: true,
      seenUrls: [],
    });
    assert.equal(res.flaggedRemoved, 0);
    assert.equal(f.writes.filter((w) => w.table === "fb_marketplace_import_items").length, 0);
  }
});


test("claimed seller auto-routing still enforces verified email and seller setup", async () => {
  for (const option of [{claimed:true,verified:false}, {claimed:true,setupActive:false}]) {
    const h=handlers([row],option);
    await assert.rejects(h.apply({itemIds:[row.id],mode:"managed",authorized:true}), /verify their email and complete seller setup/);
    assert.equal(h.rpcs.length,0);
  }
});
