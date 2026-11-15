import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { mobileRetiredConversationContexts } from "../src/lib/mobile-retired-conversations.server.ts";
import { MOBILE_CATALOG_VERSION } from "../src/lib/mobile-contract.ts";
const user = randomUUID(),
  id = randomUUID();
const summary = {
  id,
  listingId: null,
  buyerId: user,
  sellerId: null,
  otherMemberId: null,
  closedAt: "2026-11-15T00:00:00Z",
};
function client(data, { status = 200 } = {}) {
  const calls = [];
  const db = createClient(
    "https://fixture.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          calls.push({
            url: request.url,
            body: await request.json(),
            method: request.method,
            signal: request.signal,
          });
          return new Response(JSON.stringify(data), {
            status,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  return { db, calls };
}
test("closed participant history uses only private canonical category proofs and preserves explicit null identities", async () => {
  const c = client([
    { conversation_id: id, category_slug: "home-garden", catalog_version: MOBILE_CATALOG_VERSION },
  ]);
  assert.deepEqual([...(await mobileRetiredConversationContexts(c.db, user, [summary]))], [id]);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].method, "POST");
  assert.deepEqual(c.calls[0].body, { _actor: user, _ids: [id] });
  assert.equal(c.calls[0].signal.aborted, false);
  for (const patch of [
    { listingId: randomUUID() },
    { closedAt: null },
    { otherMemberId: randomUUID() },
    { buyerId: randomUUID() },
  ])
    assert.deepEqual(
      [...(await mobileRetiredConversationContexts(c.db, user, [{ ...summary, ...patch }]))],
      [],
    );
  assert.equal(
    c.calls.length,
    1,
    "Ordinary, unclosed and unauthorized rows do not trigger a private lookup",
  );
});
test("old databases and old catalog proofs stay closed; provider errors and malformed rows cannot broaden access", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const c = client({ code, message: "Private diagnostic" }, { status: 404 });
    assert.deepEqual([...(await mobileRetiredConversationContexts(c.db, user, [summary]))], []);
    assert.equal(c.calls.length, 1);
  }
  for (const data of [
    [{ conversation_id: id, category_slug: "firearms", catalog_version: MOBILE_CATALOG_VERSION }],
    [
      {
        conversation_id: id,
        category_slug: "future-category",
        catalog_version: MOBILE_CATALOG_VERSION,
      },
    ],
    [
      {
        conversation_id: id,
        category_slug: "home-garden",
        catalog_version: MOBILE_CATALOG_VERSION + 1,
      },
    ],
  ])
    assert.deepEqual(
      [...(await mobileRetiredConversationContexts(client(data).db, user, [summary]))],
      [],
    );
  for (const data of [
    null,
    [null],
    [
      {
        conversation_id: randomUUID(),
        category_slug: "home-garden",
        catalog_version: MOBILE_CATALOG_VERSION,
      },
    ],
    [
      {
        conversation_id: id,
        category_slug: "home-garden",
        catalog_version: MOBILE_CATALOG_VERSION,
        private: "DO NOT RETURN",
      },
    ],
  ])
    await assert.rejects(
      mobileRetiredConversationContexts(client(data).db, user, [summary]),
      (error) => error.status === 503 && !error.message.includes("PRIVATE"),
    );
  const broken = client({ code: "XX000", message: "PRIVATE DATABASE DETAIL" }, { status: 500 });
  await assert.rejects(
    mobileRetiredConversationContexts(broken.db, user, [summary]),
    (error) => error.status === 503 && !error.message.includes("PRIVATE"),
  );
  assert.equal(broken.calls.length, 1);
});
test("retired history reads reject an over-budget lookup before transport", async () => {
  const c = client([]);
  await assert.rejects(
    mobileRetiredConversationContexts(
      c.db,
      user,
      Array.from({ length: 101 }, () => ({ ...summary, id: randomUUID() })),
    ),
    (error) => error.status === 503,
  );
  assert.equal(c.calls.length, 0);
});
