import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { z } from "zod";
import { canonicalImportSource, mayInferScanAbsence } from "../src/lib/import-refresh.ts";
import { canonicalSellerSourceProfile, dieselDepotListingId } from "../src/lib/seller-claims.ts";

// Exercise actual handler bodies offline. Imports are replaced only at the boundary.
function handlers(rows, { claimed = false } = {}) {
  const writes = [],
    rpcs = [];
  const db = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email_confirmed_at: "confirmed", app_metadata: {} } },
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
        in() {
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
              ? { id: "seller", owner_user_id: "owner", sync_enabled: true }
              : table === "seller_profiles"
                ? { terms_accepted_at: "accepted", status: "active" }
                : table === "fb_marketplace_import_batches"
                  ? { id: "batch", seller_name: "Seller" }
                  : rows;
          resolve({ data, error: null });
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
      allImportRows: async () => rows,
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
test("actual absence handler leaves unread/incomplete scans unchanged, and flags only the requested missing row", async () => {
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
      removalSourceUrl: row.source_url,
    });
    assert.equal(outcome.flaggedRemoved, evidence === scan ? 1 : 0);
  }
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
  await assert.rejects(claimed.apply(data), /already claimed/);
  assert.equal(claimed.rpcs.length, 0);
});
