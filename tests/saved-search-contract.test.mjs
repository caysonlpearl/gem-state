import test from "node:test";
import assert from "node:assert/strict";
import { parseBrowseSearch, inputFromSearch, thresholdValue } from "../src/lib/browse-search.ts";
import { savedSearchBrowseInput } from "../src/lib/saved-search-contract.ts";
import { mobileSearchInput } from "../src/lib/mobile-search.ts";
import { mobileSearchPage, mobileCachedSearch } from "../src/lib/mobile-catalog.ts";
import { matchesShoppingSearch } from "../src/lib/shopping-contract.ts";

const now = Date.now();
const card = (overrides = {}) => ({
  id: "listing-one",
  title: "Local listing",
  categorySlug: "other-real-estate",
  categoryName: "Homes",
  priceCents: 24000000,
  city: "Boise",
  state: "ID",
  condition: "used_good",
  fulfillmentMode: "local_pickup",
  createdAt: new Date(now).toISOString(),
  imageUrl: "https://example.com/one.jpg",
  home: {
    mode: "buy",
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    yearBuilt: 2000,
  },
  ...overrides,
});
const search = (raw) => {
  const result = savedSearchBrowseInput(raw);
  assert.deepEqual(result.unsupported, []);
  return result.input;
};

test("saved homes use the website's bedroom, property, area, year and lease filters", () => {
  const raw = {
    category: "other-real-estate",
    homeTab: "buy",
    propertyType: "Single Family",
    bedrooms: "3+",
    bathrooms: "2+",
    homeSquareFeet: "1,500+",
    homeYearBuilt: 1990,
  };
  assert.equal(thresholdValue("1,500+"), 1500);
  assert.equal(search(raw).homeBedroomsMin, 3);
  assert.equal(search(raw).homeSquareFeetMin, 1500);
  assert.equal(matchesShoppingSearch(card(), raw), true);
  for (const changed of [
    { bedrooms: "4+" },
    { bathrooms: "3+" },
    { propertyType: "Condo" },
    { homeSquareFeet: "2,000+" },
    { homeYearBuilt: 2010 },
  ])
    assert.equal(
      matchesShoppingSearch(card(), { ...raw, ...changed }),
      false,
      JSON.stringify(changed),
    );
  assert.equal(
    matchesShoppingSearch(
      card({ home: { ...card().home, mode: "rent", leaseLength: "12 months" } }),
      { category: "other-real-estate", homeTab: "rent", leaseLength: "12 months" },
    ),
    true,
  );
  assert.equal(
    matchesShoppingSearch(
      card({ home: { ...card().home, mode: "rent", leaseLength: "6 months" } }),
      { category: "other-real-estate", homeTab: "rent", leaseLength: "12 months" },
    ),
    false,
  );
});

test("job and service alerts apply current website aliases, photos, time windows and license conditions", () => {
  const job = card({
    categorySlug: "jobs",
    home: undefined,
    job: {
      employmentType: "Full-time",
      employerName: "Acme",
      payType: "Hourly",
      payMin: 25,
      payMax: 30,
    },
  });
  const raw = {
    category: "jobs",
    jobType: "Full-time",
    jobPayMin: 20,
    jobPhotos: "true",
    jobPosted: "Last 24 hours",
  };
  assert.equal(matchesShoppingSearch(job, raw), true);
  for (const changed of [{ jobType: "Part-time" }, { jobPayMin: 40 }])
    assert.equal(matchesShoppingSearch(job, { ...raw, ...changed }), false);
  assert.equal(matchesShoppingSearch({ ...job, imageUrl: null }, raw), false);
  assert.equal(
    matchesShoppingSearch({ ...job, createdAt: new Date(now - 2 * 86400000).toISOString() }, raw),
    false,
  );
  const service = card({
    categorySlug: "services",
    home: undefined,
    service: {
      subcategory: "Plumbing",
      serviceArea: "Boise",
      availability: "Weekends",
      licenseNumber: "123",
    },
  });
  const criteria = {
    category: "services",
    serviceSubcategory: "Plumbing",
    serviceArea: "Boise",
    serviceAvailability: "Weekends",
    serviceLicenseRequired: "true",
  };
  assert.equal(matchesShoppingSearch(service, criteria), true);
  assert.equal(
    matchesShoppingSearch(
      { ...service, service: { ...service.service, licenseNumber: null } },
      criteria,
    ),
    false,
  );
  assert.equal(
    matchesShoppingSearch(service, { ...criteria, serviceSubcategory: "Roofing" }),
    false,
  );
});

test("mileage bands use their numeric ceiling across website search and alerts", () => {
  const raw = {
    category: "cars-trucks",
    vehicleMode: "results",
    mileageBands: "Under 25,000 miles",
  };
  assert.equal(inputFromSearch(parseBrowseSearch(raw)).mileageMax, 25000);
  assert.equal(search({ ...raw, mileageMax: 20000 }).mileageMax, 20000);
  assert.equal(
    search({ ...raw, mileageBands: "Under 25,000 miles||Under 50,000 miles" }).mileageMax,
    50000,
  );
  const vehicle = card({
    categorySlug: "cars-trucks",
    home: undefined,
    vehicle: { make: "Ford", model: "F-150", mileage: 30000 },
  });
  assert.equal(matchesShoppingSearch(vehicle, raw), false);
  assert.equal(
    matchesShoppingSearch({ ...vehicle, vehicle: { ...vehicle.vehicle, mileage: 20000 } }, raw),
    true,
  );
});

test("saved results preserve locations and contradictory filters without landing defaults or category resets", () => {
  const car = card({
    categorySlug: "cars-trucks",
    state: "UT",
    home: undefined,
    vehicle: { make: "Ford", mileage: 20000 },
  });
  assert.equal(matchesShoppingSearch(car, { category: "cars-trucks", make: "Ford" }), true);
  assert.equal(search({ category: "cars-trucks" }).state, undefined);
  assert.equal(
    matchesShoppingSearch(card(), { category: "other-real-estate", make: "Ford" }),
    false,
  );
  const firearm = card({ categorySlug: "firearms", title: "Rifle", home: undefined });
  assert.equal(
    matchesShoppingSearch(firearm, {
      category: "firearms",
      city: "Twin Falls",
      firearmMode: "landing",
    }),
    false,
  );
  assert.equal(
    inputFromSearch(
      parseBrowseSearch({ category: "firearms", city: "Twin Falls", firearmMode: "landing" }),
    ).city,
    undefined,
  );
});

test("legacy canonical keys and currency aliases keep their constraints", () => {
  assert.equal(
    matchesShoppingSearch(card(), { categorySlug: "other-real-estate", homeBedroomsMin: 4 }),
    false,
  );
  assert.equal(
    matchesShoppingSearch(card(), {
      categorySlug: "other-real-estate",
      homeBedroomsMin: 3,
      minPrice: "$200,000",
      maxPrice: "$250,000",
      location: "Boise",
    }),
    true,
  );
  assert.equal(
    matchesShoppingSearch(card(), {
      categorySlug: "other-real-estate",
      homeBedroomsMin: 3,
      maxPrice: "$200,000",
    }),
    false,
  );
  assert.equal(matchesShoppingSearch(card({ imageUrl: null }), { hasPhotos: true }), false);
  assert.equal(matchesShoppingSearch(card(), { homeMode: "rent" }), false);
});

test("unsupported, malformed and conflicting constraints never broaden an alert or app search", () => {
  for (const raw of [
    { homeAmenities: "Pool" },
    { homePrice: { toString: null } },
    { homeMode: { toString: null } },
    { radiusMiles: { valueOf: null, toString: null } },
    { serviceVideo: "true" },
    { bedrooms: "unknown" },
    { priceMin: "NaN" },
    { condition: "impossible" },
    { sort: "invalid" },
    { futureFilter: "value" },
    { category: ["other-real-estate"] },
    { homeBedroomsMin: 4, bedrooms: "3+" },
    { jobPosted: "Whenever" },
    { mileageBands: "many" },
  ]) {
    assert.ok(savedSearchBrowseInput(raw).unsupported.length, JSON.stringify(raw));
    assert.equal(matchesShoppingSearch(card(), raw), false);
    if (Object.values(raw).every((value) => ["string", "number", "boolean"].includes(typeof value)))
      assert.equal(mobileSearchInput(new URLSearchParams(raw)), null);
  }
  for (const query of [
    "q=one&q=two",
    "page=0",
    "page=101",
    "page=1.5",
    "includeAllMocks=true",
    "mobileCatalog=false",
    "location=Boise",
  ])
    assert.equal(mobileSearchInput(new URLSearchParams(query)), null, query);
});

test("full mobile search and cached fallback preserve advanced filters and store boundaries", () => {
  const filters = mobileSearchInput(
    new URLSearchParams({
      category: "other-real-estate",
      bedrooms: "3+",
      propertyType: "Single Family",
      priceMin: "",
      sort: "price_low",
    }),
  );
  assert.equal(filters.mobileCatalog, true);
  assert.equal(filters.priceMin, undefined);
  const current = card();
  const result = mobileCachedSearch(
    {
      sections: {
        current: {
          updatedAt: now,
          cards: [
            current,
            card({ id: "small", home: { ...current.home, bedrooms: 2 } }),
            card({ id: "wrong", home: { ...current.home, propertyType: "Condo" } }),
            card({ id: "weapon", title: "Glock pistol" }),
            card({ id: "mock", isMock: true }),
          ],
        },
        stale: { updatedAt: now - 7 * 3600000, cards: [card({ id: "stale" })] },
      },
    },
    filters,
    now,
  );
  assert.deepEqual(
    result.listings.map((c) => c.id),
    [current.id],
  );
  assert.equal(result.incomplete, true);
  assert.equal(result.total, 1);
  assert.equal(
    mobileCachedSearch(
      { sections: { current: { updatedAt: now, cards: [current] } } },
      { ...filters, make: "Toyota" },
      now,
    ).total,
    0,
  );
});

test("app-origin shopping searches permanently exclude prohibited inventory without narrowing website searches", () => {
  const rifle = card({ categorySlug: "firearms", title: "Rifle", home: undefined });
  assert.equal(matchesShoppingSearch(rifle, {}), true);
  assert.equal(matchesShoppingSearch(rifle, { mobileCatalog: true }), false);
  assert.equal(
    matchesShoppingSearch(card({ title: "Glock pistol" }), { mobileCatalog: true }),
    false,
  );
  assert.equal(matchesShoppingSearch(card(), { mobileCatalog: true }), true);
});

test("all active posting windows and canonical bounds remain authoritative", () => {
  assert.equal(
    search({ category: "jobs", jobPosted: "Last 7 days", jobTimeOnSite: "Last 24 hours" })
      .postedWithin,
    "day",
  );
  assert.equal(search({ latitude: 100, longitude: -200, radiusMiles: 999 }).latitude, 90);
  assert.equal(search({ latitude: 100, longitude: -200, radiusMiles: 999 }).longitude, -180);
  assert.equal(search({ latitude: 100, longitude: -200, radiusMiles: 999 }).radiusMiles, 500);
  for (const raw of [
    { homePrice: "100||invalid" },
    { serviceCondition: "unknown" },
    { homeMode: "sale" },
  ])
    assert.equal(matchesShoppingSearch(card(), raw), false);
});

test("a home mode requires home evidence even without a selected category", () => {
  assert.equal(
    matchesShoppingSearch(card({ categorySlug: "cars-trucks", home: undefined }), {
      homeTab: "rent",
    }),
    false,
  );
});

test("full-search pages recheck broad source results and disclose partial counts", () => {
  const good = card();
  const result = mobileSearchPage(
    {
      listings: [good, card({ id: "too-small", home: { ...good.home, bedrooms: 2 } })],
      total: 50,
      page: 1,
      pageSize: 24,
    },
    search({ category: "other-real-estate", bedrooms: "3+" }),
  );
  assert.deepEqual(
    result.listings.map((c) => c.id),
    [good.id],
  );
  assert.equal(result.incomplete, true);
  assert.equal(result.total, 50); // Candidate upper bound, not a false exact match count.
  const complete = mobileSearchPage(
    { listings: [good], total: 1, page: 1, pageSize: 24 },
    search({ bedrooms: "3+" }),
  );
  assert.equal(complete.incomplete, false);
});
