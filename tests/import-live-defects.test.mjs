import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { sanitizeStagingFailures, stagingFailureCode } from "../src/lib/import-refresh.ts";

const source = (name) => readFileSync(new URL(`../tools/fb-import-extension/${name}`, import.meta.url), "utf8");
function card(id) {
  return { getAttribute: (key) => key === "data-item-id" ? String(id) : "Listing", href: `https://classifieds.ksl.com/listing/${id}` };
}
function kslHarness({ short = false, duplicate = false, market = false } = {}) {
  let polls = 0;
  const document = {
    body: { innerText: "64 Results\n1–64 of 64", scrollHeight: 1000 },
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === "script") return market ? [{ textContent: '{"id":64,"title":"Listing","contact":{"memberId":1},"marketType":"offer"}' }] : [];
      polls++;
      const count = short || polls < 3 ? 63 : 64;
      const cards = Array.from({ length: count }, (_, i) => card(i + 1));
      return duplicate ? [...cards.slice(0, 63), card(63)] : cards;
    },
  };
  const c = vm.createContext({ document, location: { pathname: "/search/member/1", href: "https://classifieds.ksl.com/search/member/1" }, window: { scrollTo() {} }, setTimeout: (fn) => fn() });
  vm.runInContext(source("ksl.js"), c);
  return c;
}
test("KSL current 64-card range waits for newly hydrated last card, including new marketType", async () => {
  const result = await kslHarness({ market: true }).kslCollectFromMemberPage();
  assert.equal(result.expected, 64);
  assert.equal(result.pageCount, 64);
  assert.equal(result.items.length, 64);
  assert.equal(result.items.at(-1).sourceUrl, "https://classifieds.ksl.com/listing/64");
  assert.equal(result.enumerationComplete, true);
});
test("KSL stable short count or duplicate cards never certify full enumeration", async () => {
  for (const input of [{ short: true }, { duplicate: true }]) {
    const result = await kslHarness(input).kslCollectFromMemberPage();
    assert.equal(result.items.length, 63);
    assert.equal(result.expected, 64);
    assert.equal(result.enumerationComplete, false);
  }
});
test("KSL Results-only count is recognized without range text", async () => {
  const c = kslHarness();
  c.document.body.innerText = "64 Results";
  const result = await c.kslCollectFromMemberPage();
  assert.equal(result.expected, 64);
  assert.equal(result.enumerationComplete, true);
});

function vinted({ data = [], marker = "", dom = {}, body = "", malformed = false } = {}) {
  const element = (text) => ({ innerText: text, textContent: text, getAttribute: () => null, getClientRects: () => [1] });
  const c = vm.createContext({
    location: { pathname: "/items/2-shirt" },
    document: {
      body: { innerText: body },
      querySelectorAll(selector) {
        if (selector === "script[type='application/ld+json']") return malformed ? [{ textContent: "{" }] : data.map((node) => ({ textContent: JSON.stringify(node) }));
        if (selector.includes("[role='alert']")) return marker ? [element(marker)] : [];
        if (selector.includes("item-title")) return dom.title ? [element(dom.title)] : [];
        if (selector.includes("item-description")) return dom.description ? [element(dom.description)] : [];
        if (selector.includes("item-price")) return dom.price ? [element(dom.price)] : [];
        if (selector.includes("item-photo-")) return dom.photo ? [{ src: dom.photo }] : [];
        return [];
      },
    },
  });
  vm.runInContext(source("vinted.js"), c);
  return JSON.parse(JSON.stringify(c.vintedExtractItemInPage(true)));
}
const product = { "@type": "Product", name: "Shirt", description: "Cotton", offers: { price: "12.50", availability: "https://schema.org/InStock" }, image: "https://images1.vinted.net/t/abc/a.webp?s=signed" };
test("Vinted explicit Removed marker overrides stale InStock without becoming unreadable", () => {
  assert.deepEqual(vinted({ data: [product], marker: "Removed!" }), { unavailable: true, sold: false });
});
test("Vinted ambiguous removed words and unknown offer states never imply unavailable", () => {
  const result = vinted({ data: [{ ...product, description: "Tag removed!", offers: { price: 12.5, availability: "https://schema.org/PreOrder" } }], body: "Similar items\nRemoved!", marker: "Tag removed!" });
  assert.equal(result.unavailable, undefined);
  assert.equal(result.priceCents, 1250);
});
test("Vinted reads graph/type arrays and nested priceSpecification and image objects", () => {
  const result = vinted({ data: [{ "@graph": [{ ...product, "@type": ["Thing", "Product"], offers: [{ offers: [{ priceSpecification: { price: "12.50" } }] }], image: [{ contentUrl: product.image }] }] }] });
  assert.equal(result.title, "Shirt");
  assert.equal(result.priceCents, 1250);
  assert.deepEqual(result.photoUrls, [product.image]);
  assert.equal(result.incomplete, undefined);
});
test("Vinted missing JSON-LD uses scoped visible details and gallery", () => {
  const result = vinted({ dom: { title: "Shirt", description: "Cotton", price: "$12.50", photo: product.image } });
  assert.equal(result.priceCents, 1250);
  assert.equal(result.incomplete, undefined);
});
test("Vinted missing or malformed listing data is unreadable, not removed", () => {
  for (const malformed of [false, true]) {
    const result = vinted({ malformed });
    assert.equal(result.unavailable, undefined);
    assert.equal(result.incomplete, true);
    assert.equal(result.unreadableReason, malformed ? "structured_data_invalid" : "structured_data_missing");
  }
});
test("Vinted chooses current product rather than recommendation JSON-LD", () => {
  const result = vinted({ data: [{ ...product, url: "https://www.vinted.com/items/3", name: "Wrong", offers: { availability: "https://schema.org/OutOfStock" } }, { ...product, url: "https://www.vinted.com/items/2" }] });
  assert.equal(result.title, "Shirt");
  assert.equal(result.unavailable, undefined);
});
test("staging diagnostics expose allowlisted codes and report row numbers only", () => {
  assert.equal(stagingFailureCode({ code: "23505", message: "private title token" }, "write"), "database_conflict");
  assert.equal(stagingFailureCode(new Error("private signed URL"), "photo"), "photo_download_failed");
  const safe = sanitizeStagingFailures([{ rowIndex: 2, reason: "database_conflict", title: "private", sourceUrl: "secret" }, { rowIndex: 3, reason: "private token" }, { rowIndex: 55, reason: "database_constraint" }], 50, 50);
  assert.deepEqual(safe, [{ rowIndex: 52, reason: "database_conflict" }, { rowIndex: 53, reason: "staging_write_failed" }]);
  assert.doesNotMatch(JSON.stringify(safe), /private|token|secret|sourceUrl|title/);
});