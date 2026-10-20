import test from "node:test";
import assert from "node:assert/strict";

import { findIdahoPlace, idahoPlaces } from "../src/config/idaho-places.ts";
import {
  classifiedCoordinatesForCity,
  classifiedDistanceMiles,
  classifiedProviderSearchStates,
  classifiedStatesForCity,
  hasClassifiedRadiusCenter,
  idahoCities,
  idahoRegions,
  isWithinClassifiedRadius,
  marketplaceCities,
  marketplaceStateCodes,
  regionalCities,
} from "../src/config/classifieds.ts";

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

test("same-named cities remain unique and radius searches use the selected state", () => {
  assert.equal(
    new Set(marketplaceCities.map((city) => city.toLowerCase())).size,
    marketplaceCities.length,
  );
  assert.ok(marketplaceCities.includes("Sandy, UT"));
  assert.ok(marketplaceCities.includes("Sandy, OR"));

  const utah = classifiedCoordinatesForCity("Sandy", "UT");
  const oregon = classifiedCoordinatesForCity("Sandy, OR");
  const oregonFullName = classifiedCoordinatesForCity("Sandy, Oregon");
  const oregonWithStaleIdahoFilter = classifiedCoordinatesForCity("Sandy, OR", "ID");
  assert.deepEqual(utah, [40.56498, -111.83897]);
  assert.deepEqual(oregon, [45.3987472, -122.26971]);
  assert.deepEqual(oregonFullName, oregon);
  assert.deepEqual(oregonWithStaleIdahoFilter, oregon);

  assert.equal(
    isWithinClassifiedRadius({
      city: "Sandy",
      cityState: "UT",
      listingCity: "Sandy",
      listingState: "UT",
      radiusMiles: 5,
    }),
    true,
  );
  assert.equal(
    hasClassifiedRadiusCenter({ city: "", latitude: 45.4, longitude: -122.2, radiusMiles: 25 }),
    true,
  );
  assert.equal(hasClassifiedRadiusCenter({ city: "", latitude: 45.4, radiusMiles: 25 }), false);
  assert.deepEqual(marketplaceStateCodes, ["ID", "UT", "OR", "WA"]);
  assert.deepEqual(
    classifiedProviderSearchStates({ city: "Boise", state: "ID", radiusMiles: 500 }),
    ["ID", "UT", "OR", "WA"],
  );
  assert.deepEqual(
    classifiedProviderSearchStates({
      latitude: 45.4,
      longitude: -122.2,
      state: "ID",
      radiusMiles: 500,
    }),
    ["ID", "UT", "OR", "WA"],
  );
  assert.deepEqual(classifiedProviderSearchStates({ state: "Washington" }), ["WA"]);
  assert.deepEqual(classifiedProviderSearchStates({ state: "unknown" }), ["ID"]);
  assert.equal(
    isWithinClassifiedRadius({
      city: "Sandy",
      cityState: "OR",
      listingCity: "Sandy",
      listingState: "OR",
      radiusMiles: 5,
    }),
    true,
  );
  assert.equal(
    isWithinClassifiedRadius({
      city: "Sandy",
      cityState: "OR",
      listingCity: "Sandy",
      listingState: "UT",
      radiusMiles: 5,
    }),
    false,
  );
  assert.equal(
    isWithinClassifiedRadius({
      city: "Boise",
      cityState: "ID",
      listingCity: "Seattle",
      listingState: "WA",
      radiusMiles: 500,
    }),
    true,
  );
});

test("explicit states never borrow a different state's city center", () => {
  assert.deepEqual(classifiedCoordinatesForCity("Boise", "ID"), [43.615, -116.2023]);
  assert.equal(classifiedCoordinatesForCity("Boise", "UT"), undefined);
  assert.equal(classifiedCoordinatesForCity("Portland", "ID"), undefined);
  assert.equal(classifiedCoordinatesForCity("Sandy", "ID"), undefined);
  assert.deepEqual(classifiedCoordinatesForCity("Sandy", "OR"), [45.3987472, -122.26971]);
  assert.equal(classifiedCoordinatesForCity("Sandy"), undefined);
});

test("colliding Idaho and regional city names use their own state centers", () => {
  const expected = {
    Aberdeen: {
      ID: [42.9441, -112.8384],
      WA: [46.9754, -123.8157],
    },
    Midvale: {
      ID: [44.4623, -116.7407],
      UT: [40.6111, -111.8999],
    },
    Richfield: {
      ID: [43.0516, -114.1559],
      UT: [38.7725, -112.0841],
    },
  };

  for (const [city, centers] of Object.entries(expected)) {
    for (const [state, center] of Object.entries(centers))
      assert.deepEqual(classifiedCoordinatesForCity(city, state), center, `${city}, ${state}`);
    assert.equal(classifiedCoordinatesForCity(city), undefined, `${city} without a state`);
  }

  for (const [city, centers] of Object.entries(expected)) {
    const [firstState, secondState] = Object.keys(centers);
    for (const [cityState, listingState] of [
      [firstState, secondState],
      [secondState, firstState],
    ])
      assert.equal(
        isWithinClassifiedRadius({
          city,
          cityState,
          listingCity: city,
          listingState,
          radiusMiles: 1,
        }),
        false,
        `${city} ${cityState} must not match ${listingState}`,
      );
  }
});

test("every duplicate city across supported states resolves only with a state", () => {
  const allCities = new Set([
    ...idahoPlaces.map(([city]) => city),
    ...regionalCities.map((city) => city.replace(/,\s*(?:ID|UT|OR|WA)$/i, "").trim()),
  ]);
  const collidingCities = [...allCities]
    .filter((city) => classifiedStatesForCity(city).length > 1)
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(collidingCities, ["Aberdeen", "Midvale", "Richfield", "Sandy"]);
  for (const city of collidingCities) {
    const states = classifiedStatesForCity(city);
    for (const state of states)
      assert.ok(classifiedCoordinatesForCity(city, state), `${city}, ${state} center`);
    assert.equal(
      classifiedCoordinatesForCity(city),
      undefined,
      `${city} must not resolve to an ambiguous bare center`,
    );
  }

  for (const [city, , latitude, longitude] of idahoPlaces) {
    if (classifiedStatesForCity(city).length < 2) continue;
    assert.deepEqual(
      classifiedCoordinatesForCity(city, "ID"),
      [latitude, longitude],
      `${city}, ID must use the Idaho Gazetteer center`,
    );
  }
});

test("unmapped same-name cities in different states stay unresolved at every radius", () => {
  for (const radiusMiles of [1, 500]) {
    assert.equal(
      isWithinClassifiedRadius({
        city: "Unmapped Town, OR",
        cityState: "OR",
        listingCity: "Unmapped Town, UT",
        listingState: "UT",
        radiusMiles,
      }),
      false,
    );
  }
  assert.deepEqual(
    classifiedProviderSearchStates({ city: "Unmapped Town, OR", state: "OR", radiusMiles: 25 }),
    [],
  );
});

test("radius membership includes a point just inside and on the boundary only", () => {
  const [centerLatitude, centerLongitude] = classifiedCoordinatesForCity("Boise", "ID");
  const [pointLatitude, pointLongitude] = classifiedCoordinatesForCity("Nampa", "ID");
  const distance = classifiedDistanceMiles(
    centerLatitude,
    centerLongitude,
    pointLatitude,
    pointLongitude,
  );
  const matches = (radiusMiles) =>
    isWithinClassifiedRadius({
      city: "Boise",
      cityState: "ID",
      listingCity: "Nampa",
      listingState: "ID",
      radiusMiles,
    });

  assert.equal(matches(distance + 0.01), true);
  assert.equal(matches(distance), true);
  assert.equal(matches(distance - 0.01), false);
});
