import test from "node:test";
import assert from "node:assert/strict";
import { mobileHomepage } from "../src/lib/mobile-catalog.ts";

test("shared home projection excludes restricted, expired and unknown inventory before row selection", () => {
  const now = Date.parse("2026-11-13T05:00:00Z");
  const card = (id, categorySlug, title) => ({
    id,
    categorySlug,
    title,
    productId: id,
    productSlug: id,
    priceCents: 10000,
    currency: "USD",
    city: "Boise",
    state: "ID",
    region: "Treasure Valley",
    condition: "used_good",
    fulfillmentMode: "local_pickup",
    createdAt: new Date(now).toISOString(),
    isFeatured: false,
    imageUrl: null,
    vehicle: null,
  });
  const desk = card("desk", "furniture", "Oak desk"),
    car = card("dealerfeed-car", "cars-trucks", "Family car");
  const snapshot = {
    generatedAt: now,
    layoutVersion: 1,
    sections: {
      native: {
        updatedAt: now,
        cards: [
          desk,
          card("weapon", "firearms", "Rifle"),
          card("misfiled", "general", "Pistol"),
          card("unknown", "unknown", "Unknown"),
          { ...card("merchant", "general", "Gear"), externalMerchandise: { source: "Guns.com" } },
        ],
      },
      vehicles: { updatedAt: now, cards: [car] },
      homes: {
        updatedAt: now,
        cards: [
          {
            ...card("expired-home", "other-real-estate", "House"),
            externalHome: { source: "Mashvisor", cacheExpiresAt: new Date(now - 1).toISOString() },
          },
        ],
      },
    },
  };
  const result = mobileHomepage(snapshot, now),
    ids = [...result.motors, ...result.recent].map((c) => c.id);
  assert(ids.includes(desk.id));
  assert(ids.includes(car.id));
  for (const id of ["weapon", "misfiled", "unknown", "merchant", "expired-home"])
    assert(!ids.includes(id), id);
  assert.equal(result.onlineMerchandise.length, 0);
  snapshot.sections.native.updatedAt = now - 7 * 3600000;
  snapshot.sections.vehicles.updatedAt = now - 7 * 3600000;
  const stale = mobileHomepage(snapshot, now);
  assert.equal(stale.motors.length, 0);
  assert.equal(stale.recent.length, 0);
});
