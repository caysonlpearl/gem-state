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

test("Whatnot items sort by title, not by words in a book's blurb", () => {
  // Real titles from a Whatnot seller whose books landed in Cars & Trucks,
  // Baby & Kids and Jobs because their blurbs mentioned cars and babies.
  const cases = [
    ["Pop Mart Labubu the Monsters Coca-Cola Vinyl Figures Series Blind Box Authentic", "", "collectibles"],
    ["Baby Nanci Cute and Sweet Fruits - confirmed - Apple", "", "collectibles"],
    ["Cry Baby Crying For Love - Confirmed - Sweet", "", "collectibles"],
    ["Big into Energy Phone Charm- luck", "", "collectibles"],
    ["Capybara key chains", "", "collectibles"],
    ["Jennifer Weiner In Her Shoes - By (Paperback)", "", "books-media"],
    ["Nicholas Sparks The Return - By (Paperback)", "", "books-media"],
    ["Dream Girl Drama- sprayed edges", "", "books-media"],
    ["Icebreaker: Novel (The Maple Hills Series #1)", "", "books-media"],
    ["Pink art class hip bag", "New with tags", "apparel-accessories"],
    ["Women’s sandals", "New with tags", "apparel-accessories"],
    ["Mooyius 2 peice dress set", "New with tags", "apparel-accessories"],
    ["Squishy Butter!", "You get 3 butters!!", "baby-kids"],
    ["Love In Translation", "A stressed-out translator on the brink of a meltdown and a romance", "books-media"],
    ["The Rescue", "A thriller about a rescue at sea; he drove his truck to the coast", "books-media"],
  ];
  for (const [title, description, expected] of cases) {
    assert.equal(run(`whatnotMapCategory(${JSON.stringify(title)}, ${JSON.stringify(description)})`), expected, title);
  }
});

test("bare titles take the seller's main category when most items share one", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ title: `Novel ${i}`, categorySlug: "books-media" })),
    { title: "Verity", categorySlug: "general" },
    { title: "Labubu", categorySlug: "collectibles" },
  ];
  const filled = run(`whatnotFillFromMajority(${JSON.stringify(items)})`);
  assert.equal(filled.find((item) => item.title === "Verity").categorySlug, "books-media");
  assert.equal(filled.find((item) => item.title === "Labubu").categorySlug, "collectibles");
  // No clear majority: leave General for review.
  const mixed = run(`whatnotFillFromMajority(${JSON.stringify([
    { title: "A", categorySlug: "books-media" },
    { title: "B", categorySlug: "collectibles" },
    { title: "C", categorySlug: "general" },
  ])})`);
  assert.equal(mixed.find((item) => item.title === "C").categorySlug, "general");
});
