import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRescueGroupsAnimals } from "../src/lib/rescuegroups-contract.ts";

const payload = {
  data: [
    {
      type: "animals",
      id: "12345",
      attributes: {
        name: "Biscuit",
        breedString: "Labrador Retriever Mix",
        ageGroup: "Young",
        sexLabel: "Female",
        sizeGroup: "Large",
        descriptionText: "Loves walks.",
        adoptionFeeString: "$150",
        updatedDate: "2026-10-15T10:00:00Z",
      },
      relationships: {
        pictures: { data: [{ type: "pictures", id: "2" }, { type: "pictures", id: "1" }] },
        orgs: { data: [{ type: "orgs", id: "77" }] },
        species: { data: [{ type: "species", id: "8" }] },
      },
    },
    { type: "animals", id: "bad", attributes: { name: "" } },
  ],
  included: [
    { type: "pictures", id: "1", attributes: { order: 1, large: { url: "https://cdn.rescuegroups.org/a.jpg" } } },
    { type: "pictures", id: "2", attributes: { order: 2, large: { url: "https://cdn.rescuegroups.org/b.jpg" } } },
    { type: "orgs", id: "77", attributes: { name: "Idaho Humane", city: "Boise", state: "id", url: "idahohumane.org", adoptionUrl: "javascript:alert(1)" } },
    { type: "species", id: "8", attributes: { singular: "Dog" } },
  ],
};

test("normalizes RescueGroups pets with ordered photos, org and safe links", () => {
  const pets = normalizeRescueGroupsAnimals(payload);
  assert.equal(pets.length, 1);
  const [pet] = pets;
  assert.equal(pet.name, "Biscuit");
  assert.equal(pet.species, "Dog");
  assert.deepEqual(pet.photos, ["https://cdn.rescuegroups.org/a.jpg", "https://cdn.rescuegroups.org/b.jpg"]);
  assert.equal(pet.org.city, "Boise");
  assert.equal(pet.org.state, "ID");
  assert.equal(pet.org.adoptionUrl, null);
  assert.equal(pet.sourceUrl, "https://idahohumane.org/");
});
