import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Execute the actual injected function in Chromium, not a selector mock.
// No navigation/network requests or real seller data: synthetic DOM only.
const script = readFileSync(
  new URL("../tools/fb-import-extension/ksl.js", import.meta.url),
  "utf8",
);
const html = `
<header><h1>Search KSL</h1><span>$999</span><img src="https://image.ksldigital.com/logo.jpg"></header>
<main>
  <a href="https://classifieds.ksl.com/search/cat/Industrial/sub/Shop%20Tools">Shop Tools</a>
  <h1>Shop cabinet | Boise, ID</h1><span data-testid="listing-price">$1,234.50</span>
  <div role="tabpanel"><h2>Description</h2><p>Solid cabinet.</p><p>Pickup locally.</p>
    <h3>Condition</h3><p>Used - Excellent</p></div>
  <div data-testid="listing-gallery">
    <img src="https://image.ksldigital.com/cabinet.jpg?width=900">
    <img src="https://image.ksldigital.com/detail.jpg?width=900">
    <img src="https://image.ksldigital.com/cabinet.jpg?width=100">
    <img src="https://example.com/advert.jpg">
  </div>
  <section class="recommendations"><h2>Sold</h2><span>$25</span>
    <div class="gallery"><img src="https://image.ksldigital.com/recommendation.jpg"></div></section>
  <aside><div aria-label="Image gallery"><img src="https://image.ksldigital.com/advert.jpg"></div></aside>
</main>
<footer><img src="https://image.ksldigital.com/footer.jpg"></footer>`;
const scenarios = [
  { name: "full", html, photos: true },
  {
    name: "refresh",
    html: html.replace(/<div data-testid="listing-gallery">[\s\S]*?<\/div>/, ""),
    photos: false,
  },
  ...[
    ["title", /<h1>Shop cabinet[^<]*<\/h1>/],
    ["price", /<span data-testid="listing-price">[^<]*<\/span>/],
    ["description", /<p>Solid cabinet\.<\/p><p>Pickup locally\.<\/p>/],
    ["condition", /<h3>Condition<\/h3><p>Used - Excellent<\/p>/],
    ["breadcrumb", /<a href=[^>]+>Shop Tools<\/a>/],
    ["gallery", /<div data-testid="listing-gallery">[\s\S]*?<\/div>/],
  ].map(([name, missing]) => ({ name, html: html.replace(missing, ""), photos: true })),
  {
    name: "ambiguous",
    html: html.replace(
      "Solid cabinet.",
      "The old tag says sold. Listing has been removed from my garage.",
    ),
    photos: true,
  },
  {
    name: "sold",
    html: html.replace("<main>", '<main><div data-testid="listing-status">Sold!</div>'),
    photos: true,
  },
  {
    name: "removed",
    html: html.replace(
      "<main>",
      '<main><div role="alert">This listing is no longer available.</div>',
    ),
    photos: true,
  },
  {
    name: "hidden",
    html: html.replace(
      "<main>",
      '<main><div role="alert" hidden>This listing is no longer available.</div>',
    ),
    photos: true,
  },
  { name: "zero", html: html.replace("$1,234.50", "$0"), photos: true },
  { name: "unknown-price", html: html.replace("$1,234.50", "Contact for price"), photos: true },
  { name: "no-location", html: html.replace(" | Boise, ID", ""), photos: true },
];
const run = spawnSync(
  "python3",
  [
    "-c",
    `
import sys, json, asyncio
from playwright.async_api import async_playwright
data = json.load(sys.stdin)
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width":1280,"height":1800})
        await page.route("**/*", lambda route: route.abort())
        results = {}
        for case in data["scenarios"]:
            await page.set_content(case["html"])
            await page.add_script_tag(content=data["script"])
            results[case["name"]] = await page.evaluate("photos => kslExtractListingInPage(photos)", case["photos"])
        print(json.dumps(results))
        await browser.close()
asyncio.run(main())
`,
  ],
  { input: JSON.stringify({ script, scenarios }), encoding: "utf8", timeout: 60000 },
);
assert.equal(run.status, 0, run.stderr);
const results = JSON.parse(run.stdout);

test("KSL no embedded object reads visible listing fields and listing-only gallery", () => {
  assert.deepEqual(results.full, {
    title: "Shop cabinet | Boise, ID",
    priceCents: 123450,
    description: "Solid cabinet.\n\nPickup locally.",
    kslCondition: "Used - Excellent",
    kslCategory: "Industrial",
    kslSubCategory: "Shop Tools",
    city: "Boise",
    state: "ID",
    photoUrls: [
      "https://image.ksldigital.com/cabinet.jpg",
      "https://image.ksldigital.com/detail.jpg",
    ],
  });
  assert.equal(results.zero.priceCents, 0);
  assert.equal(results.zero.incomplete, undefined);
});
for (const missing of [
  "title",
  "price",
  "description",
  "condition",
  "breadcrumb",
  "gallery",
  "unknown-price",
]) {
  test(`KSL absent ${missing} stays incomplete, never unavailable`, () => {
    assert.equal(results[missing].incomplete, true);
    assert.equal(results[missing].unreadableReason, "price_or_details_missing");
    assert.equal(results[missing].unavailable, undefined);
  });
}
test("KSL header, recommendations and unrelated galleries cannot replace missing listing photos", () => {
  assert.deepEqual(results.gallery.photoUrls, []);
  assert.equal(results.price.priceCents, null);
  assert.equal(results.title.title, "");
});
test("KSL explicit visible sold/removed states override detail data; ambiguous/hidden states do not", () => {
  assert.deepEqual(results.sold, { unavailable: true, sold: true });
  assert.deepEqual(results.removed, { unavailable: true });
  for (const name of ["ambiguous", "hidden"]) {
    assert.equal(results[name].unavailable, undefined);
    assert.equal(results[name].incomplete, undefined);
  }
});
test("KSL refresh needs no photos and missing optional location does not make a full read incomplete", () => {
  assert.equal(results.refresh.incomplete, undefined);
  assert.equal(results.refresh.photoUrls, undefined);
  assert.equal(results["no-location"].incomplete, undefined);
  assert.equal(results["no-location"].city, "");
  assert.equal(results["no-location"].state, "");
});
