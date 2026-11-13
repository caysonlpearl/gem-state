import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contract from "../src/lib/shopping-contract.ts";
import * as mobileContract from "../src/lib/mobile-contract.ts";
import * as protocol from "../src/lib/mobile-api.ts";
import * as nativeEvents from "../src/lib/mobile-shopping.ts";
const compile = (file) =>
  ts.transpileModule(readFileSync(new URL("../src/lib/" + file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
function load(source, modules) {
  const exports = {};
  new Function("require", "exports", source)((name) => {
    if (!(name in modules)) throw Error("Unexpected provider/module " + name);
    return modules[name];
  }, exports);
  return exports;
}
const shared = load(compile("shopping.server.ts"), { "./shopping-contract.ts": contract });
const handle = load(compile("mobile-shopping.server.ts"), {
  "./mobile-api": protocol,
  "./mobile-contract": mobileContract,
  "./mobile-shopping": nativeEvents,
  "./shopping.server": shared,
}).handleMobileShopping;
function fixture() {
  let subject;
  do {
    subject = "g:" + randomUUID();
  } while (createHash("sha256").update(subject).digest()[0] % 10 === 0);
  const now = new Date().toISOString(),
    session = randomUUID(),
    rpc = [];
  const car = {
    id: "dealerfeed-car",
    title: "Ford truck",
    categorySlug: "cars-trucks",
    priceCents: 2000000,
    city: "Boise",
    state: "ID",
    createdAt: now,
    vehicle: { make: "Ford", model: "F150", year: 2024 },
  };
  const other = { ...car, id: "dealerfeed-other" },
    weapon = { ...car, id: "dealerfeed-weapon", categorySlug: "firearms", title: "A rifle" };
  const tables = {
    shopping_privacy: [{ subject, personalization: true }],
    shopping_controls: [
      { id: true, tracking: true, recommendations: true, model_version: "rules-v1" },
    ],
    shopping_events: [car, weapon].map((c) => ({
      id: randomUUID(),
      subject,
      kind: "view",
      listing_id: c.id,
      session_id: session,
      occurred_at: now,
    })),
    shopping_inventory: [car, other, weapon].map((card) => ({
      listing_id: card.id,
      card,
      valid_until: new Date(Date.now() + 3600000).toISOString(),
      first_seen_at: now,
      content_hash: "hash",
    })),
    shopping_favorites: [],
    shopping_experiments: [],
    mobile_account_deletions: [],
  };
  const db = {
    rpc: async (name, args) => {
      rpc.push({ name, args });
      if (name === "shopping_visual_candidates")
        return {
          data: [
            { seed_id: car.id, listing_id: other.id, card: other, similarity: 1 },
            { seed_id: car.id, listing_id: weapon.id, card: weapon, similarity: 1 },
          ],
        };
      return { data: [] };
    },
    from(name) {
      assert(name in tables, "Unexpected table " + name);
      let rows = tables[name];
      const q = {
        select() {
          return q;
        },
        eq(key, val) {
          rows = rows.filter((r) => r[key] === val);
          return q;
        },
        gt(key, val) {
          rows = rows.filter((r) => r[key] > val);
          return q;
        },
        gte(key, val) {
          rows = rows.filter((r) => r[key] >= val);
          return q;
        },
        in(key, values) {
          rows = rows.filter((r) => values.includes(r[key]));
          return q;
        },
        order() {
          return q;
        },
        limit(n) {
          rows = rows.slice(0, n);
          return q;
        },
        upsert() {
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        single: async () => ({ data: rows[0] ?? null }),
        then(resolve) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { db, subject, tables, rpc, car, weapon };
}
test("store recommendations reuse shared ranking but never learn from or return restricted website inventory", async () => {
  const f = fixture();
  const result = await shared.shoppingRecommendations(f.db, f.subject, {
    eligible: mobileContract.mobileListingAllowed,
  });
  assert(result.recent.some((c) => c.id === f.car.id));
  assert(result.recommended.some((c) => c.id === "dealerfeed-other"));
  assert(
    ![...result.recent, ...result.continuing, ...result.recommended].some(
      (c) => c.id === f.weapon.id,
    ),
  );
  const seeds = f.rpc.find((r) => r.name === "shopping_visual_candidates").args.seed_ids;
  assert(!seeds.includes(f.weapon.id));
  assert(
    f.rpc.every((r) => r.name === "shopping_visual_candidates"),
    "Only private vector lookup; no listing-provider calls",
  );
});
test("native privacy changes derive guest identity from a validated install header and keep ad consent separate", async () => {
  const f = fixture(),
    id = f.subject.slice(2);
  let request = new Request("https://onbluebird.com/api/mobile/v1/shopping/privacy", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Bluebird-Install": id },
    body: JSON.stringify({
      personalization: false,
      advertising: false,
      subject: "u:victim",
      userId: randomUUID(),
    }),
  });
  await handle(request, "shopping/privacy", f.db, null);
  assert.deepEqual(f.rpc[0], {
    name: "mobile_set_personalization",
    args: { _subject: f.subject, _user: null, _allowed: false },
  });
  await assert.rejects(
    () =>
      handle(new Request("https://onbluebird.com/api/mobile/v1/shopping"), "shopping", f.db, null),
    (e) => e.status === 400,
  );
});
test("native similarity filters restricted seeds and candidates without a provider request", async () => {
  const f = fixture(),
    headers = { "X-Bluebird-Install": f.subject.slice(2) };
  const allowed = await handle(
    new Request("https://onbluebird.com/api/mobile/v1/similar?listingId=" + f.car.id, { headers }),
    "similar",
    f.db,
    null,
  );
  assert.deepEqual(
    allowed.cards.map((c) => c.id),
    ["dealerfeed-other"],
  );
  const before = f.rpc.length;
  const denied = await handle(
    new Request("https://onbluebird.com/api/mobile/v1/similar?listingId=" + f.weapon.id, {
      headers,
    }),
    "similar",
    f.db,
    null,
  );
  assert.deepEqual(denied.cards, []);
  assert.equal(f.rpc.length, before);
});
