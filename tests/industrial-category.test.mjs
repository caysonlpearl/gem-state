import test from "node:test";
import assert from "node:assert/strict";
import { classifiedCategories } from "../src/config/classifieds.ts";
import { fieldsForClassifiedItem, industrialSubcategories, normalizeClassifiedItemDetails } from "../src/config/classified-item-fields.ts";

test("Industrial belongs to the shared classifieds category taxonomy", () => {
  assert.deepEqual(classifiedCategories.find((category) => category.slug === "industrial"), {
    slug: "industrial", name: "Industrial", group: "classifieds",
  });
});

test("Industrial preserves supplied subcategories and includes imported inventory types", () => {
  const suppliedSubcategories = [
    "Air Compressors", "Boom Lift", "Drills", "Excavators", "Farm Equipment", "Fork Lifts",
    "Heavy Equipment/Tractors", "Industrial Equipment Rentals", "Ladders", "Machinery",
    "Other Industrial/Construction Equipment", "Parts - Heavy Equipment/Industrial/Semi Truck",
    "Power and Hand Tools", "Pressure Washers", "Saws", "Scissor Lifts", "Shipping Container",
    "Shop Tools", "Skid Steer Loaders", "Tool Storage", "Wanted/ISO - Industrial", "Woodworking Tools",
  ];
  const importedInventorySubcategories = [
    "Cranes", "Generators", "Hydraulics", "Pumps", "Truck Bodies", "Trailers", "Welding Equipment",
  ];

  for (const subcategory of [...suppliedSubcategories, ...importedInventorySubcategories]) {
    assert.ok(industrialSubcategories.includes(subcategory), `${subcategory} remains available`);
  }
  assert.equal(new Set(industrialSubcategories).size, industrialSubcategories.length, "subcategories are unique");
  assert.deepEqual(fieldsForClassifiedItem("industrial")[0]?.options, industrialSubcategories);
  assert.equal(fieldsForClassifiedItem("industrial")[0]?.required, true);
});

test("Industrial subcategories survive existing item detail save and edit normalization", () => {
  for (const subcategory of industrialSubcategories) {
    assert.deepEqual(normalizeClassifiedItemDetails("industrial", { itemType: subcategory, unrelated: "discard" }), {
      itemType: subcategory,
    });
  }
});
