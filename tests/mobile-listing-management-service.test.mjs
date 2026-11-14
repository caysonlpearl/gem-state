import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { listingManagementDatabase } from "./helpers/mobile-listing-management-database.mjs";
import {
  readOwnedMobileListingSnapshot,
  commitOwnedMobileListing,
} from "../src/lib/mobile-listing-management.server.ts";
async function fixture() {
  const f = await listingManagementDatabase(),
    calls = [];
  let drop = false,
    foreign = false,
    outage = false;
  const client = createClient("https://listing-management.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const name = new URL(url).pathname.split("/").at(-1),
          b = JSON.parse(init.body);
        calls.push({ name, b });
        assert.equal(init.method, "POST");
        assert(init.signal instanceof AbortSignal);
        if (outage)
          return Response.json(
            { code: "private_error", message: "private database diagnostics" },
            { status: 503 },
          );
        try {
          let data;
          if (name === "mobile_listing_editor_snapshot") {
            data = await f.snapshot(b._listing);
            if (foreign && data) data.ownerId = f.b;
          } else {
            assert.equal(name, "mobile_manage_listing");
            data = await f.manage(b._listing, b._action, b._expected, b._input, b._request);
            if (drop) {
              drop = false;
              throw new TypeError("Dropped response after commit");
            }
          }
          return Response.json(data);
        } catch (e) {
          if (e instanceof TypeError) throw e;
          return Response.json({ code: e.code, message: e.message }, { status: 400 });
        }
      },
    },
  });
  return {
    ...f,
    client,
    calls,
    setDrop: () => (drop = true),
    setForeign: () => (foreign = true),
    setOutage: () => (outage = true),
  };
}
test("SDK snapshot and mutation adapters preserve uncertain receipts through an actually committed dropped response", async () => {
  const f = await fixture();
  try {
    const id = await f.seed(),
      s = await readOwnedMobileListingSnapshot(f.client, f.a, id);
    const attempt = {
      listingId: id,
      requestId: randomUUID(),
      action: "archive",
      version: s.version,
      input: {},
    };
    f.setDrop();
    await assert.rejects(
      commitOwnedMobileListing(f.client, attempt),
      (e) => e.status === 503 && e.code === "listing_management_unavailable" && !e.cause,
    );
    assert.equal(
      f.calls.filter((c) => c.name === "mobile_manage_listing").length,
      1,
      "SDK must not invisibly repeat a write",
    );
    const replay = await commitOwnedMobileListing(f.client, attempt);
    assert.equal(replay.replayed, true);
    assert.equal(replay.status, "cancelled");
    await f.owner();
    assert.equal(
      (await f.db.query("select count(*)::int n from fixture_listing_calls where action='archive'"))
        .rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("stale updates map to an actionable conflict without returning private provider diagnostics", async () => {
  const f = await fixture();
  try {
    const id = await f.seed(),
      s = await readOwnedMobileListingSnapshot(f.client, f.a, id);
    await f.owner();
    await f.db.query(
      "update products set name='Changed elsewhere' where id=(select product_id from asks where id=$1)",
      [id],
    );
    await f.actor();
    await assert.rejects(
      commitOwnedMobileListing(f.client, {
        listingId: id,
        requestId: randomUUID(),
        action: "archive",
        version: s.version,
        input: {},
      }),
      (e) => e.status === 409 && e.code === "listing_changed",
    );
    f.setOutage();
    await assert.rejects(
      readOwnedMobileListingSnapshot(f.client, f.a, id),
      (e) => e.status === 503 && !e.message.includes("private"),
    );
  } finally {
    await f.db.close();
  }
});
test("private snapshot adapters reject borrowed ownership and invalid scopes before exposing editor data", async () => {
  const f = await fixture();
  try {
    const id = await f.seed();
    f.setForeign();
    await assert.rejects(
      readOwnedMobileListingSnapshot(f.client, f.a, id),
      (e) => e.status === 503,
    );
    const before = f.calls.length;
    await assert.rejects(
      readOwnedMobileListingSnapshot(f.client, "victim", id),
      (e) => e.status === 400,
    );
    assert.equal(f.calls.length, before);
    await assert.rejects(
      commitOwnedMobileListing(f.client, {
        listingId: id,
        requestId: randomUUID(),
        action: "archive",
        version: "bad",
        input: {},
      }),
      (e) => e.status === 400,
    );
    assert.equal(f.calls.length, before);
  } finally {
    await f.db.close();
  }
});

test("oversized UTF-8 and non-JSON input never enter the write queue", async () => {
  const f = await fixture();
  try {
    const id = await f.seed(),
      snapshot = await f.snapshot(id),
      attempt = {
        listingId: id,
        requestId: randomUUID(),
        action: "edit",
        version: snapshot.version,
        input: { category: "general", title: "An item", description: "A local item description." },
      };
    const circular = {};
    circular.self = circular;
    for (const payload of [{ ...attempt.input, description: "é".repeat(33000) }, circular])
      await assert.rejects(
        commitOwnedMobileListing(f.client, { ...attempt, input: payload }),
        (e) => e.status === 400,
      );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.db.close();
  }
});
