import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { shoppingEvent } from "../src/lib/shopping-contract.ts";
const require = createRequire(import.meta.url);
const secret = "whsec_" + Buffer.from("synthetic-webhook-test-key").toString("base64");
function fixture() {
  const user = randomUUID(),
    delivery = randomUUID(),
    provider = randomUUID();
  const tables = {
    shopping_deliveries: [
      { id: delivery, user_id: user, provider_id: null, provider_status: null },
    ],
    shopping_accounts: [{ user_id: user, delivery_blocked: false }],
    shopping_queue: [
      { id: randomUUID(), user_id: user, status: "processing" },
      { id: randomUUID(), user_id: randomUUID(), status: "processing" },
    ],
    shopping_email_receipts: [],
  };
  function query(table) {
    let op = "read",
      value,
      one = false;
    const filters = [];
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      in(k, v) {
        filters.push((r) => v.includes(r[k]));
        return q;
      },
      maybeSingle() {
        one = true;
        return q;
      },
      update(v) {
        op = "update";
        value = v;
        return q;
      },
      upsert(v) {
        op = "upsert";
        value = v;
        return q;
      },
      then(resolve) {
        let rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op === "update") rows.forEach((r) => Object.assign(r, value));
        if (op === "upsert") {
          if (!tables[table].some((r) => r.id === value.id)) tables[table].push(value);
          rows = [];
        }
        resolve({ data: structuredClone(one ? (rows[0] ?? null) : rows), error: null });
      },
    };
    return q;
  }
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/routes/api/shopping-email-events.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  let reads = 0;
  new Function("require", "exports", compiled)((name) => {
    if (name === "@tanstack/react-router") return { createFileRoute: () => (options) => options };
    if (name === "@/lib/shopping.server")
      return {
        shoppingDb: async () => {
          reads++;
          return { from: query };
        },
      };
    if (name === "@/lib/runtime-env.server") return { serverEnv: () => secret };
    return require(name);
  }, exports);
  function request(
    type = "email.complained",
    { id = randomUUID(), invalid = false, age = 0, emailId = provider, tag = delivery } = {},
  ) {
    const timestamp = String(Math.floor(Date.now() / 1000) - age),
      body = JSON.stringify({
        type,
        data: {
          email_id: emailId,
          tags: { bluebird_shopping_id: tag },
          to: ["private-recipient@example.test"],
          subject: "Not stored in the shopping receipt",
        },
      });
    const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
    return new Request("https://onbluebird.com/api/shopping-email-events", {
      method: "POST",
      body,
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": "v1," + (invalid ? "invalid" : signature),
      },
    });
  }
  return {
    tables,
    delivery,
    provider,
    request,
    send: (request) => exports.Route.server.handlers.POST({ request }),
    reads: () => reads,
  };
}
test("invalid or stale signatures cannot read or mutate delivery data", async () => {
  const f = fixture();
  assert.equal((await f.send(f.request(undefined, { invalid: true }))).status, 401);
  assert.equal((await f.send(f.request(undefined, { age: 600 }))).status, 401);
  assert.equal(f.reads(), 0);
});
test("signed feedback can arrive before the send acknowledgement, deduplicates, and retains terminal complaints", async () => {
  const f = fixture(),
    id = randomUUID();
  assert.equal((await f.send(f.request("email.complained", { id }))).status, 200);
  assert.equal(f.tables.shopping_deliveries[0].provider_id, f.provider);
  assert.equal(f.tables.shopping_accounts[0].delivery_blocked, true);
  assert.equal(f.tables.shopping_queue[0].status, "suppressed");
  assert.equal(f.tables.shopping_queue[1].status, "processing");
  await f.send(f.request("email.complained", { id }));
  assert.equal(f.tables.shopping_email_receipts.length, 1);
  await f.send(f.request("email.delivered"));
  assert.equal(f.tables.shopping_deliveries[0].provider_status, "email.complained");
  assert.ok(!JSON.stringify(f.tables).includes("private-recipient"));
  assert.ok(!JSON.stringify(f.tables).includes("Not stored"));
});
test("provider suppression blocks further shopping delivery without changing unrelated operational messages", async () => {
  const f = fixture();
  await f.send(f.request("email.suppressed"));
  assert.equal(f.tables.shopping_accounts[0].delivery_blocked, true);
  const other = fixture();
  await other.send(other.request("email.bounced", { emailId: randomUUID(), tag: randomUUID() }));
  assert.equal(other.tables.shopping_accounts[0].delivery_blocked, false);
  assert.equal(other.tables.shopping_queue[0].status, "processing");
});
test("advertising payloads are allowlisted, independently consented, and cannot be forged into purchases", async () => {
  const compiled = ts.transpileModule(
    readFileSync(new URL("../src/lib/shopping-advertising.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  let consent = true;
  const rows = [],
    exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "./runtime-env.server")
      return {
        serverEnv: (key) =>
          ({ META_PIXEL_ID: "12345678", GOOGLE_MEASUREMENT_ID: "G-EXAMPLE" })[key] ?? "",
      };
    if (name === "./shopping-contract") return { shoppingEvent };
    if (name === "./shopping.server")
      return {
        contentHash: async (s) => createHash("sha256").update(s).digest("hex"),
        shoppingControls: async () => ({ advertising: true }),
        shoppingPermission: async () => ({ advertising: consent }),
      };
    throw Error("Unexpected import " + name);
  }, exports);
  const db = {
    from: () => ({
      upsert: async (batch) => {
        rows.push(...batch);
        return { error: null };
      },
    }),
  };
  const event = {
    id: randomUUID(),
    session: randomUUID(),
    kind: "view",
    listingId: "a",
    context: {
      message: "private-message",
      email: "person@example.test",
      latitude: 43.1,
      tax_id: "private-tax",
      fingerprint: "browser-fingerprint",
    },
  };
  await exports.queueShoppingAdvertising(
    db,
    { subject: "u:" + randomUUID(), user: { id: randomUUID() } },
    [event],
  );
  assert.equal(rows.length, 2);
  const payload = JSON.stringify(rows.map((r) => r.payload));
  for (const text of [
    "private-message",
    "person@example.test",
    "private-tax",
    "latitude",
    "fingerprint",
  ])
    assert.ok(!payload.includes(text));
  await exports.queueShoppingAdvertising(db, { subject: "g:" + randomUUID() }, [
    { ...event, id: randomUUID(), kind: "purchase" },
  ]);
  assert.equal(rows.length, 2);
  consent = false;
  await exports.queueShoppingAdvertising(db, { subject: "g:" + randomUUID() }, [
    { ...event, id: randomUUID() },
  ]);
  assert.equal(rows.length, 2);
});
