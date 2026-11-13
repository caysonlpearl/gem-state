import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as contract from "../src/lib/shopping-contract.ts";
import * as deliveryEligibility from "../src/lib/shopping-delivery-eligibility.ts";
const source = readFileSync(
  new URL("../src/lib/shopping-worker.server.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness({ alerts = true, requested = false, beforeHandoff = () => {} } = {}) {
  const user = randomUUID(),
    qid = randomUUID(),
    search = randomUUID(),
    emails = [];
  const now = new Date().toISOString();
  const card = {
    id: "dealerfeed-a",
    title: "Ford F-150",
    categorySlug: "cars-trucks",
    priceCents: 3000000,
    city: "Boise",
    state: "ID",
    createdAt: now,
  };
  const tables = {
    shopping_accounts: [
      {
        user_id: user,
        shopping_alerts: alerts,
        suppressed_at: null,
        history_after: "1970-01-01",
        unsubscribe_token: randomUUID(),
        delivery_blocked: false,
      },
    ],
    shopping_queue: [
      {
        id: qid,
        user_id: user,
        listing_id: card.id,
        kind: requested ? "match" : "price_drop",
        event_key: "price:one",
        payload: requested
          ? { search_ids: [search] }
          : { price_version: "one", previous_price_cents: 3300000 },
        requested,
        status: "pending",
        created_at: now,
        notification_id: randomUUID(),
      },
    ],
    shopping_inventory: [
      {
        listing_id: card.id,
        card,
        price_cents: card.priceCents,
        previous_price_cents: 3300000,
        price_version: "one",
        first_seen_at: now,
        valid_until: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
    saved_searches: [
      {
        id: search,
        user_id: user,
        search: { category: "cars-trucks" },
        paused: false,
        email_alerts: true,
        created_at: "2026-01-01",
      },
    ],
    mobile_account_deletions: [],
    shopping_privacy: [{ subject: "u:" + user, personalization: true }],
    shopping_events: [],
    shopping_favorites: [],
    account_notification_preferences: [],
    shopping_deliveries: [],
    notifications: [],
  };
  function query(table) {
    const filters = [];
    let mode = "read",
      value,
      options,
      one = false,
      start = 0,
      end = Infinity;
    const q = {
      select() {
        return q;
      },
      order() {
        return q;
      },
      limit(n) {
        end = n - 1;
        return q;
      },
      range(a, b) {
        start = a;
        end = b;
        return q;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      in(k, values) {
        filters.push((r) => values.includes(r[k]));
        return q;
      },
      lt(k, v) {
        filters.push((r) => r[k] < v);
        return q;
      },
      gte(k, v) {
        filters.push((r) => r[k] >= v);
        return q;
      },
      gt(k, v) {
        filters.push((r) => r[k] > v);
        return q;
      },
      is(k, v) {
        filters.push((r) => r[k] === v);
        return q;
      },
      not() {
        return q;
      },
      update(v) {
        mode = "update";
        value = v;
        return q;
      },
      insert(v) {
        mode = "insert";
        value = v;
        return q;
      },
      upsert(v, o) {
        mode = "upsert";
        value = v;
        options = o;
        return q;
      },
      single() {
        one = true;
        return q;
      },
      maybeSingle() {
        one = true;
        return q;
      },
      then(resolve, reject) {
        try {
          const rows = tables[table] ?? (tables[table] = []);
          let selected = rows.filter((r) => filters.every((f) => f(r))).slice(start, end + 1);
          if (mode === "update") selected.forEach((r) => Object.assign(r, value));
          if (mode === "insert" || mode === "upsert") {
            selected = [];
            for (const input of Array.isArray(value) ? value : [value]) {
              const keys = (options?.onConflict ?? "id").split(",");
              const existing =
                mode === "upsert" ? rows.find((r) => keys.every((k) => r[k] === input[k])) : null;
              if (existing) {
                if (!options?.ignoreDuplicates) {
                  Object.assign(existing, input);
                  selected.push(existing);
                }
              } else {
                const r = { id: randomUUID(), ...input };
                rows.push(r);
                selected.push(r);
              }
            }
          }
          resolve({ data: structuredClone(one ? (selected[0] ?? null) : selected), error: null });
        } catch (e) {
          reject(e);
        }
      },
    };
    return q;
  }
  const db = {
    from: query,
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: user, email: "shopper@example.test", email_confirmed_at: now } },
          error: null,
        }),
      },
    },
    rpc: async (name) => {
      if (name === "shopping_saved_interests") return { data: [], error: null };
      if (name === "read_published_dealer_inventory")
        return { data: { vehicles: tables.published_feed ?? [{ id: "a" }] }, error: null };
      assert.equal(name, "claim_shopping_delivery");
      const rows = tables.shopping_queue.filter((r) => r.status === "pending");
      if (!rows.length) return { data: [], error: null };
      const d = {
        id: randomUUID(),
        user_id: user,
        queue_ids: rows.map((r) => r.id),
        status: "processing",
        attempts: 1,
        tracking_token: randomUUID(),
        created_at: new Date().toISOString(),
      };
      rows.forEach((r) => (r.status = "processing"));
      tables.shopping_deliveries.push(d);
      return { data: [structuredClone(d)], error: null };
    },
  };
  const externalGateSource = readFileSync(
    new URL("../src/lib/shopping.server.ts", import.meta.url),
    "utf8",
  );
  const parsed = ts.createSourceFile(
    "shopping.server.ts",
    externalGateSource,
    ts.ScriptTarget.Latest,
    true,
  );
  const gate = parsed.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "shoppingExternalEligibility",
  );
  const gateExports = {};
  new Function(
    "exports",
    ts.transpileModule(gate.getText(parsed), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(gateExports);
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "./shopping-contract") return contract;
    if (name === "./shopping-delivery-eligibility.ts") return deliveryEligibility;
    if (name === "./shopping.server")
      return {
        shoppingExternalEligibility: gateExports.shoppingExternalEligibility,
        shoppingControls: async () => ({ notifications: true, catalog_ready_at: "2026-01-01" }),
        shoppingPermission: async () => ({ personalization: true }),
        shoppingActivity: async () => [],
        shoppingHoldout: async () => false,
      };
    if (name === "@/config/brand")
      return { brand: { urls: { siteUrl: "https://onbluebird.com" } } };
    if (name === "./email-templates/send-email")
      return {
        sendTemplateEmail: async (_template, _recipient, options) => {
          await beforeHandoff(tables);
          if (!(await options.beforeSend())) return { sent: false, reason: "recipient_suppressed" };
          emails.push(options);
          return { sent: true, providerId: randomUUID() };
        },
      };
    throw Error("Unmocked " + name);
  }, exports);
  return { worker: exports, db, tables, emails, user, card };
}
test("the delivery worker preserves an explicitly requested saved-search email when broader personalization was declined", async () => {
  const h = harness({ alerts: false, requested: true });
  await h.worker.deliverShoppingAlerts(h.db);
  assert.equal(h.emails.length, 1);
  assert.equal(h.tables.notifications.length, 1);
  assert.equal(h.tables.shopping_queue[0].status, "sent");
});
test("unsubscribe while an email is being rendered prevents provider handoff and suppresses its queue", async () => {
  const h = harness({
    beforeHandoff: (tables) => {
      tables.shopping_accounts[0].shopping_alerts = false;
      tables.shopping_accounts[0].suppressed_at = new Date().toISOString();
      tables.shopping_queue.forEach((q) => (q.status = "suppressed"));
    },
  });
  await h.worker.deliverShoppingAlerts(h.db);
  assert.equal(h.emails.length, 0);
  assert.equal(h.tables.shopping_deliveries[0].status, "suppressed");
});
test("a price or availability change during rendering prevents a stale email", async () => {
  const h = harness({
    beforeHandoff: (tables) => {
      tables.shopping_inventory[0].valid_until = "2020-01-01";
    },
  });
  await h.worker.deliverShoppingAlerts(h.db);
  assert.equal(h.emails.length, 0);
});
test("the generator batches legacy requested candidates even without broader opt-in", async () => {
  const h = harness({ alerts: false, requested: true });
  h.tables.shopping_queue = [];
  await h.worker.generateShoppingAlerts(h.db);
  assert.equal(h.tables.shopping_queue.length, 1);
  assert.equal(h.tables.shopping_queue[0].requested, true);
});

test("revoked feed publication during rendering prevents provider handoff", async () => {
  const h = harness({
    beforeHandoff: (tables) => {
      tables.published_feed = [];
    },
  });
  await h.worker.deliverShoppingAlerts(h.db);
  assert.equal(h.emails.length, 0);
});

test("a crash on the last permitted attempt is recovered without leaving an orphaned processing queue", async () => {
  const h = harness();
  const id = randomUUID();
  h.tables.shopping_queue[0].status = "processing";
  h.tables.shopping_queue[0].delivery_id = id;
  h.tables.shopping_queue[0].created_at = "2020-01-01";
  h.tables.shopping_deliveries.push({
    id,
    user_id: h.user,
    status: "processing",
    attempts: 6,
    lease_until: "2020-01-01",
  });
  await h.worker.deliverShoppingAlerts(h.db);
  assert.equal(h.tables.shopping_queue[0].status, "failed");
  assert.equal(h.tables.shopping_deliveries[0].status, "failed");
  assert.equal(h.emails.length, 0);
});

test("browser tracking module does not call random APIs during edge-worker startup", () => {
  const text = readFileSync(new URL("../src/lib/shopping-client.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("shopping-client.ts", text, ts.ScriptTarget.Latest, true);
  const body = parsed.statements
    .filter((n) => !ts.isImportDeclaration(n))
    .map((n) => n.getText(parsed))
    .join("\n");
  const compiled = ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  assert.doesNotThrow(() =>
    new Function("exports", "crypto", compiled)(
      {},
      {
        randomUUID() {
          throw Error("Random APIs are forbidden during worker module evaluation");
        },
      },
    ),
  );
});

test("pending account deletion suppresses requested saved-search email as well as personalized email", async () => {
  for (const requested of [false, true]) {
    const f = harness({ requested });
    f.tables.mobile_account_deletions.push({ user_id: f.user, status: "requested" });
    await f.worker.deliverShoppingAlerts(f.db);
    assert.equal(f.emails.length, 0);
  }
});
