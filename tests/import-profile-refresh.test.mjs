import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { canonicalImportSource, mayInferScanAbsence, readAllImportPages, runImportRows } from "../src/lib/import-refresh.ts";

test("new discovery deduplicates tracking and changed source titles across all five sites", () => {
  const pairs = [
    ["https://www.facebook.com/marketplace/profile/1/", "https://m.facebook.com/marketplace/item/2/?ref=x", "https://www.facebook.com/marketplace/item/2/"],
    ["https://classifieds.ksl.com/search/member/1", "https://classifieds.ksl.com/listing/2?ref=x", "https://classifieds.ksl.com/listing/2"],
    ["https://www.vinted.com/member/1", "https://www.vinted.com/items/2-shirt", "https://www.vinted.com/items/2-new-title"],
    ["https://www.whatnot.com/user/test", "https://www.whatnot.com/listing/2?ref=x", "https://www.whatnot.com/listing/2"],
    ["https://www.diesel-depot.com/inventory/", "https://www.diesel-depot.com/inventory/?/listing/for-sale/2/old", "https://www.diesel-depot.com/inventory/?/listing/for-sale/2/new"],
  ];
  for (const [profile, a, b] of pairs) {
    const known = new Set([canonicalImportSource(profile, a)]);
    assert.equal(known.has(canonicalImportSource(profile, b)), true);
    assert.equal(known.has(canonicalImportSource(profile, a.replace(/2/, "3"))), false);
  }
  assert.throws(() => canonicalImportSource(pairs[0][0], "https://evil.test/item/2"));
});

test("only a complete terminated unchallenged scan with zero unread rows permits absence", () => {
  const full = { complete: true, termination: "end", challenged: false, unreadable: 0 };
  assert.equal(mayInferScanAbsence(full), true);
  for (const change of [{ complete: false }, { termination: "incomplete" }, { challenged: true }, { unreadable: 31 }])
    assert.equal(mayInferScanAbsence({ ...full, ...change }), false);
});

test("1307 queue rows load despite a server cap below page size", async () => {
  const input = Array.from({ length: 1307 }, (_, id) => ({ id }));
  const rows = await readAllImportPages(async (offset) => ({ rows: input.slice(offset, offset + 31), total: input.length }));
  assert.deepEqual(rows, input);
  await assert.rejects(readAllImportPages(async () => ({ rows: [], total: 300 })), /fully loaded/);
});

test("large row application preserves failed rows and idempotent retry", async () => {
  const ids = Array.from({ length: 601 }, (_, n) => String(n));
  const applied = new Set();
  let fail = true, last;
  const apply = async (id) => {
    if (id === "300" && fail) throw Error("interrupted");
    const created = !applied.has(id); applied.add(id); return { created };
  };
  const first = await runImportRows(ids, apply, (done, total) => { last = [done, total]; });
  assert.equal(applied.size, 600);
  assert.deepEqual(first.failures.map((f) => f.itemId), ["300"]);
  assert.deepEqual(last, [601, 601]);
  fail = false;
  const retry = await runImportRows(ids, apply);
  assert.equal(retry.results.filter((r) => r.created).length, 1);
  assert.equal(applied.size, 601);
});

const load = (name) => readFileSync(new URL(`../tools/fb-import-extension/${name}`, import.meta.url), "utf8");
function profileHarness(site, pages) {
  let current = "", visits = 0, removed = 0;
  const profile = site === "KSL" ? "https://classifieds.ksl.com/search/member/1" : site === "Diesel Depot" ? "https://www.diesel-depot.com/inventory/" : "https://www.vinted.com/member/1";
  const c = vm.createContext({ URL, Map, Set,
    KSL_MEMBER_RE: /ksl/, VINTED_MEMBER_RE: /vinted/, WHATNOT_USER_RE: /whatnot/, DEALER_INVENTORY_RE: /diesel/,
    isBotCheckPage() {}, kslCollectFromMemberPage() {}, vintedCollectFromProfile() {}, whatnotCollectFromShop() {}, dealerCollectInventoryPage() {},
    kslToImportItem: (i) => i, vintedToImportItem: (i) => i, whatnotToImportItem: (i) => i, dealerToImportItem: (i) => i,
    dealerCatalogKind: () => "trucks", dealerCatalogHeadingMatches: () => true,
    dealerListingId: (u) => u.split("/").pop(),
    readerForSource: () => ({ idOf: (u) => u.split("/").pop() }),
    chrome: { windows: { create: async () => ({ id: 1, tabs: [{ id: 1 }] }), remove: async () => { removed++; } }, tabs: { update: async (_id, { url }) => { current = url; visits++; } } },
    waitForPage: async () => true,
    exec: async (_id, fn) => fn.name === "isBotCheckPage" ? false : pages[current],
  });
  vm.runInContext(load("profile-scan.js"), c);
  return { c, profile, stats: () => ({ visits, removed }) };
}
test("KSL follows seller-bound pagination and refuses cycles or wrong sellers", async () => {
  const p = "https://classifieds.ksl.com/search/member/1";
  const pages = { [p]: { recognized: true, items: [{ sourceUrl: "https://classifieds.ksl.com/listing/1" }], nextUrl: p + "?page=2" },
    [p + "?page=2"]: { recognized: true, items: [{ sourceUrl: "https://classifieds.ksl.com/listing/2" }] } };
  let h = profileHarness("KSL", pages);
  let result = await h.c.collectSellerScan(p, h.c.profileScanConfig(p), () => {});
  assert.equal(result.items.length, 2); assert.equal(result.scan.complete, true); assert.equal(h.stats().removed, 1);
  pages[p + "?page=2"].nextUrl = p;
  h = profileHarness("KSL", pages);
  result = await h.c.collectSellerScan(p, h.c.profileScanConfig(p), () => {});
  assert.equal(result.scan.complete, false);
  pages[p].nextUrl = "https://classifieds.ksl.com/search/member/2";
  h = profileHarness("KSL", pages);
  result = await h.c.collectSellerScan(p, h.c.profileScanConfig(p), () => {});
  assert.equal(result.scan.complete, false); assert.equal(h.stats().visits, 1);
});
test("Diesel Depot reconciles cumulative pages, not the size of its final page", async () => {
  const p = "https://www.diesel-depot.com/inventory/", a = p + "?/listings/for-sale/trucks", b = a + "?page=2";
  const h = profileHarness("Diesel Depot", { [p]: { sections: [a], items: [] }, [a]: { recognized: true, heading: "Trucks", expected: 3, pageCount: 2, items: [{ sourceUrl: p + "1" }, { sourceUrl: p + "2" }], nextUrl: b }, [b]: { recognized: true, heading: "Trucks", expected: 3, pageCount: 1, items: [{ sourceUrl: p + "3" }] } });
  const result = await h.c.collectSellerScan(p, h.c.profileScanConfig(p), () => {});
  assert.equal(result.scan.complete, true); assert.equal(result.items.length, 3);
});
test("Vinted count shortfall is incomplete, not absence evidence", async () => {
  const p = "https://www.vinted.com/member/1";
  const h = profileHarness("Vinted", { [p]: { expected: 300, items: [{ sourceUrl: "https://www.vinted.com/items/1" }] } });
  const result = await h.c.collectSellerScan(p, h.c.profileScanConfig(p), () => {});
  assert.equal(result.scan.complete, false);
});