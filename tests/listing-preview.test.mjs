import test from "node:test";
import assert from "node:assert/strict";
import { listingPreviewTitle, petPreviewFacts } from "../src/lib/listing-preview.ts";
const pet = (overrides = {}) => ({
  title: "A124890 · Longhaired Rabbit (medium coat)",
  priceCents: 0,
  externalPet: {},
  pet: {
    name: "A124890",
    species: "Rabbit",
    breed: "Longhaired Rabbit (medium coat)",
    age: "Adult",
    sex: "Female",
    placementType: "adoption",
  },
  ...overrides,
});
test("provider animal IDs and coat annotations never become preview titles", () => {
  for (const name of ["A124890", "8124890", "AB-123456", "#123456"]) {
    const card = pet();
    card.pet.name = name;
    assert.equal(listingPreviewTitle(card), "Longhaired Rabbit");
    assert.deepEqual(petPreviewFacts(card), ["Adult", "Female"]);
  }
});
test("real animal names and user-authored titles are retained without duplicated facts", () => {
  const card = pet();
  card.pet.name = "Mochi";
  assert.equal(listingPreviewTitle(card), "Mochi · Longhaired Rabbit");
  assert.deepEqual(petPreviewFacts(card), ["Adult", "Female"]);
  card.externalPet = undefined;
  card.title = "Mochi the rabbit";
  assert.equal(listingPreviewTitle(card), "Mochi the rabbit");
  assert.deepEqual(petPreviewFacts(card), ["Longhaired Rabbit", "Adult", "Female"]);
});
test("paid adoptions keep one adoption indicator and unknown facts are omitted", () => {
  const card = pet({ priceCents: 5000 });
  card.pet.age = "Unknown";
  card.pet.sex = "Not specified";
  assert.deepEqual(petPreviewFacts(card), ["Adoption"]);
});
