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
      "How many trailers are listed in and around Boise?",
      "Where else in Idaho are trailers listed?",
    ],
  );
  assert.match(faq[0].answer, /^Among 5 priced listings reviewed on Bluebird, the median asking price for trailers in and around Boise is \$3,000/);
  assert.match(faq[0].answer, /the middle half of reviewed asking prices is between \$2,500 and \$4,200 \(as of October 14, 2026\)/);
  assert.equal(
    faq[1].answer,
    "The current Bluebird search returns 6 matching listings in and around Boise as of October 14, 2026; the newest reviewed listing was posted October 12, 2026. Search coverage may be limited.",
  );
  assert.equal(faq[2].answer, "Among the listings reviewed elsewhere in Idaho, the most are in Nampa (4) and Meridian (2).");
});

test("the monthly report counts, prices and groups only what the listings support", async () => {
  const { buildMarketReport, reportMonthLabel, reportMonthOf } = await import("../src/lib/market-stats.ts");
  const now = new Date("2026-10-20T18:00:00Z");
  const listing = (extra) => ({
    priceCents: 10_000,
    createdAt: "2026-10-05T12:00:00Z",
    categorySlug: "furniture",
    categoryName: "Furniture",
    city: "Boise",
    region: "Treasure Valley",
    state: "ID",
    make: null,
    model: null,
    ...extra,
  });
  const listings = [
    listing({ priceCents: 10_000 }),
    listing({ priceCents: 20_000, createdAt: "2026-09-02T12:00:00Z" }),
    listing({ priceCents: 30_000, city: "Oakley", region: "ID" }),
    listing({ categorySlug: "jobs", categoryName: "Jobs", priceCents: 0 }),
    listing({ categorySlug: "cars-trucks", categoryName: "Cars & Trucks", make: "Toyota", model: "Tacoma", priceCents: 2_500_000 }),
  ];
  const sales = [1, 2, 3, 4, 5].map((days) => ({
    categorySlug: "furniture",
    createdAt: "2026-10-01T12:00:00Z",
    soldAt: new Date(Date.parse("2026-10-01T12:00:00Z") + days * 86_400_000).toISOString(),
  }));
  sales.push({ categorySlug: "furniture", createdAt: "2026-08-01T12:00:00Z", soldAt: "2026-09-10T12:00:00Z" });

  const report = buildMarketReport(listings, sales, now);
  assert.equal(report.month, "2026-10");
  assert.equal(report.label, "October 2026");
  assert.deepEqual(report.totals, { live: 5, newThisMonth: 4, soldThisMonth: 5 });
  const furniture = report.categories.find((row) => row.slug === "furniture");
  assert.equal(furniture.count, 3);
  assert.equal(furniture.medianCents, 20_000);
  const jobs = report.categories.find((row) => row.slug === "jobs");
  assert.equal(jobs.medianCents, null, "jobs are counted, never priced");
  // Oakley's saved region was "ID"; its city puts it in the Magic Valley.
  assert.deepEqual(
    report.regions.map((row) => [row.region, row.count]),
    [["Treasure Valley", 4], ["Magic Valley", 1]],
  );
  assert.deepEqual(report.vehicles, [{ make: "Toyota", model: "Tacoma", count: 1, medianCents: null }]);
  assert.deepEqual(report.daysToSell, { medianDays: 3, sales: 5 });
  assert.equal(reportMonthOf("2026-11-01T05:00:00Z"), "2026-10", "Idaho time, not UTC");
  assert.equal(reportMonthLabel("2027-01"), "January 2027");
});



test("sold examples never claim a total sales count and rankings disclose the review sample", () => {
  const faq = landingFaq({ noun: "cars", where: "in Idaho", total: 500,
    newest: null, price: null, recentlySold: 8,
    topMakes: [{ label: "Toyota", count: 15 }],
    topCategories: [{ label: "Cars", count: 20 }],
  });
  const sold = faq.find((entry) => entry.question.startsWith("Have any"));
  assert.match(sold.answer, /shows 8 listings.*marked sold by sellers/);
  assert.match(sold.answer, /not a total sales count/);
  for (const entry of faq.filter((entry) => /Which makes|What's for sale/.test(entry.question))) {
    assert.match(entry.answer, /Among the listings reviewed/);
  }
});


test("fewer sold examples do not imply a complete count either", () => {
  for (const recentlySold of [1, 3, 8]) {
    const faq = landingFaq({ noun: "cars", where: "in Idaho", total: 10, newest: null, price: null, recentlySold });
    assert.match(faq.at(-1).answer, /recent examples, not a total sales count/);
  }
  const faq = landingFaq({ noun: "cars", where: "in Idaho", total: 10, newest: null, price: null, recentlySold: 0 });
  assert.ok(faq.every((entry) => !entry.question.startsWith("Have any")));
});
