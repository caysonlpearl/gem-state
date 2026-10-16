import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenWebNinjaHome,
  normalizeOpenWebNinjaProperty,
  normalizeOpenWebNinjaResult,
  OPENWEBNINJA_ID,
} from "../src/lib/openwebninja-contract.ts";

test("normalizes a Zillow search row into a Bluebird home card source", () => {
  const result = normalizeOpenWebNinjaResult(
    {
      data: [
        {
          zpid: 12345,
          homeStatus: "FOR_SALE",
          detailUrl: "/homedetails/12345_zpid/",
          address: { streetAddress: "123 Main St", city: "Boise", state: "ID", zipcode: "83702" },
          homeType: "SINGLE_FAMILY",
          price: 525000,
          zestimate: 530000,
          rentZestimate: 2400,
          bedrooms: 3,
          bathrooms: 2,
          livingArea: 1800,
          imgSrc: "http://images.example/cover.jpg",
          daysOnZillow: 4,
        },
      ],
    },
    "buy",
  );
  assert.equal(result.homes.length, 1);
  assert.equal(result.homes[0].priceCents, 52_500_000);
  assert.equal(result.homes[0].city, "Boise");
  assert.equal(result.homes[0].state, "ID");
  assert.equal(result.homes[0].imageUrl, "https://images.example/cover.jpg");
  assert.equal(result.homes[0].sourceUrl, "https://www.zillow.com/homedetails/12345_zpid/");
  assert.equal(result.homes[0].zestimate, 530000);
});

test("normalizes all property photos and expanded home facts", () => {
  const property = normalizeOpenWebNinjaProperty({
    data: {
      zpid: 12345,
      description: "Updated home near downtown.",
      yearBuilt: 2018,
      responsivePhotos: [
        {
          mixedSources: {
            jpeg: [
              {
                url: "https://photos.zillowstatic.com/fp/0123456789abcdef0123456789abcdef-p_d.jpg",
              },
              {
                url: "https://photos.zillowstatic.com/fp/0123456789abcdef0123456789abcdef-o_a.webp",
              },
            ],
          },
        },
        { mixedSources: { jpeg: [{ url: "https://images.example/two.jpg" }] } },
      ],
      priceHistory: [
        { event: "Listed for sale", price: 525000, date: "2026-10-01" },
        { event: "Price change", price: 515000, date: "2026-10-10" },
      ],
      taxHistory: [{ year: 2025, taxPaid: 3200, value: 410000 }],
      zestimate: 520000,
      resoFacts: {
        heating: "Forced air",
        cooling: "Central air",
        parkingFeatures: ["Garage", "Off street"],
        interiorFeatures: ["Fireplace", "Walk-in closet"],
        appliances: ["Dishwasher", "Range"],
        highSchoolDistrict: "Boise Independent",
      },
    },
  });
  assert.equal(property.description, "Updated home near downtown.");
  assert.equal(property.yearBuilt, 2018);
  assert.deepEqual(property.images, [
    "https://photos.zillowstatic.com/fp/0123456789abcdef0123456789abcdef-p_d.jpg",
    "https://images.example/two.jpg",
  ]);
  assert.equal(property.heating, "Forced air");
  assert.equal(property.cooling, "Central air");
  assert.match(property.parking ?? "", /Garage/);
  assert.match(property.appliances ?? "", /Dishwasher/);
  assert.match(property.specialFeatures ?? "", /Fireplace/);
  assert.equal(property.schoolDistrict, "Boise Independent");
  assert.equal(property.priceHistory.length, 2);
  assert.deepEqual(property.taxHistory[0], { date: "2025-01-01", amount: 3200, value: 410000 });
  assert.equal(property.zestimate, 520000);
});

test("only accepts numeric OpenWeb Ninja listing IDs", () => {
  assert.ok(OPENWEBNINJA_ID.test("openwebninja-12345"));
  assert.ok(!OPENWEBNINJA_ID.test("openwebninja-abc"));
});
