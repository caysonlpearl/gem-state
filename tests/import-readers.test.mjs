import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// The Vinted and Whatnot readers are extension service-worker scripts; load
// them into a sandbox to test how their data maps to Bluebird import items.
const sandbox = { inferCategory: () => "general" };
vm.createContext(sandbox);
for (const file of ["paced-reader.js", "vinted.js", "whatnot.js"]) {
  vm.runInContext(
    readFileSync(new URL(`../tools/fb-import-extension/${file}`, import.meta.url), "utf8"),
    sandbox,
  );
}
const run = (expression) => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));

test("recognises Vinted and Whatnot seller and listing pages", () => {
  assert.equal(run('VINTED_MEMBER_RE.test("https://www.vinted.com/member/3164840912")'), true);
  assert.equal(run('vintedItemId("https://www.vinted.com/items/10381217076-true-religion")'), "10381217076");
  assert.equal(run('WHATNOT_USER_RE.test("https://www.whatnot.com/user/stewsshoes/shop")'), true);
  assert.equal(
    run('whatnotListingId("https://www.whatnot.com/listing/TGlzdGluZ05vZGU6MjQzOTM5NTA0MQ==?ref=x")'),
    "TGlzdGluZ05vZGU6MjQzOTM5NTA0MQ==",
  );
});

test("Vinted conditions and categories map to Bluebird's", () => {
  assert.equal(run('vintedMapCondition("New with tags")'), "new_with_tags");
  assert.equal(run('vintedMapCondition("Very good")'), "used_excellent");
  assert.equal(run('vintedMapCondition("Satisfactory")'), "used_good");
  assert.equal(run('vintedMapCategory(["Women", "Clothing", "Jeans"], "", "")'), "apparel-accessories");
  assert.equal(run('vintedMapCategory(["Women", "Accessories", "Jewelry"], "", "")'), "jewelry-watches");
  assert.equal(run('vintedMapCategory(["Home", "Kitchen"], "", "")'), "home-garden");
  assert.equal(run('vintedMapCategory([], "Something", "")'), "general");
});

test("a Vinted item becomes a local-pickup import item at the seller's city", () => {
  assert.deepEqual(
    run(`vintedToImportItem({
      sourceUrl: "https://www.vinted.com/items/1",
      title: "True Religion jeans",
      description: "Dark blue",
      priceCents: 700,
      vintedCondition: "Very good",
      vintedCategories: ["Women", "Clothing", "Jeans"],
      city: "BOISE",
      state: "ID",
      photoUrls: ["https://images1.vinted.net/t/abc/f800/1.webp?s=sig"],
    })`),
    {
      sourceUrl: "https://www.vinted.com/items/1",
      title: "True Religion jeans",
      description: "Dark blue",
      priceCents: 700,
      condition: "used_excellent",
      categorySlug: "apparel-accessories",
      city: "BOISE",
      state: "ID",
      photoUrls: ["https://images1.vinted.net/t/abc/f800/1.webp?s=sig"],
    },
  );
});

test("Whatnot items need their city set in review", () => {
  const item = run(`whatnotToImportItem({
    sourceUrl: "https://www.whatnot.com/listing/x",
    title: "Neighborhood Kicks tee",
    priceCents: 2500,
    whatnotCondition: "New With Tags",
  })`);
  assert.equal(item.condition, "new_with_tags");
  assert.equal(item.city, "");
  assert.equal(item.state, "ID");
});
