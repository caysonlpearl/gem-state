import * as activityReads from "../src/lib/shopping-activity.server.ts";
import * as recommendationContext from "../src/lib/shopping-recommendation-context.server.ts";
import * as deletionAccess from "../src/lib/account-deletion-access.server.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contract from "../src/lib/shopping-contract.ts";
import * as mobileContract from "../src/lib/mobile-contract.ts";
import * as protocol from "../src/lib/mobile-api.ts";
import * as nativeEvents from "../src/lib/mobile-shopping.ts";
import * as nativeConsent from "../src/lib/mobile-shopping-consent.ts";
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
const shared = load(compile("shopping.server.ts"), {
  "./shopping-contract.ts": contract,
  "./shopping-activity.server.ts": activityReads,
  "./shopping-recommendation-context.server.ts": recommendationContext,
  "./account-deletion-access.server.ts": deletionAccess,
});
const handle = load(compile("mobile-shopping.server.ts"), {
  "./mobile-api": protocol,
  "./mobile-contract": mobileContract,
  "./mobile-shopping": nativeEvents,
  "./mobile-shopping-consent": nativeConsent,
  "./shopping.server": shared,
}).handleMobileShopping;
function fixture({ onVisual } = {}) {
  let subject;
  do {
    subject = "g:" + randomUUID();
  } while (createHash("sha256").update(subject).digest()[0] % 10 === 0);
  const now = new Date().toISOString(),
    session = randomUUID(),
    rpc = [],
    reads = [];
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
    shopping_privacy: [{ subject, personalization: true, history_after: "1970-01-01" }],
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
      category: card.categorySlug,
      card,
      valid_until: new Date(Date.now() + 3600000).toISOString(),
      first_seen_at: now,
      content_hash: "hash",
    })),
    shopping_choices: [],
    partner_job_reports: [],
    partner_vehicle_reports: [],
    shopping_favorites: [],
    shopping_experiments: [],
    mobile_account_deletions: [],
    shopping_accounts: [],
  };
  const db = {
    rpc: async (name, args) => {
      rpc.push({ name, args });
      if (name === "read_published_dealer_inventory")
        return {
          data: {
            vehicles: tables.shopping_inventory.map((r) => ({
              id: r.listing_id.replace("dealerfeed-", ""),
            })),
          },
        };
      if (name === "shopping_visual_candidates") {
        if (onVisual) return onVisual(args, tables);
        return {
          data: [
            { seed_id: car.id, listing_id: other.id, card: other, similarity: 1 },
            { seed_id: car.id, listing_id: weapon.id, card: weapon, similarity: 1 },
          ],
        };
      }
      return { data: [] };
    },
    from(name) {
      assert(name in tables, "Unexpected table " + name);
      let rows = tables[name],
        start = 0,
        end = Infinity,
        projection;
      const q = {
        select(columns) {
          projection = columns;
          reads.push({ table: name, projection: columns });
          return q;
        },
        eq(key, val) {
          rows = rows.filter(
            (r) => (key === "card->home->>mode" ? r.card.home?.mode : r[key]) === val,
          );
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
        abortSignal() {
          return q;
        },
        retry(value) {
          assert.equal(value, false);
          return q;
        },
        range(a, b) {
          start = a;
          end = b;
          return q;
        },
        limit(n) {
          rows = rows.slice(0, n);
          return q;
        },
        upsert() {
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        then(resolve) {
          return Promise.resolve({
            data: rows.slice(start, end + 1).map((row) =>
              projection === "listing_id,category,mode:card->home->>mode"
                ? {
                    listing_id: row.listing_id,
                    category: row.category,
                    mode: row.card.home?.mode ?? null,
                  }
                : row,
            ),
            error: null,
            count: rows.length,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  return { db, subject, tables, rpc, reads, car, weapon };
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
    f.rpc.every((r) =>
      ["shopping_visual_candidates", "read_published_dealer_inventory"].includes(r.name),
    ),
    "Only private vector lookup; no listing-provider calls",
  );
});

const inventoryRow = (card) => ({
  listing_id: card.id,
  category: card.categorySlug,
  card,
  valid_until: new Date(Date.now() + 3600000).toISOString(),
  first_seen_at: new Date().toISOString(),
  content_hash: "synthetic",
});
const view = (subject, id, at = new Date().toISOString()) => ({
  id: randomUUID(),
  subject,
  kind: "view",
  listing_id: id,
  session_id: randomUUID(),
  occurred_at: at,
});

test("shared app and website ranking retain a lighter category alongside a dominant vehicle interest", async () => {
  let desk, similar;
  const f = fixture({
    onVisual: (args) => ({
      data: args.seed_ids.includes(desk.id)
        ? [{ seed_id: desk.id, listing_id: similar.id, card: similar, similarity: 1 }]
        : [],
    }),
  });
  desk = {
    ...f.car,
    id: "dealerfeed-desk",
    title: "Synthetic desk",
    categorySlug: "home-garden",
    priceCents: 5000,
  };
  similar = { ...desk, id: "dealerfeed-similar-desk", title: "Synthetic similar desk" };
  f.tables.shopping_inventory.push(inventoryRow(desk), inventoryRow(similar));
  for (let i = 0; i < 10; i++) {
    const car = { ...f.car, id: `dealerfeed-interest-${i}` };
    f.tables.shopping_inventory.push(inventoryRow(car));
    for (let visit = 0; visit < 5; visit++) f.tables.shopping_events.push(view(f.subject, car.id));
  }
  f.tables.shopping_events.push(view(f.subject, desk.id));
  const result = await shared.shoppingRecommendations(f.db, f.subject, {
    eligible: mobileContract.mobileListingAllowed,
  });
  const seeds = f.rpc.find((r) => r.name === "shopping_visual_candidates").args.seed_ids;
  assert(seeds.includes(desk.id));
  assert.equal(seeds.length, 8);
  assert(
    result.recommended.some((card) => card.id === similar.id),
    "The lighter interest actually reaches the shared ranking result",
  );
  assert(
    f.rpc.every((r) =>
      ["shopping_visual_candidates", "read_published_dealer_inventory"].includes(r.name),
    ),
    "All candidates come from existing private vectors and cached published inventory",
  );
  assert(
    !f.reads.some((r) => r.projection === "listing_id,category,mode:card->home->>mode"),
    "The existing native eligibility read supplies category contexts without another lookup",
  );
});

test("Recently viewed resolves an older newly revisited listing independently of visual seeds and the newest public page", async () => {
  const f = fixture({ onVisual: () => ({ data: [] }) });
  f.tables.shopping_events = [];
  f.tables.shopping_inventory = [];
  for (let i = 0; i < 220; i++)
    f.tables.shopping_inventory.push(inventoryRow({ ...f.car, id: `dealerfeed-fresh-${i}` }));
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  for (let i = 0; i < 8; i++) {
    const card = { ...f.car, id: `dealerfeed-seed-${i}`, categorySlug: `synthetic-category-${i}` };
    f.tables.shopping_inventory.push(inventoryRow(card));
    for (let visit = 0; visit < 5; visit++)
      f.tables.shopping_events.push(view(f.subject, card.id, old));
  }
  const revisited = {
    ...f.car,
    id: "dealerfeed-older-revisited",
    categorySlug: "home-garden",
    title: "Synthetic older inventory",
  };
  f.tables.shopping_inventory.push(inventoryRow(revisited));
  f.tables.shopping_events.push(view(f.subject, revisited.id));
  const result = await shared.shoppingRecommendations(f.db, f.subject);
  assert(
    !f.rpc
      .find((r) => r.name === "shopping_visual_candidates")
      .args.seed_ids.includes(revisited.id),
    "The revisited item is intentionally below the eight stronger seed categories",
  );
  assert.equal(result.recent[0].id, revisited.id);
  assert.equal(
    result.model,
    "rules-v1:category-seeds-v2:engagement-v1",
    "Missing vectors do not block useful history; exposure identifies the new selection strategy",
  );
  assert.equal(
    f.reads.filter((r) => r.projection === "listing_id,category,mode:card->home->>mode").length,
    1,
  );
  f.tables.shopping_inventory.find((row) => row.listing_id === revisited.id).valid_until = new Date(
    Date.now() - 60000,
  ).toISOString();
  const expired = await shared.shoppingRecommendations(f.db, f.subject);
  assert(
    ![...expired.recent, ...expired.continuing, ...expired.recommended].some(
      (card) => card.id === revisited.id,
    ),
    "Expired cache references cannot become visible history or recommendations",
  );
});

test("an older eligible public listing backfills Recently viewed after eight newer views expire", async () => {
  const f = fixture({ onVisual: () => ({ data: [] }) });
  f.tables.shopping_events = [];
  f.tables.shopping_inventory = [];
  for (let i = 0; i < 8; i++) {
    const card = { ...f.car, id: `dealerfeed-expired-${i}` };
    f.tables.shopping_inventory.push({
      ...inventoryRow(card),
      valid_until: new Date(Date.now() - 1000).toISOString(),
    });
    f.tables.shopping_events.push(
      view(f.subject, card.id, new Date(Date.now() - i * 60000).toISOString()),
    );
  }
  const older = { ...f.car, id: "dealerfeed-older-active" };
  f.tables.shopping_inventory.push(inventoryRow(older));
  f.tables.shopping_events.push(
    view(f.subject, older.id, new Date(Date.now() - 86400000).toISOString()),
  );
  const rows = await shared.shoppingRecommendations(f.db, f.subject);
  assert.deepEqual(
    rows.recent.map((card) => card.id),
    [older.id],
  );
  assert(
    !f.rpc.find((r) => r.name === "shopping_visual_candidates").args.seed_ids.includes(older.id),
    "The eligible replacement is not a top-eight visual seed",
  );
});

test("withdrawal or history clearing after the activity snapshot cannot return the old personalized rows", async () => {
  for (const action of ["withdraw", "clear"]) {
    const f = fixture({
      onVisual: (_args, tables) => {
        if (action === "withdraw") tables.shopping_privacy[0].personalization = false;
        else tables.shopping_privacy[0].history_after = new Date().toISOString();
        return { data: [] };
      },
    });
    const rows = await shared.shoppingRecommendations(f.db, f.subject, {
      eligible: mobileContract.mobileListingAllowed,
    });
    assert.deepEqual(rows.recent, []);
    assert.deepEqual(rows.continuing, []);
    assert.deepEqual(rows.recommended, []);
  }
});

test("Continue shopping resolves an old explicit favorite even when stronger purchased interests supply every visual seed", async () => {
  const f = fixture({ onVisual: () => ({ data: [] }) });
  f.tables.shopping_events = [];
  f.tables.shopping_inventory = [];
  for (let i = 0; i < 220; i++)
    f.tables.shopping_inventory.push(inventoryRow({ ...f.car, id: `dealerfeed-fresh-${i}` }));
  for (let i = 0; i < 8; i++) {
    const card = {
      ...f.car,
      id: `dealerfeed-purchased-${i}`,
      categorySlug: `synthetic-category-${i}`,
    };
    f.tables.shopping_inventory.push(inventoryRow(card));
    f.tables.shopping_events.push({ ...view(f.subject, card.id), kind: "purchase" });
  }
  const favorite = { ...f.car, id: "dealerfeed-old-favorite", categorySlug: "home-garden" };
  f.tables.shopping_inventory.push(inventoryRow(favorite));
  f.tables.shopping_favorites.push({
    subject: f.subject,
    listing_id: favorite.id,
    saved_at: new Date(Date.now() - 100 * 86400000).toISOString(),
  });
  const rows = await shared.shoppingRecommendations(f.db, f.subject);
  assert(
    !f.rpc.find((r) => r.name === "shopping_visual_candidates").args.seed_ids.includes(favorite.id),
  );
  assert.equal(rows.continuing[0].id, favorite.id);
  assert.deepEqual(rows.recent, [], "A save or purchase is not manufactured into a detail visit");
  assert(!rows.recommended.some((card) => card.id.startsWith("dealerfeed-purchased-")));
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

test("signed-in app learning needs explicit native terms while withdrawal and history clearing remain available", async () => {
  const f = fixture(),
    user = { id: randomUUID() },
    subject = `u:${user.id}`;
  f.tables.shopping_privacy.push({ subject, personalization: true, history_after: "1970-01-01" });
  f.tables.shopping_accounts.push({
    user_id: user.id,
    terms_version: mobileContract.MOBILE_POLICY_VERSION,
    shopping_alerts: true,
  });
  const request = (path, method = "GET", body) =>
    new Request(`https://onbluebird.com/api/mobile/v1/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handle(request("shopping"), "shopping", f.db, user)).personalization, false);
  assert.deepEqual(
    (await handle(request("recommendations"), "recommendations", f.db, user)).recommended,
    [],
  );
  for (const [path, method, body] of [
    ["activity", "POST", { events: [] }],
    ["shopping/privacy", "PUT", { personalization: true }],
  ])
    await assert.rejects(
      () => handle(request(path, method, body), path, f.db, user),
      (e) => e.status === 409 && e.code === "terms_required",
    );
  assert.equal(f.rpc.length, 0, "Terms rejection cannot write activity or privacy");
  await handle(
    request("shopping/privacy", "PUT", { personalization: false }),
    "shopping/privacy",
    f.db,
    user,
  );
  await handle(request("shopping/clear", "POST", {}), "shopping/clear", f.db, user);
  assert.deepEqual(
    f.rpc.map((r) => r.name),
    ["mobile_set_personalization", "mobile_clear_shopping_history"],
  );
  assert(f.rpc.every((r) => r.args._subject === subject && r.args._user === user.id));
  Object.assign(f.tables.shopping_accounts[0], {
    mobile_terms_version: mobileContract.MOBILE_POLICY_VERSION,
    mobile_terms_accepted_at: new Date().toISOString(),
  });
  assert.equal((await handle(request("shopping"), "shopping", f.db, user)).personalization, true);
  await handle(
    request("shopping/privacy", "PUT", { personalization: true }),
    "shopping/privacy",
    f.db,
    user,
  );
  assert.equal(f.rpc.at(-1).args._allowed, true);
});

test("interested categories remain recommendable beyond the newest global page when vectors are missing", async () => {
  const f = fixture({ onVisual: () => ({ data: [] }) });
  const seed = {
    ...f.car,
    id: "dealerfeed-older-desk",
    title: "Desk",
    categorySlug: "home-garden",
    priceCents: 5000,
  };
  const match = { ...seed, id: "dealerfeed-related-desk" };
  f.tables.shopping_inventory.splice(
    0,
    Infinity,
    ...Array.from({ length: 220 }, (_, n) => inventoryRow({ ...f.car, id: `dealerfeed-new-${n}` })),
    inventoryRow(seed),
    inventoryRow(match),
  );
  f.tables.shopping_events.splice(0, Infinity, view(f.subject, seed.id));
  const result = await shared.shoppingRecommendations(f.db, f.subject, {
    eligible: mobileContract.mobileListingAllowed,
  });
  assert(result.recommended.some((card) => card.id === match.id));
  assert(
    f.rpc.every((r) =>
      ["shopping_visual_candidates", "read_published_dealer_inventory"].includes(r.name),
    ),
  );
});
