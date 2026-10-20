import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  canonicalSellerSourceProfile,
  dieselDepotListingId,
  importAbsenceCanFlagRemoved,
} from "../src/lib/seller-claims.ts";
const source = readFileSync(
  new URL("../tools/fb-import-extension/dealer.js", import.meta.url),
  "utf8",
);
const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/dealer-import/diesel-depot-${name}.json`, import.meta.url),
      "utf8",
    ),
  );
function reader(data) {
  const scripts = data.structured.map((d) => ({ textContent: JSON.stringify(d) }));
  const context = vm.createContext({
    URL,
    location: new URL(data.url),
    inferCategory: () => "general",
    document: {
      body: { innerText: data.body || "" },
      querySelector: () => null,
      querySelectorAll(selector) {
        if (selector.startsWith("script")) return scripts;
        if (selector === ".detail__specs-label")
          return (data.specs || []).map(([label, value]) => ({
            textContent: label,
            nextElementSibling: { textContent: value },
          }));
        if (selector === ".mc-item.mc-img img.mc-img-normal")
          return (data.photos || []).map((src, i) => ({
            currentSrc: i ? "" : src,
            src: "",
            getAttribute: () => src,
          }));
        if (selector === ".list-listing-title-link")
          return (data.cards || []).map((a) => ({ href: a.href, textContent: a.text }));
        if (selector.startsWith("a["))
          return (data.links || []).map((a) => ({ href: a.href, textContent: a.text }));
        if (selector === "h2") return (data.headings || []).map((textContent) => ({ textContent }));
        return [];
      },
    },
  });
  vm.runInContext(source, context);
  return (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}
test("dealer URL identity survives category, title and tracking changes but rejects other hosts", () => {
  const u = fixture("truck").url;
  assert.equal(dieselDepotListingId(u), "251818887");
  assert.equal(
    dieselDepotListingId(u.replace("2022-ford-f750-sd-flatbed-dump-trucks", "updated-title")),
    "251818887",
  );
  assert.equal(canonicalSellerSourceProfile(u), "https://www.diesel-depot.com/inventory/");
  for (const bad of [
    u.replace("https:", "http:"),
    u.replace("www.diesel-depot.com", "www.diesel-depot.com.evil.test"),
    u.replace("/inventory/", "/other/"),
    u.replace("https://", "https://user:password@"),
  ])
    assert.equal(dieselDepotListingId(bad), null);
  assert.throws(() =>
    canonicalSellerSourceProfile(
      u.replace("www.diesel-depot.com", "www.diesel-depot.com.evil.test"),
    ),
  );
  assert.equal(importAbsenceCanFlagRemoved(canonicalSellerSourceProfile(u), false), false);
  assert.equal(
    importAbsenceCanFlagRemoved("https://www.facebook.com/marketplace/profile/1/", true),
    false,
  );
  assert.equal(
    importAbsenceCanFlagRemoved("https://www.facebook.com/marketplace/profile/1/", false),
    true,
  );
});
test("real truck detail preserves asking price, machine location, condition, VIN and eight distinct lazy photos", () => {
  const run = reader(fixture("truck"));
  const d = run("dealerExtractListingInPage(true)");
  assert.equal(d.priceCents, 6890000);
  assert.equal(d.city, "Boise");
  assert.equal(d.state, "ID");
  assert.equal(d.vehicle.year, 2022);
  assert.equal(d.vehicle.make, "FORD");
  assert.equal(d.vehicle.vin, "1FDXF7DX6NDF08126");
  assert.equal(d.vehicle.mileage, 10482);
  assert.equal(d.photoUrls.length, 8);
  assert.equal(new Set(d.photoUrls.map((u) => new URL(u).searchParams.get("id"))).size, 8);
  assert.ok(d.photoUrls.every((u) => new URL(u).searchParams.has("checksum")));
  assert.match(d.description, /Stock Number: 7002/);
  const item = run(
    "dealerToImportItem({...dealerExtractListingInPage(true),sourceUrl:location.href})",
  );
  assert.equal(item.categorySlug, "cars-trucks");
  assert.equal(item.condition, "used_good");
});
test("truck bodies, trailers, and construction products import to their appropriate categories", () => {
  for (const [name, category, condition] of [
    ["body", "auto-parts", "new_without_tags"],
    ["trailer", "trailers", "new_without_tags"],
    ["equipment", "industrial", "used_good"],
  ]) {
    const run = reader(fixture(name));
    const d = run("dealerExtractListingInPage(true)");
    assert.ok(d && !d.priceUnknown, name);
    assert.ok(d.photoUrls.length > 0, name);
    const item = run(
      "dealerToImportItem({...dealerExtractListingInPage(true),sourceUrl:location.href})",
    );
    assert.equal(item.categorySlug, category, name);
    assert.equal(item.condition, condition, name);
    assert.equal(item.city, "Aberdeen", name);
  }
});
test("every dealer section is discovered and all 68 visible records are accounted for, including ads absent from JSON-LD", () => {
  const catalogs = fixture("catalogs");
  const ids = new Set();
  for (const data of catalogs) {
    const page = reader(data)("dealerCollectInventoryPage()");
    assert.equal(page.recognized, true, data.section);
    assert.equal(page.sections.length, 8, data.section);
    assert.equal(page.items.length, page.pageCount, data.section);
    for (const item of page.items) {
      const id = dieselDepotListingId(item.sourceUrl);
      assert.ok(id);
      ids.add(id);
    }
  }
  assert.equal(ids.size, 68);
  const trailer = reader(catalogs.find((c) => c.section === "Trailers for Sale"))(
    "dealerCollectInventoryPage()",
  );
  assert.equal(trailer.items.length, 24);
});
test("wrong listing, verification, missing price, and explicit unavailability remain distinct", () => {
  const f = fixture("truck");
  assert.equal(
    reader({ ...f, url: f.url.replace("251818887", "999") })("dealerExtractListingInPage(true)"),
    null,
  );
  assert.equal(
    reader({ ...f, structured: [], body: "Verify that you are human" })(
      "dealerExtractListingInPage(false)",
    ),
    null,
  );
  assert.deepEqual(
    reader({ ...f, structured: [], body: "This listing has been sold" })(
      "dealerExtractListingInPage(false)",
    ),
    { unavailable: true, sold: true },
  );
  const unpriced = structuredClone(f);
  for (const d of unpriced.structured) if (d.offers) delete d.offers.price;
  const value = reader(unpriced)("dealerExtractListingInPage(false)");
  assert.equal(value.priceUnknown, true);
  assert.equal(value.priceCents, null);
  assert.equal("photoUrls" in value, false);
});
