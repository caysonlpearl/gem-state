import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { shoppingDatabaseFixture } from "./helpers/shopping-database.mjs";
import {
  loadShoppingSeedContexts,
  shoppingRecommendationSeeds,
} from "../src/lib/shopping-recommendation-context.server.ts";
import { interests } from "../src/lib/shopping-contract.ts";

function client(fetch) {
  return createClient("https://context.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
}
function rowsResponse(data, options = {}) {
  const count = Array.isArray(data) ? data.length : 0;
  return Response.json(data, {
    ...options,
    headers: { "content-range": `0-${Math.max(0, count - 1)}/${count}`, ...options.headers },
  });
}
const failed = (error) =>
  error.message === "Recommendation context could not be read. Please retry." && !error.cause;

test("the actual SDK projects only canonical category/home intent from the existing inventory with bounded requests", async (t) => {
  const f = await shoppingDatabaseFixture();
  t.after(() => f.db.close());
  for (const [id, category, home] of [
    ["car", "cars-trucks", null],
    ["buy", "homes", { mode: "buy" }],
    ["rent", "homes", { mode: "rent" }],
  ]) {
    await f.db.query(
      "insert into shopping_inventory(listing_id,category,card,price_cents,content_hash,valid_until)values($1,$2,$3,1,'synthetic',now()+interval '1 day')",
      [id, category, JSON.stringify({ id, title: "Synthetic public content not returned", home })],
    );
  }
  const calls = [];
  const db = client(async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    calls.push({ url, signal: request.signal });
    assert.equal(request.method, "GET");
    assert(new Headers(request.headers).get("prefer").includes("count=exact"));
    assert.equal(url.pathname, "/rest/v1/shopping_inventory");
    assert.equal(url.searchParams.get("select"), "listing_id,category,mode:card->home->>mode");
    const ids = url.searchParams.get("listing_id").slice(4, -1).split(",");
    return rowsResponse(
      (
        await f.db.query(
          "select listing_id,category,card->'home'->>'mode' mode from shopping_inventory where listing_id=any($1)",
          [ids],
        )
      ).rows,
    );
  });
  assert.deepEqual(
    [...(await loadShoppingSeedContexts(db, ["car", "buy", "rent", "missing", "car"]))],
    [
      ["car", { category: "cars-trucks", mode: null }],
      ["buy", { category: "homes", mode: "buy" }],
      ["rent", { category: "homes", mode: "rent" }],
    ],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true, "The settled read scope is closed after completion");
});

test("context reads preserve all requested identities, bound concurrency and URL size, and reject over-budget input before transport", async () => {
  let active = 0,
    max = 0;
  const requests = [];
  const db = client(async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    active++;
    max = Math.max(max, active);
    requests.push(url);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return rowsResponse([]);
  });
  const ids = Array.from({ length: 450 }, (_, i) => `dealerfeed-${i}-${"a".repeat(170)}`);
  assert.deepEqual([...(await loadShoppingSeedContexts(db, ids))], []);
  assert(max <= 4);
  assert(max > 1);
  assert(requests.every((url) => url.href.length < 8000));
  const sent = requests.flatMap((url) =>
    url.searchParams.get("listing_id").slice(4, -1).split(","),
  );
  assert.deepEqual(sent, ids);
  const before = requests.length;
  await assert.rejects(
    loadShoppingSeedContexts(
      db,
      Array.from({ length: 15001 }, (_, i) => `item-${i}`),
    ),
    failed,
  );
  await assert.rejects(loadShoppingSeedContexts(db, ["other person@example.com"]), failed);
  assert.equal(requests.length, before);
});

test("metadata failures, foreign ids, duplicate rows and extra private fields cannot silently change recommendation context", async () => {
  for (const data of [
    null,
    [null],
    [{ listing_id: "foreign", category: "homes", mode: null }],
    [{ listing_id: "car", category: "homes", mode: null, private: "DO NOT EXPOSE" }],
    [{ listing_id: "car", category: null, mode: null }],
    [{ listing_id: "car", category: "homes", mode: { private: "DO NOT EXPOSE" } }],
    Array(2).fill({ listing_id: "car", category: "homes", mode: null }),
  ]) {
    let calls = 0;
    const db = client(async () => {
      calls++;
      return rowsResponse(data);
    });
    await assert.rejects(loadShoppingSeedContexts(db, ["car"]), failed);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    loadShoppingSeedContexts(
      client(async () => {
        calls++;
        return Response.json({ message: "PRIVATE PROVIDER DIAGNOSTIC" }, { status: 503 });
      }),
      ["car"],
    ),
    failed,
  );
  assert.equal(calls, 1, "SDK failures are not automatically retried");
  await assert.rejects(
    loadShoppingSeedContexts(
      client(async () =>
        rowsResponse([{ listing_id: "car", category: "cars-trucks", mode: null }], {
          headers: { "content-range": "0-0/2" },
        }),
      ),
      ["car", "desk"],
    ),
    failed,
    "A capped page cannot masquerade as missing inventory",
  );
});

test("a failed read cancels and settles its sibling reads before another metadata window can start", async () => {
  const signals = [];
  let calls = 0;
  const db = client(async (input, init) => {
    const request = new Request(input, init);
    signals.push(request.signal);
    calls++;
    if (calls === 1) return Response.json({ message: "PRIVATE FAILURE" }, { status: 503 });
    return new Promise((resolve) => {
      if (request.signal.aborted) resolve(rowsResponse([]));
      else
        request.signal.addEventListener("abort", () => resolve(rowsResponse([])), { once: true });
    });
  });
  await assert.rejects(
    loadShoppingSeedContexts(
      db,
      Array.from({ length: 900 }, (_, i) => `item-${i}`),
    ),
    failed,
  );
  assert.equal(calls, 4);
  assert(signals.every((signal) => signal.aborted));
});

test("category and home-intent interests get seed coverage before one strong category takes another slot", () => {
  const now = Date.now(),
    events = [],
    contexts = new Map();
  for (let i = 0; i < 10; i++) {
    const id = `car-${i}`;
    contexts.set(id, { category: "cars-trucks", mode: null });
    for (let visit = 0; visit < 5; visit++)
      events.push({
        id: randomUUID(),
        kind: "view",
        listingId: id,
        session: randomUUID(),
        at: new Date(now - visit * 60000).toISOString(),
      });
  }
  for (const [id, category, mode] of [
    ["desk", "home-garden", null],
    ["buy", "homes", "buy"],
    ["rent", "homes", "rent"],
  ]) {
    contexts.set(id, { category, mode });
    events.push({
      id: randomUUID(),
      kind: "save",
      listingId: id,
      session: randomUUID(),
      at: new Date(now).toISOString(),
    });
  }
  const profile = interests(events, now),
    old = [...profile.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((i) => i.listingId);
  assert(
    old.every((id) => id.startsWith("car-")),
    "This reproduces the previous category starvation",
  );
  const seeds = shoppingRecommendationSeeds(profile, contexts);
  assert.equal(seeds.length, 8);
  for (const id of ["desk", "buy", "rent"]) assert(seeds.slice(0, 4).includes(id));
  assert.equal(new Set(seeds).size, 8);
  assert.deepEqual(
    shoppingRecommendationSeeds(profile, contexts),
    seeds,
    "Selection is stable for the same interests",
  );
  contexts.delete("desk");
  assert(!shoppingRecommendationSeeds(profile, contexts).includes("desk"));
  profile.get("rent").dismissed = true;
  assert(!shoppingRecommendationSeeds(profile, contexts).includes("rent"));
});
