import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const config = await read("src/config/classifieds.ts");
const slugs = Array.from(config.matchAll(/\{ slug: "([a-z-]+)", name:/g), (m) => m[1]);
const normalization = await read("src/lib/fb-import-normalization.ts");
const ctx = { classifiedCategories: slugs.map((slug) => ({ slug })) };
vm.runInNewContext(
  stripTypeScriptTypes(normalization.replace(/^import .*;\n/, "").replaceAll("export ", "")),
  ctx,
);
const extension = {
  chrome: {
    runtime: { onMessage: { addListener() {} } },
    action: { onClicked: { addListener() {} } },
  },
};
vm.runInNewContext(await read("tools/fb-import-extension/background.js"), extension);
const bookmarklet = await read("tools/facebook-import-bookmarklet.js");
const start = bookmarklet.indexOf("  function inferCategory(");
const end = bookmarklet.indexOf("  // A listing's full description", start);
const bookmarkletScope = {};
vm.runInNewContext(bookmarklet.slice(start, end), bookmarkletScope);
const classify = [
  (t, d) => ctx.inferFacebookCategorySlug(null, t, d),
  extension.inferCategory,
  bookmarkletScope.inferCategory,
];
const samples = {
  "cars-trucks": "2014 Toyota Tacoma",
  motorcycles: "Honda motorcycle",
  "rvs-campers": "Travel trailer",
  powersports: "Polaris ATV",
  "auto-parts": "Brake rotor",
  trailers: "Utility trailer",
  furniture: "Oak dresser",
  "apparel-accessories": "Denim jeans",
  "baby-kids": "Car seat",
  "books-media": "Paperback novel",
  collectibles: "Baseball trading card",
  "crafts-hobbies": "Crochet yarn",
  electronics: "Wireless headphones",
  "health-beauty": "Perfume",
  "home-garden": "Patio grill",
  "jewelry-watches": "925 Sterling silver ring",
  "musical-instruments": "Acoustic guitar",
  "office-business": "Cash register",
  "tickets-events": "Concert tickets",
  "tools-equipment": "Cordless drill",
  industrial: "Forklift",
  "outdoor-sporting": "Camping tent",
  firearms: "Ruger handgun",
  "farm-garden": "Farm tractor",
  general: "Miscellaneous mystery object",
  "other-real-estate": "Downtown condo",
  services: "Plumbing service",
  jobs: "Hiring cashier",
  pets: "Golden retriever puppy",
};
test("each current category has a representative extraction and server inference case", () => {
  assert.deepEqual(Object.keys(samples).sort(), [...new Set(slugs)].sort());
  for (const [category, title] of Object.entries(samples))
    for (const infer of classify) assert.equal(infer(title, ""), category, title);
});
test("category signals in titles take priority over incidental description words", () => {
  for (const infer of classify) {
    assert.equal(
      infer("2014 Toyota Tacoma", "Runs well, engine and transmission serviced."),
      "cars-trucks",
    );
    assert.equal(
      infer("Downtown condo", "Kitchen appliances and furniture are included."),
      "other-real-estate",
    );
    assert.equal(
      infer("Vintage oak dresser", "Used like new, from a home without pets."),
      "furniture",
    );
    assert.equal(infer("Vintage blue dress", "Beautiful antique style."), "apparel-accessories");
    assert.equal(infer("Apple Watch", "Includes original jewelry style bracelet."), "electronics");
    assert.equal(infer("Ring light", "Great lighting for filming."), "electronics");
    assert.equal(infer("Mechanical keyboard", "Computer accessory."), "electronics");
  }
});
test("firearm listings map to Firearms without absorbing archery gear", () => {
  for (const infer of classify) {
    assert.equal(infer("Ruger hunting rifle", "Used; includes scope."), "firearms");
    assert.equal(infer("Hunting bow", "Compound bow for archery."), "outdoor-sporting");
  }
});
test("explicit valid categories and condition qualifiers survive server normalization", () => {
  assert.equal(ctx.inferFacebookCategorySlug("industrial", "Unknown object", ""), "industrial");
  assert.equal(ctx.normalizeFacebookCondition("Used - Like New"), "used_excellent");
  assert.equal(ctx.normalizeFacebookCondition("New without tags"), "new_without_tags");
  assert.equal(ctx.normalizeFacebookCondition("New with tags"), "new_with_tags");
});
