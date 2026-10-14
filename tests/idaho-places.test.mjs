import test from "node:test";
import assert from "node:assert/strict";

import { findIdahoPlace, idahoPlaces } from "../src/config/idaho-places.ts";
import { idahoCities, idahoRegions, isWithinClassifiedRadius } from "../src/config/classifieds.ts";

test("typed city names resolve to the listed spelling and region", () => {
  assert.deepEqual(findIdahoPlace("OAKLEY")?.slice(0, 2), ["Oakley", "Magic Valley"]);
  assert.deepEqual(findIdahoPlace(" coeur dalene ")?.slice(0, 2), ["Coeur d'Alene", "North Idaho"]);
  assert.deepEqual(findIdahoPlace("boise")?.slice(0, 2), ["Boise", "Treasure Valley"]);
  assert.equal(findIdahoPlace("Boisee"), undefined);
  assert.equal(findIdahoPlace(""), undefined);
});

test("every Idaho city page and every place has a known region", () => {
  for (const city of idahoCities) assert.ok(findIdahoPlace(city), city);
  for (const [name, region] of idahoPlaces) assert.ok(idahoRegions.includes(region), name);
});

test("small towns show up in distance searches from nearby cities", () => {
  const near = (city, listingCity, radiusMiles) =>
    isWithinClassifiedRadius({ city, listingCity, radiusMiles });
  assert.equal(near("Burley", "Oakley", 25), true);
  assert.equal(near("Boise", "Oakley", 25), false);
});
