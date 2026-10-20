import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// ksl.js is an extension service-worker script, not a module; load it into a
// sandbox to test the parts that map KSL data to Bluebird import items.
const source = readFileSync(
  new URL("../tools/fb-import-extension/ksl.js", import.meta.url),
  "utf8",
);
const sandbox = { inferCategory: () => "general" };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const ksl = (expression) => vm.runInContext(expression, sandbox);

test("recognises KSL seller and listing pages", () => {
  const member = ksl("KSL_MEMBER_RE");
  assert.ok(member.test("https://classifieds.ksl.com/search/member/5162572"));
  assert.ok(!member.test("https://classifieds.ksl.com/listing/82308885"));
  assert.equal(ksl('kslListingId("https://classifieds.ksl.com/listing/82308885")'), "82308885");
  assert.equal(ksl('kslListingId("https://www.facebook.com/marketplace/item/1")'), null);
});

test("drops the trailing city from KSL titles", () => {
  assert.equal(
    ksl(
      'kslCleanTitle("8ish Year-Old Half Draft Gelding Horse | Black-and-White Pinto | OAKLEY, ID", "Oakley")',
    ),
    "8ish Year-Old Half Draft Gelding Horse | Black-and-White Pinto",
  );
  assert.equal(ksl('kslCleanTitle("Oak dresser", "Boise")'), "Oak dresser");
});

test("maps KSL categories to Bluebird slugs", () => {
  const map = (category, sub, title = "") =>
    ksl(`kslMapCategory(${JSON.stringify(category)}, ${JSON.stringify(sub)}, ${JSON.stringify(title)}, "")`);
  assert.equal(map("Livestock", "Horses"), "pets");
  assert.equal(map("Recreational Vehicles", "Travel Trailers"), "rvs-campers");
  assert.equal(map("Furniture", "Dressers"), "furniture");
  assert.equal(map("Sporting Goods", "Bicycles"), "outdoor-sporting");
  // Unknown categories fall back to the shared title/description guess.
  assert.equal(map("", "", "Something odd"), "general");
});

test("builds a local-pickup import item from a read KSL listing", () => {
  const item = JSON.parse(
    ksl(`JSON.stringify(kslToImportItem({
      sourceUrl: "https://classifieds.ksl.com/listing/82308885",
      title: "Half Draft Gelding | OAKLEY, ID",
      description: "Meet Chief!",
      priceCents: 700000,
      kslCondition: "Not Applicable",
      kslCategory: "Livestock",
      kslSubCategory: "Horses",
      city: "Oakley",
      state: "ID",
      photoUrls: ["https://image.ksldigital.com/c0773373-038e-43f5-931e-77a17288a7ae.jpg"],
    }))`),
  );
  assert.deepEqual(item, {
    sourceUrl: "https://classifieds.ksl.com/listing/82308885",
    title: "Half Draft Gelding",
    description: "Meet Chief!",
    priceCents: 700000,
    condition: "not_applicable",
    categorySlug: "pets",
    subcategory: "Horses",
    city: "Oakley",
    state: "ID",
    photoUrls: ["https://image.ksldigital.com/c0773373-038e-43f5-931e-77a17288a7ae.jpg"],
  });
});
