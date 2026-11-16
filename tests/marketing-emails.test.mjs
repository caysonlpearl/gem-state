import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import React from "react";
import { render } from "@react-email/render";
import * as marketing from "../src/lib/shopping-marketing.ts";
import { brand } from "../src/config/brand.ts";
import { shoppingDatabaseFixture } from "./helpers/shopping-database.mjs";

const day = 86400000,
  now = Date.parse("2026-11-17T17:00:00Z");
const event = (kind, days = 0, overrides = {}) => ({
  id: randomUUID(),
  kind,
  session: randomUUID(),
  listingId: "seed",
  at: new Date(now - days * day).toISOString(),
  ...overrides,
});
const card = (id, overrides = {}) => ({
  id,
  title: "2022 Toyota Tacoma",
  categorySlug: "cars-trucks",
  priceCents: 3000000,
  city: "Boise",
  state: "ID",
  createdAt: new Date(now - day).toISOString(),
  ...overrides,
});
const inventory = () =>
  ["seed", "a", "b", "c", "d"].map((id) => ({
    listing_id: id,
    card: card(id),
    first_seen_at: new Date(now - day).toISOString(),
    valid_until: new Date(now + day).toISOString(),
  }));
const account = { shopping_alerts: true, alerts_updated_at: "2026-11-01" };
const launch = now - 10 * day;

test("exactly ten distinct marketing situations have distinct subjects and real actions", () => {
  assert.equal(Object.keys(marketing.MARKETING_CAMPAIGNS).length, 10);
  const subjects = Object.keys(marketing.MARKETING_CAMPAIGNS).map((c) =>
    marketing.marketingSubject(c, "Toyota\r\nInjected header", 3),
  );
  assert.equal(new Set(subjects).size, 10);
  assert.ok(subjects.every((subject) => !/[\r\n]/.test(subject)));
});
test("discovery requires opt-in, meaningful matches, fresh inventory and distinct weekly windows", () => {
  const base = {
    account,
    activity: [event("save")],
    inventory: inventory(),
    launchedAt: launch,
    now,
  };
  assert.ok(marketing.marketingDiscovery(base).some((c) => c.campaign === "category_finds"));
  assert.deepEqual(
    marketing.marketingDiscovery({ ...base, account: { shopping_alerts: false } }),
    [],
  );
  assert.deepEqual(marketing.marketingDiscovery({ ...base, activity: [] }), []);
  assert.deepEqual(
    marketing.marketingDiscovery({ ...base, inventory: inventory().slice(0, 2) }),
    [],
  );
  assert.deepEqual(
    marketing.marketingDiscovery({
      ...base,
      inventory: inventory().map((r) => ({
        ...r,
        first_seen_at: new Date(now - 20 * day).toISOString(),
      })),
    }),
    [],
  );
  const thursday = now + 2 * day,
    saturday = now + 4 * day;
  for (const [at, campaign] of [
    [thursday, "local_finds"],
    [saturday, "weekly_picks"],
  ]) {
    const rows = inventory().map((r) => ({ ...r, valid_until: new Date(at + day).toISOString() }));
    assert.ok(
      marketing
        .marketingDiscovery({ ...base, now: at, inventory: rows })
        .some((c) => c.campaign === campaign),
    );
  }
});
test("welcome applies only to a recent opt-in after launch and never needs browsing history", () => {
  const base = {
    account: { ...account, alerts_updated_at: new Date(now - day).toISOString() },
    activity: [],
    inventory: inventory(),
    launchedAt: launch,
    now,
  };
  const welcome = marketing.marketingDiscovery(base)[0];
  assert.equal(welcome.campaign, "welcome");
  assert.equal(welcome.anchor, now - day);
  assert.deepEqual(marketing.marketingDiscovery({ ...base, account }), []);
  assert.deepEqual(
    marketing.marketingDiscovery({
      ...base,
      account: { ...base.account, marketing_preferences: { discovery: false } },
    }),
    [],
  );
});
test("comeback requires 14–30 days of inactivity and listings that arrived afterward", () => {
  const base = {
    account,
    activity: [event("save", 15)],
    inventory: inventory(),
    launchedAt: launch,
    now,
  };
  assert.ok(marketing.marketingDiscovery(base).some((c) => c.campaign === "comeback"));
  assert.ok(
    !marketing
      .marketingDiscovery({ ...base, activity: [event("save", 31)] })
      .some((c) => c.campaign === "comeback"),
  );
  assert.ok(
    !marketing
      .marketingDiscovery({ ...base, activity: [event("save", 15), event("view")] })
      .some((c) => c.campaign === "comeback"),
  );
});
test("seller variety, safe image URLs, unknown prices and daylight delivery behave honestly", () => {
  const cards = [
    card("out", { state: "UT", sellerId: "out" }),
    card("a", { sellerId: "dealer" }),
    card("b", { sellerId: "dealer" }),
    card("c", { sellerId: "private" }),
  ];
  assert.deepEqual(
    marketing.variedMarketingCards(cards, 3).map((c) => c.id),
    ["a", "c", "b"],
  );
  assert.equal(marketing.marketingPrice(0), "Contact for price");
  assert.equal(marketing.safeMarketingImage("javascript:alert(1)"), undefined);
  assert.equal(marketing.safeMarketingImage("https://private:secret@host.test/p.png"), undefined);
  assert.equal(
    marketing.nextMarketingWindow(Date.parse("2026-11-17T08:00:00Z")),
    Date.parse("2026-11-17T15:00:00Z"),
  );
});

const nativeRequire = createRequire(import.meta.url),
  email = {};
new Function(
  "require",
  "exports",
  ts.transpileModule(
    readFileSync(new URL("../src/lib/email-templates/shopping-alert.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
)(
  (name) =>
    name === "../shopping-marketing"
      ? marketing
      : name === "../../config/brand"
        ? { brand }
        : nativeRequire(name),
  email,
);
test("all ten HTML and text templates render photos, actions, address and opt-out; unsafe HTML remains escaped", async () => {
  for (const campaign of Object.keys(marketing.MARKETING_CAMPAIGNS)) {
    const entry = email.marketingTemplate(campaign);
    const element = React.createElement(entry.component, {
      items: [
        {
          title: '<img src=x onerror="bad()">',
          price: "$30,000",
          previousPrice: "$32,000",
          saving: "$2,000",
          reason: "On your saved list",
          url: "https://onbluebird.com/listings/test",
          imageUrl: "https://onbluebird.com/images/mock-vehicles/jeep-wrangler.jpg",
          location: "Boise, ID",
        },
      ],
      moreUrl: "https://onbluebird.com/notifications",
      unsubscribeUrl: "https://onbluebird.com/unsubscribe",
      preferencesUrl: "https://onbluebird.com/account?tab=settings",
    });
    const html = await render(element),
      plain = await render(element, { plainText: true });
    assert.ok(html.includes("bluebird-marketplace-logo.png"));
    assert.ok(html.includes("jeep-wrangler.jpg"));
    assert.ok(html.includes(brand.mailingAddress));
    assert.ok(html.includes("Turn off shopping emails and notifications"));
    assert.ok(!html.includes('<img src=x onerror="bad()">'));
    assert.ok(plain.includes("$30,000") && plain.includes("https://onbluebird.com/listings/test"));
  }
});

test("stable image links resolve only the recipient delivery’s current eligible public photo", async () => {
  const token = randomUUID(),
    item = randomUUID();
  const state = {
    shopping_deliveries: [{ tracking_token: token, user_id: "owner", queue_ids: [item] }],
    shopping_queue: [{ id: item, user_id: "owner", listing_id: "dealerfeed-a" }],
    shopping_inventory: [
      {
        listing_id: "dealerfeed-a",
        valid_until: new Date(Date.now() + day).toISOString(),
        card: { imageUrl: "https://cdn.example.com/current-photo.jpg?signature=fresh" },
      },
    ],
  };
  let allowed = true;
  const db = {
    from(table) {
      const filters = [];
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return q;
        },
        async maybeSingle() {
          return {
            data: state[table].find((row) => filters.every((filter) => filter(row))) ?? null,
            error: null,
          };
        },
      };
      return q;
    },
  };
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(
      readFileSync(
        new URL("../src/routes/api/shopping-email-image.$token.$item.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
  )((name) => {
    if (name === "@tanstack/react-router") return { createFileRoute: () => () => ({}) };
    if (name === "@/lib/shopping-marketing") return marketing;
    if (name === "@/lib/shopping.server")
      return { shoppingExternalEligibility: async () => new Set(allowed ? ["dealerfeed-a"] : []) };
    if (name === "@/lib/shopping-worker.server")
      return {
        shoppingAvailable: async (_db, row) => row && Date.parse(row.valid_until) > Date.now(),
      };
    throw Error("Unexpected image dependency " + name);
  }, exports);
  let response = await exports.shoppingEmailImage(db, token, item);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), state.shopping_inventory[0].card.imageUrl);
  assert.equal((await exports.shoppingEmailImage(db, token, randomUUID())).status, 404);
  state.shopping_queue[0].user_id = "another-user";
  assert.equal((await exports.shoppingEmailImage(db, token, item)).status, 404);
  state.shopping_queue[0].user_id = "owner";
  allowed = false;
  assert.equal((await exports.shoppingEmailImage(db, token, item)).status, 404);
  allowed = true;
  state.shopping_inventory[0].valid_until = "2020-01-01";
  assert.equal((await exports.shoppingEmailImage(db, token, item)).status, 404);
});

async function fixture() {
  const f = await shoppingDatabaseFixture();
  await f.db.exec(
    readFileSync(
      new URL("../supabase/migrations/20261116180000_marketing_email_program.sql", import.meta.url),
      "utf8",
    ),
  );
  await f.db.query("insert into shopping_accounts(user_id) values($1)", [f.user]);
  return f;
}
async function queue(f, kind = "alternative", campaign = "weekly_picks", count = 1) {
  for (let i = 0; i < count; i++)
    await f.db.query(
      "insert into shopping_queue(user_id,listing_id,kind,event_key,payload) values($1,$2,$3,$2,$4)",
      [f.user, randomUUID(), kind, JSON.stringify({ campaign })],
    );
}
test("claim picks the strongest campaign, limits a batch to six and serializes one recipient", async () => {
  const f = await fixture();
  try {
    await queue(f, "alternative", "weekly_picks");
    await queue(f, "price_drop", "price_drop", 7);
    const claim = (await f.db.query("select * from claim_shopping_delivery()")).rows[0];
    assert.equal(claim.queue_ids.length, 6);
    assert.equal(
      (
        await f.db.query("select distinct kind from shopping_queue where id=any($1::uuid[])", [
          claim.queue_ids,
        ])
      ).rows[0].kind,
      "price_drop",
    );
    assert.equal((await f.db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await f.db.query(
      "update shopping_deliveries set lease_until=now()-interval '1 minute' where id=$1",
      [claim.id],
    );
    assert.equal(
      (await f.db.query("select * from claim_shopping_delivery()")).rows[0].id,
      claim.id,
    );
  } finally {
    await f.db.close();
  }
});
test("daily and rolling-week email caps hold; requested daily search option never lifts discovery limits", async () => {
  const f = await fixture();
  try {
    await queue(f);
    await f.db.query(
      "insert into shopping_deliveries(user_id,queue_ids,status,email_sent,sent_at) values($1,'{}','sent',true,now()-interval '1 hour')",
      [f.user],
    );
    assert.equal((await f.db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await f.db.exec("update shopping_deliveries set sent_at=now()-interval '2 days'");
    await f.db.query(
      "insert into shopping_deliveries(user_id,queue_ids,status,email_sent,sent_at) values($1,'{}','sent',true,now()-interval '3 days'),($1,'{}','sent',true,now()-interval '4 days')",
      [f.user],
    );
    assert.equal((await f.db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await f.db.query("select set_shopping_marketing_preferences($1,'{\"dailySearches\":true}')", [
      f.user,
    ]);
    assert.equal((await f.db.query("select * from claim_shopping_delivery()")).rows.length, 0);
    await queue(f, "match", "search_match");
    assert.equal((await f.db.query("select * from claim_shopping_delivery()")).rows.length, 1);
    assert.equal(
      (await f.db.query("select shopping_alerts from shopping_accounts")).rows[0].shopping_alerts,
      null,
    );
    await assert.rejects(
      f.db.query("select set_shopping_marketing_preferences($1,'{\"shopping_alerts\":true}')", [
        f.user,
      ]),
      /Invalid email/,
    );
    assert.equal(
      (
        await f.db.query(
          "select has_function_privilege('authenticated','set_shopping_marketing_preferences(uuid,jsonb)','execute') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await f.db.close();
  }
});
