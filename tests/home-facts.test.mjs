import test from "node:test";
import assert from "node:assert/strict";
import { readableHomeFacts, homeParkingSummary } from "../src/lib/home-facts.ts";
import { normalizeRedfinProperty } from "../src/lib/redfin-contract.ts";

const raw = [
  "Parking Features: Paved Parking",
  "Has Attached Garage",
  "Virtual Tour Unbranded (External Link): https://www.zillow.com/view-imx/test?setAttribution=mls&wl=true",
  "Main Level Bathrooms: 2",
  "Main Level Bedrooms: 3",
  "Appliances: Gas Range, Electric Dryer, Gas Water Heater, Water Softener, Washer, Refrigerator, Microwave, Disposal, Cooktop",
  "Flooring: Tile, Carpet, LVP",
  "Interior Features: Cable Internet Available, Fireplace, High Speed Internet, Washer Hookup",
  "Basement YN: No",
  "Basement: Crawl Space",
  "Building Area Total: 2794.0",
  "Tax Annual Amount: 3741.15",
  "Beds: 5",
  "Baths: 3.0",
  "Year Built: 2017",
  "Unfinished Sq. Ft.: --",
  "Stories: —",
  "Lot Size Acres: 0.24",
];
test("legacy cached metadata becomes distinct deduplicated facts instead of one long field", () => {
  const formatted = readableHomeFacts(
    [
      [
        "Interior",
        [
          ["Bedrooms", "5 beds"],
          ["Bathrooms", "3 baths"],
          ["Appliances", raw[5] + ", " + raw[7]],
        ],
      ],
      ["Property", [["Special features", raw.join(", ")]]],
    ],
    raw,
  );
  const rows = formatted.groups.flatMap(([, rows]) => rows);
  assert.equal(rows.filter(([label]) => label === "Bedrooms").length, 1);
  assert.equal(rows.find(([label]) => label === "Bathrooms")[1], "3");
  assert.equal(
    rows.find(([label]) => label === "Appliances")[1],
    raw[5].replace("Appliances: ", ""),
  );
  assert.ok(
    !rows.some(([, value]) => value.includes("https://") || value.includes("Interior Features:")),
  );
  assert.ok(!rows.some(([label]) => /Unfinished|Stories/.test(label)));
  assert.equal(rows.find(([label]) => label === "Annual property tax")[1], "$3,741");
  assert.equal(formatted.links.length, 1);
  assert.equal(formatted.links[0].label, "View virtual tour");
  assert.equal(homeParkingSummary(raw[0] + " · " + raw[1], raw), "Attached garage");
});
test("plain amenities, missing values and an explicit negative garage retain their meaning", () => {
  assert.equal(
    homeParkingSummary("Parking Features: Street Parking · Attached Garage: No"),
    "Street Parking",
  );
  const rows = readableHomeFacts(
    [
      [
        "Interior",
        [
          ["Bedrooms", "3 beds"],
          ["Cooling", "N/A"],
        ],
      ],
    ],
    ["Pool", "Lake access"],
  ).groups.flatMap(([, rows]) => rows);
  assert.ok(rows.some(([label, value]) => label === "Amenities" && value === "Pool · Lake access"));
  assert.ok(!rows.some(([label]) => label === "Cooling"));
});
test("Redfin typed fields match labels rather than unrelated values mentioning an appliance", () => {
  const detail = normalizeRedfinProperty({
    data: {
      amenity_groups: [
        {
          title: "Interior",
          groups: [
            {
              title: "Features",
              entries: [
                { name: "Appliances", values: ["Gas Range", "Washer"] },
                { name: "Interior Features", values: ["Washer Hookup", "Fireplace"] },
                { name: "Virtual Tour", values: ["https://example.com/washer-heating-tour"] },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.equal(detail.appliances, "Appliances: Gas Range, Washer");
  assert.equal(detail.heating, null);
  assert.ok(detail.amenities.some((value) => value.includes("Virtual Tour")));
});
