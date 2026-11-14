import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { directoryCards } from "../src/lib/service-directory.server.ts";

const rows = [1, 2].map((n) => ({
  id: `fsq-${String(n).padStart(24, "0")}`,
  name: `Nearby business ${n}`,
  trade: "Plumbers",
  trades: ["Plumbers"],
  address: null,
  city: "Boise",
  state: "ID",
  postcode: null,
  latitude: 43.6,
  longitude: -116.2,
  phone: null,
  website: null,
  email: null,
  facebook_id: null,
  instagram: null,
  source_refreshed_at: null,
  enrichment: null,
  enriched_at: null,
  claimed_by: null,
  imported_at: "2026-11-01T00:00:00Z",
}));
const filters = { category: "services", city: "Boise", radiusMiles: 25 };
function fixture(respond) {
  const calls = [];
  const injectedDb = createClient("https://directory.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const call = { url: new URL(url), init };
        calls.push(call);
        return respond(call, calls.length);
      },
    },
  });
  return {
    calls,
    read: (options = {}, limit = 24) =>
      directoryCards(filters, 0, limit, { injectedDb, failOnError: true, ...options }),
  };
}
const hits = () => Response.json(rows.map(({ id }) => ({ id, total: 7 })));
const failed = () =>
  Response.json({ message: "PRIVATE database diagnostic", code: "TEST" }, { status: 503 });
const stalled = ({ init }) =>
  new Promise((_resolve, reject) => {
    if (init.signal.aborted) return reject(init.signal.reason);
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
function shortDeadline(t, ms = 25) {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  // A real socket keeps Node alive; our stalled fetch double has no socket.
  const keepAlive = setTimeout(() => {}, ms + 1000);
  t.after(() => clearTimeout(keepAlive));
  t.mock.method(AbortSignal, "timeout", (requested) => {
    assert.equal(requested, 8000);
    return timeout(ms);
  });
}

test("nearby service reads preserve RPC order, totals and visibility with no provider request", async () => {
  const f = fixture((_call, n) => (n === 1 ? hits() : Response.json([...rows].reverse())));
  const result = await f.read();
  assert.equal(result.total, 7);
  assert.deepEqual(
    result.cards.map((c) => c.id),
    rows.map((r) => r.id),
  );
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].url.pathname, "/rest/v1/rpc/service_directory_nearby");
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.p_miles, 25);
  assert.equal(body.p_offset, 0);
  assert.equal(body.p_limit, 24);
  assert.equal(f.calls[1].url.pathname, "/rest/v1/service_directory");
  assert.equal(f.calls[1].url.searchParams.get("hidden"), "eq.false");
  assert.equal(f.calls[0].init.signal, f.calls[1].init.signal);
});

test("successful empty and count-only nearby reads remain successful without fetching cards", async () => {
  const empty = fixture(() => Response.json([]));
  assert.deepEqual(await empty.read(), { cards: [], total: 0 });
  assert.equal(empty.calls.length, 1);
  const count = fixture(() => hits());
  assert.deepEqual(await count.read({}, 0), { cards: [], total: 7 });
  assert.equal(count.calls.length, 1);
  assert.equal(JSON.parse(count.calls[0].init.body).p_limit, 1);
});

test("errors in either nearby read reject mobile searches without retries or private diagnostics", async () => {
  for (const failedRead of [1, 2]) {
    const f = fixture((_call, n) => (n === failedRead ? failed() : hits()));
    await assert.rejects(f.read(), (e) => e.message === "Saved services could not be read.");
    assert.equal(f.calls.length, failedRead);
  }
});

test("missing or newly hidden card rows cannot become a successful partial nearby page", async () => {
  const f = fixture((_call, n) => (n === 1 ? hits() : Response.json(rows.slice(0, 1))));
  await assert.rejects(f.read(), /Saved services could not be read\./);
  const legacy = fixture((_call, n) => (n === 1 ? hits() : failed()));
  assert.deepEqual(await legacy.read({ failOnError: false }), { cards: [], total: 0 });
});

test("a stalled nearby RPC is aborted under the normal deadline even with a non-aborting caller signal", async (t) => {
  shortDeadline(t);
  const f = fixture(stalled);
  await assert.rejects(
    f.read({ signal: new AbortController().signal }),
    /Saved services could not be read\./,
  );
  assert.equal(f.calls.length, 1);
  assert(f.calls[0].init.signal.aborted);
});

test("the same nearby deadline covers response-body parsing and the second card read", async (t) => {
  shortDeadline(t);
  const f = fixture((call, n) =>
    n === 1
      ? hits()
      : new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("["));
              call.init.signal.addEventListener(
                "abort",
                () => controller.error(call.init.signal.reason),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
  );
  await assert.rejects(f.read(), /Saved services could not be read\./);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].init.signal, f.calls[1].init.signal);
  assert(f.calls[0].init.signal.aborted);
});

test("caller cancellation stops a pending nearby read and an already-cancelled read makes no request", async () => {
  const controller = new AbortController();
  const f = fixture((call) => {
    setTimeout(() => controller.abort(), 10);
    return stalled(call);
  });
  await assert.rejects(f.read({ signal: controller.signal }), /Saved services could not be read\./);
  assert.equal(f.calls.length, 1);
  const before = fixture(() => {
    throw Error("must not fetch");
  });
  await assert.rejects(
    before.read({ signal: controller.signal }),
    /Saved services could not be read\./,
  );
  assert.equal(before.calls.length, 0);
});
