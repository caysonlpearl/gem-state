import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { balancedShoppingFeed, rankShopping } from "../src/lib/shopping-contract.ts";
const now = Date.now();
const cards = ["pets", "cars-trucks", "furniture", "other-real-estate"].flatMap((categorySlug) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${categorySlug}-${i}`,
    categorySlug,
    title: `Public ${categorySlug} ${i}`,
    priceCents: 10000,
    city: "Boise",
    state: "ID",
    createdAt: new Date(now - 86400000).toISOString(),
    discoverySellerKey: `seller-${categorySlug}-${i}`,
  })),
);
const event = (kind, listingId) => ({
  id: randomUUID(),
  kind,
  listingId,
  session: randomUUID(),
  at: new Date(now).toISOString(),
});
function feed(events) {
  const viewed = new Set(events.filter((e) => e.kind === "view").map((e) => e.listingId));
  return balancedShoppingFeed(
    rankShopping(cards, events, new Map(), now).filter((row) => !viewed.has(row.card.id)),
    events,
    now,
  ).map((row) => row.card);
}
const counts = (rows) =>
  rows.reduce((result, card) => {
    result[card.categorySlug] = (result[card.categorySlug] ?? 0) + 1;
    return result;
  }, {});
test("one cat view cannot replace the feed with cats when other stock is available", () => {
  const result = feed([event("view", "pets-0")]);
  assert.equal(result.length, 8);
  assert.equal(counts(result).pets, 2);
  assert.equal(Object.keys(counts(result)).length, 4);
  assert.equal(new Set(result.slice(0, 3).map((card) => card.categorySlug)).size, 3);
});
test("cat then vehicle retains both interests, including after a fresh server/history read", () => {
  const history = [event("view", "pets-0"), event("view", "cars-trucks-0")];
  const before = feed(history),
    after = feed(JSON.parse(JSON.stringify(history)));
  assert.equal(before.length, 8);
  assert(counts(before).pets > 0 && counts(before)["cars-trucks"] > 0);
  assert.deepEqual(counts(after), counts(before));
  assert.deepEqual(
    after.map((c) => c.id),
    before.map((c) => c.id),
  );
});
test("explicit saves earn more preference while keeping other interests and discovery", () => {
  const weak = feed([event("view", "pets-0"), event("view", "cars-trucks-0")]);
  const strong = feed([event("save", "pets-0"), event("view", "cars-trucks-0")]);
  assert(counts(strong).pets > counts(weak).pets);
  assert(counts(strong).pets < 8);
  assert(counts(strong)["cars-trucks"] > 0);
  assert(Object.keys(counts(strong)).length >= 3);
});
test("balancing preserves seller limits, dismissals and verified purchases", () => {
  const events = [
    event("view", "pets-0"),
    event("dismiss", "cars-trucks-1"),
    event("purchase", "furniture-1"),
  ];
  const sameSeller = cards.map((card) => ({ ...card, discoverySellerKey: card.categorySlug }));
  const result = balancedShoppingFeed(
    rankShopping(sameSeller, events, new Map(), now),
    events,
    now,
  );
  assert(!result.some((row) => ["cars-trucks-1", "furniture-1"].includes(row.card.id)));
  const sellers = result.map((row) => row.card.discoverySellerKey);
  for (const seller of new Set(sellers)) assert(sellers.filter((s) => s === seller).length <= 2);
});
