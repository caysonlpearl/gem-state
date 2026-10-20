import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { inferImportItemDetails, importedSubcategory } from "../src/lib/import-subcategories.ts";
import {
  classifiedItemFields,
  industrialSubcategories,
  classifiedSubcategoryField,
  classifiedSubcategorySearch,
  normalizeClassifiedItemDetails,
} from "../src/config/classified-item-fields.ts";
const ctx = vm.createContext({ URL, inferCategory: () => "general" });
for (const file of ["ksl.js", "vinted.js", "whatnot.js", "dealer.js"])
  vm.runInContext(
    readFileSync(new URL("../tools/fb-import-extension/" + file, import.meta.url), "utf8"),
    ctx,
  );
const run = (expr) => JSON.parse(vm.runInContext("JSON.stringify(" + expr + ")", ctx));

test("KSL Industrial / Heavy Equipment/Tractors stays Industrial with its exact subcategory", () => {
  const item = run(
    `kslToImportItem({title:'2013 PETERBILT 388',kslCategory:'Industrial',kslSubCategory:'Heavy Equipment/Tractors',sourceUrl:'https://classifieds.ksl.com/listing/82283078'})`,
  );
  assert.equal(item.categorySlug, "industrial");
  assert.equal(item.subcategory, "Heavy Equipment/Tractors");
  assert.deepEqual(inferImportItemDetails(item.categorySlug, item.subcategory, {}, item.title), {
    itemType: "Heavy Equipment/Tractors",
  });
  assert.equal(
    run(
      `kslMapCategory('Industrial','Parts - Heavy Equipment/Industrial/Semi Truck','Semi truck part','')`,
    ),
    "industrial",
  );
});
test("source subcategories survive every category-specific item field normalizer", () => {
  for (const category of Object.keys(classifiedItemFields).filter((c) => c !== "firearms")) {
    const details = inferImportItemDetails(category, "Source-specific type", {}, "");
    assert.equal(
      importedSubcategory(category, normalizeClassifiedItemDetails(category, details)),
      "Source-specific type",
      category,
    );
  }
});
test("explicit source taxonomy takes precedence, while existing structured facts remain intact", () => {
  assert.deepEqual(
    inferImportItemDetails("jewelry-watches", "Necklaces", { metal: "Silver" }, "Ring box"),
    { metal: "Silver", itemType: "Necklaces" },
  );
  assert.deepEqual(
    inferImportItemDetails(
      "books-media",
      "Fiction",
      { format: "Paperback", author: "Example" },
      "A book",
    ),
    { format: "Paperback", author: "Example", itemType: "Fiction" },
  );
  assert.deepEqual(inferImportItemDetails("industrial", "air compressors", {}, "Tractor"), {
    itemType: "Air Compressors",
  });
  assert.deepEqual(inferImportItemDetails("industrial", undefined, {}, "Hydraulic pump"), {
    itemType: "Pumps",
  });
  assert.deepEqual(inferImportItemDetails("general", undefined, {}, "An ambiguous object"), {});
});
test("Vinted, Whatnot and direct dealer mappings include explicit source subcategories", () => {
  assert.equal(
    run(`vintedToImportItem({vintedCategories:['Women','Clothing','Jeans']})`).subcategory,
    "Jeans",
  );
  assert.equal(
    run(`whatnotToImportItem({sourceSubcategory:'Trading cards'})`).subcategory,
    "Trading cards",
  );
  assert.equal(
    run(`dealerToImportItem({dealerCategory:'Dump Truck Bodies Only Trucks'})`).subcategory,
    "Dump Truck Bodies Only Trucks",
  );
});
test("firearm and accessory classifications use the existing structured filter values", () => {
  assert.deepEqual(inferImportItemDetails("firearms", "Rifles", {}, "Listing"), {
    listingType: "Firearm",
    firearmType: "Rifle",
  });
  assert.deepEqual(inferImportItemDetails("firearms", "Scopes & optics", {}, "Listing"), {
    listingType: "Accessory",
    accessoryType: "Optics & sights",
  });
});
test("invalid or excessive imported metadata cannot escape the shared field allowlist", () => {
  const d = inferImportItemDetails(
    "industrial",
    " A ".repeat(300),
    { unexpected: "discard me", itemType: "Existing" },
    "",
  );
  assert.equal(d.unexpected, undefined);
  assert.equal(d.itemType.length, 200);
});

test("KSL falls back to its visible URL breadcrumb when embedded taxonomy is missing", () => {
  ctx.location = { href: "https://classifieds.ksl.com/listing/82283078" };
  ctx.document = {
    title: "2013 PETERBILT 388",
    body: { innerText: "2013 PETERBILT 388" },
    querySelector: () => ({
      href: "https://classifieds.ksl.com/search/cat/Industrial/sub/Heavy%20Equipment%2FTractors",
    }),
    querySelectorAll(selector) {
      return selector === "script"
        ? [
            {
              textContent: JSON.stringify({
                title: "2013 PETERBILT 388",
                price: 84500,
                status: "active",
                photos: [],
                description: "A controlled test description for the listed truck.",
              }),
            },
          ]
        : [];
    },
  };
  const extracted = run("kslExtractListingInPage(false)");
  assert.equal(extracted.kslCategory, "Industrial");
  assert.equal(extracted.kslSubCategory, "Heavy Equipment/Tractors");
  assert.equal(
    run("kslToImportItem(kslExtractListingInPage(false))").subcategory,
    "Heavy Equipment/Tractors",
  );
});

test("every shared Industrial option round-trips from import through edit and browse destination", () => {
  for (const subcategory of industrialSubcategories) {
    const extracted = run(
      `kslToImportItem(${JSON.stringify({ title: "Example equipment", kslCategory: "Industrial", kslSubCategory: subcategory })})`,
    );
    const staged = inferImportItemDetails(
      extracted.categorySlug,
      extracted.subcategory,
      {},
      extracted.title,
    );
    const edited = normalizeClassifiedItemDetails(extracted.categorySlug, staged);
    const search = classifiedSubcategorySearch(
      extracted.categorySlug,
      importedSubcategory(extracted.categorySlug, edited),
    );
    assert.equal(extracted.categorySlug, "industrial");
    assert.equal(classifiedSubcategoryField("industrial").key, search.itemDetailKey);
    assert.equal(edited[search.itemDetailKey], subcategory);
    assert.equal(search.itemDetailValue, subcategory);
    const roundTrip = Object.fromEntries(new URLSearchParams(search));
    assert.deepEqual(roundTrip, {
      category: "industrial",
      itemDetailKey: "itemType",
      itemDetailValue: subcategory,
    });
  }
});

test("subcategory review reload selects persisted metadata instead of re-guessing titles", () => {
  const server = readFileSync(
    new URL("../src/lib/fb-import.functions.ts", import.meta.url),
    "utf8",
  );
  const reader = server.slice(
    server.indexOf("export const getFacebookImportItems"),
    server.indexOf("export const", server.indexOf("export const getFacebookImportItems") + 20),
  );
  assert.match(reader, /\.select\([\s\S]*?item_details/);
  assert.equal(
    importedSubcategory(
      "industrial",
      inferImportItemDetails("industrial", undefined, { itemType: "Cranes" }, "2013 PETERBILT 388"),
    ),
    "Cranes",
  );
});

test("an imported subcategory is counted once and displayed in active filter badges", () => {
  const source = readFileSync(new URL("../src/routes/browse.tsx", import.meta.url), "utf8");
  const functions = source.slice(
    source.indexOf("function countActiveFilters("),
    source.indexOf("function FilterSection("),
  );
  const js = ts.transpile(functions, { target: ts.ScriptTarget.ES2022 });
  const sandbox = vm.createContext({
    classifiedCategories: [{ slug: "industrial", name: "Industrial" }],
    fieldsForClassifiedItem: (c) => classifiedItemFields[c],
  });
  vm.runInContext(js, sandbox);
  sandbox.search = classifiedSubcategorySearch("industrial", "Heavy Equipment/Tractors");
  assert.equal(vm.runInContext("countActiveFilters(search, false, false, false)", sandbox), 2);
  assert.deepEqual(
    JSON.parse(
      vm.runInContext("JSON.stringify(activeFilterLabels(search, false, false, false))", sandbox),
    ),
    ["Industrial", "Industrial subcategory · Heavy Equipment/Tractors"],
  );
});


test("finished imports keep recoverable data when clipboard and handoff are unavailable", async () => {
  let displayed = "";
  const payload = {sourceProfileUrl:"https://classifieds.ksl.com/search/member/1",items:[{title:"</textarea><script>untrusted()</script>",subcategory:"Heavy Equipment/Tractors"}]};
  const sandbox = vm.createContext({
    exec:async()=>{throw new Error("Clipboard unavailable");},
    handoffToAdmin:async()=>false,
    payload,
    say:async(html)=>{displayed=html;},
  });
  vm.runInContext(readFileSync(new URL("../tools/fb-import-extension/paced-reader.js",import.meta.url),"utf8"),sandbox);
  await vm.runInContext('deliverImport(1,say,"",payload,[])',sandbox);
  assert.match(displayed,/Recover completed import data/);
  assert.match(displayed,/aria-label="Completed import data"/);
  assert.match(displayed,/Heavy Equipment\/Tractors/);
  assert.match(displayed,/&lt;\/textarea&gt;&lt;script&gt;/);
  assert.doesNotMatch(displayed,/<script>/);
});


test("automotive accessory and generator subcategories do not fall into clothing or RV listings", () => {
  assert.equal(run("kslMapCategory('Auto Parts and Accessories','Auto Accessories','Tool Box','')"), "auto-parts");
  assert.equal(run("kslMapCategory('Recreational Vehicles','Generators','Working Generator','')"), "tools-equipment");
  for (const category of ["auto-parts","trailers","rvs-campers","cars-trucks"]) {
    const details = inferImportItemDetails(category,"Source type",{},"");
    assert.equal(classifiedSubcategorySearch(category,"Source type").itemDetailKey, "itemType");
    assert.deepEqual(normalizeClassifiedItemDetails(category,details), {itemType:"Source type"});
  }
});


test("visible KSL taxonomy survives incomplete embedded details without hiding the read failure", () => {
  ctx.document = {title:"Example",body:{innerText:"Example"},querySelector:()=>({href:"https://classifieds.ksl.com/search/cat/Industrial/sub/Air%20Compressors"}),querySelectorAll:()=>[]};
  ctx.location = {href:"https://classifieds.ksl.com/listing/80713052"};
  assert.deepEqual(run("kslExtractListingInPage(false)"), {kslCategory:"Industrial",kslSubCategory:"Air Compressors",incomplete:true});
});


test("motor subcategory destinations open results directly instead of the category landing", () => {
  for (const category of ["cars-trucks","motorcycles","rvs-campers","powersports","auto-parts","trailers"])
    assert.equal(classifiedSubcategorySearch(category,"Imported subtype").vehicleMode,"results");
});


test("switching parent categories clears the previous category-specific subtype", () => {
  const source = readFileSync(new URL("../src/routes/browse.tsx",import.meta.url),"utf8");
  const expression = source.slice(source.indexOf("  const scoped ="),source.indexOf("  const clearSearch ="));
  const sandbox = vm.createContext({search:{category:"industrial",itemDetailKey:"itemType",itemDetailValue:"Heavy Equipment/Tractors",city:"Boise"}});
  vm.runInContext(ts.transpile(expression,{target:ts.ScriptTarget.ES2022}),sandbox);
  const changed = JSON.parse(vm.runInContext('JSON.stringify(scoped({category:"furniture"}))',sandbox));
  assert.deepEqual(changed,{category:"furniture",city:"Boise"});
  const same = JSON.parse(vm.runInContext('JSON.stringify(scoped({sort:"price_low"}))',sandbox));
  assert.equal(same.itemDetailValue,"Heavy Equipment/Tractors");
});
