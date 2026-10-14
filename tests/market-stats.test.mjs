import test from "node:test";
import assert from "node:assert/strict";

import {
  landingFaq,
  priceByMileage,
  priceByYear,
  priceSummary,
  regionOfListing,
} from "../src/lib/market-stats.ts";

test("price summary needs three prices and uses the middle half from five", () => {
  assert.equal(priceSummary([1000, 2000]), null);
  assert.equal(priceSummary([0, 0, 1000, 2000]), null, "free listings are ignored");
  assert.deepEqual(priceSummary([3000, 1000, 2000]), {
    count: 3,
    medianCents: 2000,
    lowCents: 1000,
    highCents: 3000,
    typicalRange: false,
  });
  const five = priceSummary([100, 200, 300, 400, 100_000]);
  assert.equal(five.medianCents, 300);
  assert.equal(five.lowCents, 200);
  assert.equal(five.highCents, 400, "one outlier doesn't stretch the typical range");
  assert.equal(five.typicalRange, true);
});

test("vehicle price bands only appear with enough vehicles behind them", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const car = (priceCents, year, mileage) => ({ priceCents, vehicle: { year, mileage } });
  assert.deepEqual(priceByYear([car(2_000_000, 2023, 20_000), car(900_000, 2015, 120_000)], now), []);
  const cars = [
    car(3_000_000, 2024, 10_000),
    car(2_600_000, 2022, 40_000),
    car(1_500_000, 2018, 90_000),
    car(600_000, 2008, 190_000),
  ];
  assert.deepEqual(priceByYear(cars, now), [
    { label: "2021 and newer", count: 2, medianCents: 2_800_000 },
    { label: "2016–2020", count: 1, medianCents: 1_500_000 },
    { label: "2010 and older", count: 1, medianCents: 600_000 },
  ]);
  assert.deepEqual(
    priceByMileage(cars).map((row) => row.label),
    ["Under 50,000 miles", "50,000–99,999 miles", "150,000 miles or more"],
  );
});

test("a listing's region comes from its saved region or its Idaho city", () => {
  assert.equal(regionOfListing({ region: "Magic Valley", city: "Oakley", state: "ID" }), "Magic Valley");
  assert.equal(regionOfListing({ region: "Mini-Cassia", city: "oakley", state: "ID" }), "Magic Valley");
  assert.equal(regionOfListing({ region: "", city: "Spokane", state: "WA" }), undefined);
});

test("FAQ answers come from the numbers and skip what has no data", () => {
  const now = new Date("2026-10-14T18:00:00Z");
  assert.deepEqual(
    landingFaq({ noun: "trailers", where: "in and around Boise", total: 0, newest: null, price: null, now }),
    [],
  );
  const faq = landingFaq({
    noun: "trailers",
    where: "in and around Boise",
    total: 6,
    newest: "2026-10-12T15:00:00Z",
    price: priceSummary([150_000, 250_000, 300_000, 420_000, 900_000]),
    otherPlaces: [
      { label: "Nampa", count: 4 },
      { label: "Meridian", count: 2 },
    ],
    now,
  });
  assert.deepEqual(
    faq.map((entry) => entry.question),
    [
      "How much do trailers cost in and around Boise?",
      "How many trailers are for sale in and around Boise?",
      "Where else in Idaho are trailers listed?",
    ],
  );
  assert.match(faq[0].answer, /^The median asking price for trailers in and around Boise is \$3,000 across 5 priced listings/);
  assert.match(faq[0].answer, /most are between \$2,500 and \$4,200 \(as of October 14, 2026\)/);
  assert.equal(
    faq[1].answer,
    "6 listings are live on Bluebird in and around Boise as of October 14, 2026; the newest was posted October 12, 2026.",
  );
  assert.equal(faq[2].answer, "Elsewhere in Idaho, the most listings are in Nampa (4) and Meridian (2).");
});
