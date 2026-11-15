import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  shoppingEngagement,
  rankShopping,
  interests,
  SHOPPING_WEIGHTS,
  shoppingRankingVersion,
} from "../src/lib/shopping-contract.ts";
import {
  evaluateShoppingRanking,
  rankingObservations,
  BASELINE_WEIGHTS,
  RANKING_KEYS,
} from "../src/lib/shopping-learning.ts";
import { mobileShoppingEvent } from "../src/lib/mobile-shopping.ts";
const now = Date.parse("2026-11-15T12:00:00Z"),
  day = 86400000;
const event = (kind, context = {}, extra = {}) => ({
  id: randomUUID(),
  kind,
  listingId: "seed",
  session: randomUUID(),
  at: new Date(now).toISOString(),
  context,
  ...extra,
});
const view = event("view");
const activity = (kind, context, extra = {}) =>
  event(kind, context, { session: view.session, ...extra });
const card = (id, extra = {}) => ({
  id,
  title: id,
  categorySlug: "cars-trucks",
  priceCents: 100,
  city: "Boise",
  createdAt: new Date(now - day).toISOString(),
  ...extra,
});

test("attention needs a prior same-session/listing view and ignores expired, future and malformed events", () => {
  for (const extra of [
    { session: randomUUID() },
    { listingId: "other" },
    { at: new Date(now - 31 * day).toISOString() },
    { at: new Date(now + 1).toISOString() },
  ]) {
    assert.equal(
      shoppingEngagement([view, activity("active", { seconds: 60 }, extra)], now).get("seed") ?? 0,
      0,
    );
  }
  assert.equal(shoppingEngagement([activity("active", { seconds: 60 })], now).size, 0);
  for (const seconds of ["60", NaN, Infinity, -1, 0, null])
    assert.equal(shoppingEngagement([view, activity("active", { seconds })], now).get("seed"), 0);
  for (const photo of ["1", NaN, Infinity, -1, 0, 1.5, 101])
    assert.equal(shoppingEngagement([view, activity("photo", { photo })], now).get("seed"), 0);
});

test("engagement is capped per session, deduplicates event/photo repeats, and decays over 14 days", () => {
  const active = activity("active", { seconds: 60 });
  const photo = activity("photo", { photo: 1 });
  assert.equal(
    shoppingEngagement(
      [view, active, active, photo, photo, activity("photo", { photo: 1 })],
      now,
    ).get("seed"),
    (60 / 300 + 1 / 8) / 2,
  );
  const full = [
    view,
    ...Array.from({ length: 20 }, () => activity("active", { seconds: 999 })),
    ...Array.from({ length: 20 }, (_, i) => activity("photo", { photo: i + 1 })),
  ];
  assert.equal(shoppingEngagement(full, now).get("seed"), 1);
  const second = randomUUID();
  assert.equal(
    shoppingEngagement(
      [...full, ...full.map((e) => ({ ...e, id: randomUUID(), session: second }))],
      now,
    ).get("seed"),
    1,
  );
  assert.equal(
    shoppingEngagement(
      full.map((e) => ({ ...e, at: new Date(now - 14 * day).toISOString() })),
      now,
    ).get("seed"),
    0.5,
  );
});

test("website duration summaries and native interval samples produce the same bounded attention", () => {
  const web = shoppingEngagement([view, activity("active", { seconds: 300 })], now);
  const native = shoppingEngagement(
    [view, ...Array.from({ length: 30 }, () => activity("active", { seconds: 10 }))],
    now,
  );
  assert.equal(web.get("seed"), 0.5);
  assert.equal(native.get("seed"), web.get("seed"));
});

test("baseline weights, scores and reminders stay unchanged; reviewed engagement respects category and housing mode", () => {
  assert.deepEqual(SHOPPING_WEIGHTS, {
    purchase: 20,
    inquiry: 12,
    save: 10,
    repeat: 3,
    search: 2,
    view: 1,
  });
  const base = [view],
    rich = [...base, activity("active", { seconds: 60 }), activity("photo", { photo: 1 })];
  assert.equal(interests(base, now).get("seed").score, interests(rich, now).get("seed").score);
  const cards = [
    card("seed"),
    card("same"),
    card("other", { categorySlug: "home-garden" }),
    card("rental", { categorySlug: "homes", home: { mode: "rent" } }),
  ];
  const baseline = rankShopping(cards, base, new Map(), now),
    observed = rankShopping(cards, rich, new Map(), now);
  assert.deepEqual(
    baseline.map((x) => [x.card.id, x.score]),
    observed.map((x) => [x.card.id, x.score]),
  );
  assert.equal(observed.find((x) => x.card.id === "same").score, 2.5 + 29 / 30);
  const reviewed = rankShopping(cards, rich, new Map(), now, {
    ...BASELINE_WEIGHTS,
    engagement: 2,
  });
  assert.ok(
    reviewed.find((x) => x.card.id === "same").score >
      observed.find((x) => x.card.id === "same").score,
  );
  for (const id of ["other", "rental"])
    assert.equal(reviewed.find((x) => x.card.id === id).features.rank_engagement, 0);
  const homes = [
    card("seed", { categorySlug: "homes", home: { mode: "sale" } }),
    card("sale", { categorySlug: "homes", home: { mode: "sale" } }),
    card("rent", { categorySlug: "homes", home: { mode: "rent" } }),
  ];
  assert.equal(
    rankShopping(homes, rich, new Map(), now).find((x) => x.card.id === "rent").features
      .rank_engagement,
    0,
  );
});

test("exposure features reconstruct relative scores, including search/category intent and freshness, within a distinct batch", () => {
  const cards = [card("seed"), card("same"), card("bike", { categorySlug: "bikes" })];
  const events = [
    view,
    activity("active", { seconds: 60 }),
    event("search", {}, { listingId: undefined, search: { category: "bikes" } }),
  ];
  const ranked = rankShopping(cards, events, new Map(), now, {
    ...BASELINE_WEIGHTS,
    engagement: 2,
  });
  const reconstructed = ranked.map(
    (row) =>
      row.features.rank_intent +
      RANKING_KEYS.reduce(
        (sum, key) =>
          sum + row.features[`rank_${key}`] * { ...BASELINE_WEIGHTS, engagement: 2 }[key],
        0,
      ),
  );
  const scale = ranked[0].score / reconstructed[0];
  for (let i = 0; i < ranked.length; i++)
    assert.ok(Math.abs(reconstructed[i] * scale - ranked[i].score) < 1e-10);
  assert.equal(new Set(ranked.map((x) => x.features.rank_batch)).size, 1);
  assert.notEqual(
    rankShopping(cards, events, new Map(), now)[0].features.rank_batch,
    ranked[0].features.rank_batch,
  );
});

function trainingRows() {
  return Array.from({ length: 120 }, (_, i) => {
    const subject = "u:fixture-" + i,
      batch = randomUUID();
    const row = { subject, session: "s", batch, intent: 0 };
    return [
      { ...row, listing: "positive", contact: true, features: [0, 0, 0, 0, 1] },
      ...Array.from({ length: 10 }, (_, j) => ({
        ...row,
        listing: "negative" + j,
        contact: false,
        features: [0, 0, 0, 0, 0],
      })),
    ];
  }).flat();
}
test("sufficient held-out improvement yields an eligible candidate, never an automatic promotion", () => {
  const result = evaluateShoppingRanking(trainingRows());
  assert.equal(result.promoted, false);
  assert.equal(result.challenger.eligible, true);
  assert.equal(result.baseline.weights.engagement, 0);
  assert.ok(result.challenger.weights.engagement > 0);
  assert.equal(result.baseline.accuracy, 0.5);
  assert.equal(result.challenger.accuracy, 1);
  assert.ok(
    result.challenger.trainingPairs >= 200 &&
      result.challenger.testPairs >= 100 &&
      result.outcomes >= 30,
  );
  assert.equal(
    evaluateShoppingRanking(trainingRows().map((r) => ({ ...r, batch: randomUUID() }))).challenger
      .eligible,
    false,
    "Separate responses cannot be paired as if shown together",
  );
});
test("old-model, incomplete and malformed observations are excluded; native sanitization preserves only allowlisted exposure facts", () => {
  const row = trainingRows()[0];
  const context = Object.fromEntries(
    RANKING_KEYS.map((key, i) => [`rank_${key}`, row.features[i]]),
  );
  Object.assign(context, {
    model: shoppingRankingVersion("rules-v1"),
    rank_intent: row.intent,
    rank_batch: row.batch,
  });
  const exposure = { ...row, context };
  assert.equal(rankingObservations([exposure], "rules-v1").length, 1);
  for (const patch of [
    { model: "rules-v1:category-seeds-v1" },
    { rank_engagement: undefined },
    { rank_intent: "0" },
    { rank_batch: undefined },
    { rank_budget: Infinity },
    { rank_visual: -1 },
  ])
    assert.equal(
      rankingObservations([{ ...exposure, context: { ...context, ...patch } }], "rules-v1").length,
      0,
    );
  assert.equal(rankingObservations([exposure], "changed-model").length, 0);
  const sanitized = mobileShoppingEvent(
    event("impression", {
      ...context,
      microphone: "private",
      fingerprint: "forbidden",
      latitude: 43,
    }),
  );
  assert.equal(sanitized.context.rank_engagement, 1);
  assert.equal(sanitized.context.rank_batch, row.batch);
  const numericBatch = "00000000-0000-4000-8000-000000000001";
  assert.equal(
    mobileShoppingEvent(event("impression", { rank_batch: numericBatch })).context.rank_batch,
    numericBatch,
  );
  assert.equal(
    mobileShoppingEvent(event("impression", { rank_batch: "private@example.com" })).context
      .rank_batch,
    undefined,
  );
  for (const key of ["microphone", "fingerprint", "latitude"])
    assert.equal(sanitized.context[key], undefined);
  assert.equal(
    evaluateShoppingRanking(trainingRows().map((r) => ({ ...r, features: [NaN] }))).challenger
      .eligible,
    false,
  );
});

test("actual weekly worker persists a candidate and never writes controls, including a concurrent unique conflict", async () => {
  const raw = readFileSync(
    new URL("../src/lib/shopping-worker.server.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(
    raw.slice(raw.indexOf("async function evaluateWeeklyRanking")) +
      "\nexports.run = evaluateWeeklyRanking;",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const learning = await import("../src/lib/shopping-learning.ts");
  for (const code of [null, "23505", "other"]) {
    const writes = [];
    const db = {
      from(table) {
        assert.equal(table, "shopping_model_evaluations");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: null };
          },
          async insert(row) {
            writes.push(row);
            return { error: code ? { code } : null };
          },
        };
      },
      async rpc(name) {
        assert.equal(name, "shopping_training_rows");
        return { data: [] };
      },
    };
    const out = {};
    new Function("exports", "shoppingControls", "require", compiled)(
      out,
      async () => ({ learning: true, model_version: "rules-v1" }),
      (name) => {
        assert.equal(name, "./shopping-learning");
        return learning;
      },
    );
    if (code === "other") await assert.rejects(out.run(db), /could not be saved/);
    else await out.run(db);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].promoted, false);
    assert.equal(writes[0].baseline.modelVersion, "rules-v1");
  }
});
