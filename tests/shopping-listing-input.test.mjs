import test from "node:test";
import assert from "node:assert/strict";
import { shoppingListingInput } from "../src/lib/shopping-listing-input.ts";

const base = {
  id: "fixture",
  title: "Everyday jacket",
  categorySlug: "apparel-accessories",
  priceCents: 5000,
  city: "Boise",
  state: "ID",
  createdAt: "2026-11-16T00:00:00Z",
  imageUrl: "https://cdn.example/jacket.jpg?signature=first",
  condition: "Used",
};

test("matching receives category-specific size, brand and material facts, not arbitrary fields", () => {
  const result = shoppingListingInput({
    ...base,
    itemDetails: {
      itemType: "Jacket",
      size: "Medium",
      brand: "Patagonia",
      gender: "Unisex",
      privateMessage: "hidden private message",
      password: "hidden password",
      material: "ignored for this category",
    },
  });
  assert.match(result.text, /Size: Medium/);
  assert.match(result.text, /Brand: Patagonia/);
  assert.match(result.text, /Fit \/ gender: Unisex/);
  assert(!/hidden|ignored/.test(result.text));
  const furniture = shoppingListingInput({
    ...base,
    categorySlug: "furniture",
    itemDetails: { itemType: "Table", material: "Oak", dimensions: "72 x 36 inches" },
  });
  assert.match(furniture.text, /Material: Oak/);
  assert.match(furniture.text, /Dimensions: 72 x 36 inches/);
});

test("home specifications include zero-bedroom studios and exclude agent/contact metadata", () => {
  const result = shoppingListingInput({
    ...base,
    categorySlug: "other-real-estate",
    home: {
      mode: "rent",
      propertyType: "Apartment",
      bedrooms: 0,
      bathrooms: 1,
      squareFeet: 600,
      leaseLength: "12 months",
      pets: "Cats allowed",
      contact: "unlisted contact",
      agentPhone: "208-555-0100",
      privateDocument: "hidden document",
    },
    externalHome: { latitude: 43.6178, listedBy: { agentName: "private agent" } },
  });
  assert.match(result.text, /Bedrooms: 0/);
  assert.match(result.text, /Square feet: 600/);
  assert.match(result.text, /Home listing: rent/);
  assert(!/208|43\.6178|unlisted|hidden|private/.test(result.text));
});

test("pet, service and job facets are bounded and exclude application and contact information", () => {
  const pet = shoppingListingInput({
    ...base,
    categorySlug: "pets",
    pet: {
      species: "Dog",
      breed: "Labrador",
      goodWithCats: "Yes",
      microchipId: "secret-chip",
    },
  });
  assert.match(pet.text, /Breed: Labrador/);
  assert.match(pet.text, /Good with cats: Yes/);
  assert(!pet.text.includes("secret-chip"));
  const service = shoppingListingInput({
    ...base,
    categorySlug: "services",
    service: {
      subcategory: "Plumbing",
      pricingType: "quote",
      businessAddress: "private address",
      licenseNumber: "private license",
      reviews: [{ body: "private review" }],
    },
  });
  assert.match(service.text, /Service: Plumbing/);
  assert(!service.text.includes("private"));
  const job = shoppingListingInput({
    ...base,
    categorySlug: "jobs",
    job: {
      employmentType: "Part-time",
      educationLevel: "High school",
      employerAddress: "private address",
      applicationExternalContact: "private@example.com",
      qualifications: [{ arbitrary: "private" }],
    },
  });
  assert.match(job.text, /Employment: Part-time/);
  assert(!job.text.includes("private"));
});

test("the cache identity follows the exact worker facts and photo, not price, contacts or signing tokens", () => {
  const original = shoppingListingInput({ ...base, itemDetails: { size: "Medium" } });
  assert.notEqual(
    original.identity,
    shoppingListingInput({ ...base, itemDetails: { size: "Large" } }).identity,
  );
  assert.notEqual(
    original.identity,
    shoppingListingInput({ ...base, itemDetails: { size: "Medium" }, condition: "New" }).identity,
  );
  assert.notEqual(
    original.identity,
    shoppingListingInput({ ...base, itemDetails: { size: "Medium" }, city: "Twin Falls" }).identity,
  );
  assert.equal(
    original.identity,
    shoppingListingInput({
      ...base,
      imageUrl: "https://cdn.example/jacket.jpg?signature=renewed",
      priceCents: 4000,
      sellerPhone: "208-555-0100",
      itemDetails: { size: "Medium", privateNote: "do not export" },
    }).identity,
  );
});

test("free-text secrets, unsafe scalars and uncontrolled nested objects cannot enter the worker text", () => {
  const result = shoppingListingInput({
    ...base,
    title: "email private@example.com",
    itemDetails: {
      size: { secret: "private object" },
      brand: "https://private.example/secret",
      itemType: "Jacket",
    },
    vehicle: { vin: "SECRET-VIN", make: "Toyota", mileage: Infinity, model: ["unsafe"] },
    home: { bedrooms: -2, bathrooms: NaN },
    city: "bearer private-token",
  });
  assert.match(result.text, /Make: Toyota/);
  assert(!/private|SECRET|unsafe|Infinity|NaN|-2/.test(result.text));
  assert(result.text.length <= 1000);
});
