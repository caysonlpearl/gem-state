import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { loadSourceModule } from "./helpers/load-source-module.mjs";
const { classifiedListingSchema } = loadSourceModule("lib/classified-listing-contracts.ts");
import { mobileListingAllowed } from "../src/lib/mobile-contract.ts";
function native(storage, calls) {
  class ApiError extends Error {
    constructor(code, status) {
      super("fixture");
      this.code = code;
      this.status = status;
    }
  }
  const modules = {
    "./client": {
      ApiError,
      api: async (...args) => {
        calls.push(args);
        return { listingId: args[0].split("/")[2] };
      },
    },
    "./identity": { installIdentifier: () => "install" },
    "../../../src/lib/mobile-contract": { mobileListingAllowed },
    "../../../src/lib/classified-listing-contracts": { classifiedListingSchema },
  };
  const code = ts.transpileModule(
    readFileSync(
      new URL("../apps/mobile/src/listing-management-attempts.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", "sessionStorage", code)((id) => modules[id], exports, storage);
  return { ...exports, ApiError };
}
test("native listing retries restore the same account, payload, revision and receipt; corrupt or restricted drafts never restore", async () => {
  const owner = randomUUID(),
    other = randomUUID(),
    values = new Map(),
    calls = [],
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  let m = native(storage, calls);
  const attempt = {
    requestId: randomUUID(),
    listingId: randomUUID(),
    version: "a".repeat(64),
    action: "edit",
    input: {
      title: "Local bicycle",
      description: "A well cared for local bicycle ready for a new home.",
      category: "general",
      priceCents: 15000,
      condition: "used_good",
      state: "ID",
      city: "Boise",
      region: "Treasure Valley",
      fulfillmentMode: "local_pickup",
      itemDetails: { itemType: "Bicycle" },
      publicMediaPaths: [owner + "/photo.jpg"],
    },
  };
  m.storeListingAttempt(owner, attempt);
  m = native(storage, calls);
  assert.deepEqual(m.readListingAttempt(owner), attempt);
  assert.equal(m.readListingAttempt(other), null);
  await m.submitListingAttempt(owner, m.readListingAttempt(owner));
  await m.submitListingAttempt(owner, m.readListingAttempt(owner));
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][5], attempt.requestId);
  assert.deepEqual(calls[0][4], { userId: owner, installId: "install" });
  for (const change of [
    { requestId: "bad" },
    { version: "bad" },
    { input: { ...attempt.input, publicMediaPaths: [other + "/p.jpg"] } },
    { input: { ...attempt.input, category: "firearms" } },
    { input: { ...attempt.input, title: "Rifle ammunition" } },
    { input: [] },
    { action: "promote" },
  ]) {
    m.storeListingAttempt(owner, { ...attempt, ...change });
    assert.equal(m.readListingAttempt(owner), null);
  }
  m.storeListingAttempt(owner, attempt);
  m.clearListingAttempt(owner);
  assert.equal(m.readListingAttempt(owner), null);
  assert(m.listingChanged(new m.ApiError("listing_changed", 409)));
  assert(m.listingChanged(new m.ApiError("listing_unavailable", 404)));
  assert(!m.listingChanged(new m.ApiError("account_changed", 409)));
  assert(!m.listingChanged(new m.ApiError("unavailable", 503)));
});
test("independent management capability requires the exact installed version, fails closed and caches its bounded SDK read", async () => {
  for (const [data, fail, expected] of [
    [{ version: 1, management: true }, false, true],
    [{ version: 2, management: true }, false, false],
    [{ version: 1, management: "true" }, false, false],
    [null, false, false],
    [null, true, false],
  ]) {
    let calls = 0;
    const client = createClient("https://capability.fixture.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, init) => {
          calls++;
          assert.equal(
            new URL(url).pathname,
            "/rest/v1/rpc/mobile_listing_management_capabilities",
          );
          assert(init.signal instanceof AbortSignal);
          return fail
            ? Response.json({ message: "private error" }, { status: 503 })
            : Response.json(data);
        },
      },
    });
    const m = loadSourceModule("lib/mobile-listing-capability.server.ts", {
      "../integrations/supabase/client.server": { supabaseAdmin: client },
    });
    assert.deepEqual(
      await Promise.all([m.mobileListingManagementReady(), m.mobileListingManagementReady()]),
      [expected, expected],
    );
    assert.equal(await m.mobileListingManagementReady(), expected);
    assert.equal(calls, 1);
  }
});

test("only exact post-receipt transaction errors permit ending an uncertain management retry", async () => {
  const { commitOwnedMobileListing } =
    await import("../src/lib/mobile-listing-management.server.ts");
  const attempt = {
    requestId: randomUUID(),
    listingId: randomUUID(),
    version: "a".repeat(64),
    action: "archive",
    input: {},
  };
  for (const [message, code, expected] of [
    ["Listing changed; reload before trying again", "P0001", "listing_changed"],
    ["Listing unavailable", "P0001", "listing_unavailable"],
    ["Only open listings can be edited", "P0001", "listing_state_changed"],
    ["Only removed or expired listings can be relisted", "P0001", "listing_state_changed"],
    ["Accept current terms", "P0001", "listing_management_unavailable"],
    ["Listing unavailable", "private", "listing_management_unavailable"],
    ["private database diagnostic", "P0001", "listing_management_unavailable"],
  ]) {
    const client = createClient("https://management.fixture.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => Response.json({ code, message }, { status: 400 }) },
    });
    await assert.rejects(
      commitOwnedMobileListing(client, attempt),
      (e) => e.code === expected && !e.cause && !e.message.includes("private"),
    );
  }
});
