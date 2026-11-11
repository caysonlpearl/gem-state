import test from "node:test";
import assert from "node:assert/strict";
import { varietyOfPets } from "../src/lib/pet-showcase.ts";
import { landingCards } from "../src/lib/landing-card-pool.ts";

const pet = (id, species, state = "ID") => ({
  id, title: id, categorySlug: "pets", city: "Boise", state,
  priceCents: 0, createdAt: "2026-11-11T00:00:00Z", isFeatured: false,
  pet: { species, subcategory: species === "Cat" ? "cats" : species === "Dog" ? "dogs" : "rabbits", placementType: "adoption" },
});
const cats = Array.from({ length: 60 }, (_, i) => pet(`cat-${i}`, "Cat"));

test("both mixed row sizes include available dogs beyond the newest cats", () => {
  for (const size of [4, 5]) {
    const selected = varietyOfPets([...cats, pet("dog", "Dog"), pet("rabbit", "Rabbit")], size);
    assert.equal(selected.length, size);
    assert.deepEqual(selected.slice(0, 3).map(c => c.pet.species), ["Cat", "Dog", "Rabbit"]);
    assert.equal(new Set(selected.map(c => c.id)).size, size);
  }
});

test("dog preview uses full saved inventory rather than just the newest page", () => {
  const dogs = landingCards([...cats, pet("dog", "Dog")], { category: "pets", state: "ID", petSubcategory: "dogs", petPlacementType: "adoption" });
  assert.deepEqual(dogs.map(c => c.id), ["dog"]);
});

test("variety never imports another state's pets or fabricates other species", () => {
  const available = landingCards([...cats, pet("dog", "Dog"), pet("rabbit", "Rabbit", "UT")], { category: "pets", state: "ID" });
  assert.deepEqual(varietyOfPets(available, 4).map(c => c.pet.species), ["Cat", "Dog", "Cat", "Cat"]);
  assert.equal(landingCards(available, { petSubcategory: "other-pets" }).length, 0);
});