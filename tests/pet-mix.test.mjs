import { test } from "vitest";
import assert from "node:assert/strict";
import { mixPetSpecies } from "../src/lib/pet-mix.ts";
const pet = (id, subcategory) => ({ id, pet: { subcategory } });
test("mixed pet rows alternate species instead of all cats first", () => {
  const out = mixPetSpecies([pet(1,"cats"),pet(2,"cats"),pet(3,"cats"),pet(4,"dogs"),pet(5,"other-pets")]);
  assert.deepEqual(out.slice(0,3).map((p)=>p.pet.subcategory), ["cats","dogs","other-pets"]);
  assert.equal(out.length, 5);
});
