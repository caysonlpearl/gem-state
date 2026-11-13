import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  mobileCreateSearch,
  mobileUpdateSearch,
  mobileSavedFilters,
  mobileSavedSearchAllowed,
  mobileSearchPrivacyUpdate,
} from "../src/lib/mobile-saved-search-contract.ts";
import { matchesShoppingSearch } from "../src/lib/shopping-contract.ts";

const migration = "20261113080000_mobile_saved_search_receipts.sql";
test("native saved-search writes commit atomically, replay without resurrection and retain app scope through website edits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
   create table shopping_accounts(user_id uuid,terms_version text);create table mobile_account_deletions(user_id uuid);
   create table categories(slug text);insert into categories values('general'),('other-real-estate'),('cars-trucks'),('firearms');
   create table saved_searches(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),name text not null check(length(name) between 1 and 80),search jsonb not null default '{}',email_alerts boolean not null default true,paused boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now(),last_match_at timestamptz);
  `);
    for (const file of ["20261113050000_mobile_message_receipts.sql", migration])
      await db.exec(
        readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8"),
      );
    const a = randomUUID(),
      b = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.query("insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12')", [
      a,
      b,
    ]);
    await db.query("select set_config('test.actor',$1,false)", [a]);
    const call = async (key, operation, target, input) =>
      (
        await db.query("select mobile_commit_saved_search($1,$2,$3,$4) result", [
          key,
          operation,
          target,
          input,
        ])
      ).rows[0].result;
    const key = randomUUID(),
      input = {
        name: "Three bedroom homes",
        search: { category: "other-real-estate", bedrooms: "3+" },
      };
    const first = await call(key, "create", null, input);
    const replay = await call(key, "create", null, input);
    assert.equal(first.id, replay.id);
    assert.equal(replay.replayed, true);
    assert.equal((await db.query("select count(*)::int n from saved_searches")).rows[0].n, 1);
    let row = (await db.query("select * from saved_searches")).rows[0];
    assert.equal(row.email_alerts, false);
    assert.equal(row.search.mobileCatalog, true);
    const rename = randomUUID();
    await call(rename, "update", first.id, { name: "Renamed" });
    await call(key, "create", null, input);
    assert.equal((await db.query("select name from saved_searches")).rows[0].name, "Renamed");
    await db.query("update saved_searches set search=$1 where id=$2", [
      { category: "cars-trucks", make: "Ford" },
      first.id,
    ]);
    row = (await db.query("select * from saved_searches")).rows[0];
    assert.equal(row.search.mobileCatalog, true);
    await assert.rejects(
      db.query("update saved_searches set search=null where id=$1", [first.id]),
      /Invalid saved search filters/,
    );
    await db.query("select set_config('test.actor',$1,false)", [b]);
    await assert.rejects(
      call(randomUUID(), "update", first.id, { name: "Other owner" }),
      /unavailable/,
    );
    await call(randomUUID(), "delete", first.id, {});
    assert.equal((await db.query("select count(*)::int n from saved_searches")).rows[0].n, 1);
    await db.query("select set_config('test.actor',$1,false)", [a]);
    await assert.rejects(
      call(key, "create", null, { ...input, name: "Changed retry" }),
      /does not match/,
    );
    const email = randomUUID();
    await call(email, "update", first.id, { emailAlerts: true });
    await db.query("update saved_searches set email_alerts=false where id=$1", [first.id]);
    await call(email, "update", first.id, { emailAlerts: true });
    assert.equal(
      (await db.query("select email_alerts from saved_searches")).rows[0].email_alerts,
      false,
    );
    await call(randomUUID(), "delete", first.id, {});
    await call(key, "create", null, input);
    // Exercise the HTTP path after a later deletion, not only the underlying RPC.
    const { writeMobileSavedSearch } = await import("../src/lib/mobile-saved-search.server.ts");
    const replayed = await writeMobileSavedSearch(
      new Request(`https://onbluebird.com/api/mobile/v1/saved-searches/${first.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Idempotency-Key": email },
        body: JSON.stringify({ emailAlerts: true }),
      }),
      {
        rpc: async (_name, args) => ({
          data: await call(args._request, args._operation, args._target, args._input),
          error: null,
        }),
      },
      true,
      async () => {},
    );
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.id, first.id);
    assert.equal((await db.query("select count(*)::int n from saved_searches")).rows[0].n, 0);
    const concurrentKey = randomUUID();
    const results = await Promise.all([
      call(concurrentKey, "create", null, input),
      call(concurrentKey, "create", null, input),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal((await db.query("select count(*)::int n from saved_searches")).rows[0].n, 1);
    const before = (await db.query("select count(*)::int n from mobile_message_receipts")).rows[0]
      .n;
    await assert.rejects(
      call(randomUUID(), "create", null, { name: "Bad", search: { category: "firearms" } }),
      /unavailable/,
    );
    await assert.rejects(
      call(randomUUID(), "create", null, { name: "Glock pistol", search: { category: "general" } }),
      /unavailable/,
    );
    await assert.rejects(
      call(randomUUID(), "create", null, { name: "Bad", search: { categorySlug: "firearms" } }),
      /unavailable/,
    );
    await assert.rejects(
      call(randomUUID(), "create", null, { name: "Bad", search: { make: ["Ford"] } }),
      /Invalid/,
    );
    assert.equal(
      (await db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      before,
    );
    const restrictedId = randomUUID();
    await db.query(
      "insert into saved_searches(id,user_id,name,search) values($1,$2,'Old website search',$3)",
      [restrictedId, a, { q: "rifle" }],
    );
    await assert.rejects(
      call(randomUUID(), "update", restrictedId, { emailAlerts: true }),
      /unavailable/,
    );
    await call(randomUUID(), "delete", restrictedId, {});
    await db.query("insert into mobile_account_deletions values($1)", [a]);
    await assert.rejects(call(randomUUID(), "create", null, input), /deletion pending/);
    await call(randomUUID(), "update", results[0].id, { paused: true, emailAlerts: false });
    await call(randomUUID(), "delete", results[0].id, {});
    const capability = (await db.query("select mobile_messaging_capabilities() result")).rows[0]
      .result;
    assert.deepEqual(capability, { attachments: false, posting: false, savedSearches: true });
    const receipt = JSON.stringify(
      (await db.query("select result from mobile_message_receipts")).rows,
    );
    assert(!receipt.includes("Three bedroom"));
    assert(!receipt.includes("Renamed"));
    assert(!receipt.includes("Ford"));
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select mobile_commit_saved_search($1,$2,$3,$4)", [
        randomUUID(),
        "create",
        null,
        input,
      ]),
      /permission denied/,
    );
    await db.exec("reset role;set role authenticated");
    await assert.rejects(db.query("select * from mobile_message_receipts"), /permission denied/);
  } finally {
    await db.close();
  }
});

test("native saved-search inputs keep all supported filters, default email off, and reject catalog/identity overrides", () => {
  assert.equal(
    mobileCreateSearch.parse({ name: "Homes", search: { bedrooms: "3+" } }).emailAlerts,
    false,
  );
  assert(
    mobileSavedFilters({ category: "other-real-estate", bedrooms: "3+", propertyType: "Condo" })
      .mobileCatalog,
  );
  assert.equal(mobileSavedFilters({ category: "firearms" }), null);
  assert.equal(mobileSavedFilters({ category: "other-real-estate", homeAmenities: "Pool" }), null);
  for (const body of [
    { name: "", search: {} },
    { name: "A", search: {}, userId: randomUUID() },
    { name: "A", search: {}, requestId: randomUUID() },
  ])
    assert(!mobileCreateSearch.safeParse(body).success);
  assert(!mobileUpdateSearch.safeParse({}).success);
  assert(mobileSearchPrivacyUpdate({ paused: true, emailAlerts: false }));
  assert(!mobileSearchPrivacyUpdate({ paused: true, name: "A" }));
  assert(!mobileSavedSearchAllowed({ name: "Rifles", search: {} }));
  assert(!mobileSavedSearchAllowed({ name: "Saved", search: { categorySlug: "firearms" } }));
});

test("studio and description-search controls share their meaning with alert matching", () => {
  const home = {
    id: "h",
    title: "Studio home",
    categorySlug: "other-real-estate",
    priceCents: 100000,
    city: "Boise",
    state: "ID",
    createdAt: new Date().toISOString(),
    home: { mode: "rent", bedrooms: 0 },
  };
  const filters = { category: "other-real-estate", homeTab: "rent", bedrooms: "Studio" };
  assert(matchesShoppingSearch(home, filters));
  assert(!matchesShoppingSearch({ ...home, home: { mode: "rent", bedrooms: 1 } }, filters));
  assert(!matchesShoppingSearch({ ...home, home: { mode: "rent", bedrooms: null } }, filters));
  const service = {
    ...home,
    categorySlug: "services",
    title: "Local business",
    home: undefined,
    service: { serviceSummary: "Specialist drain repairs" },
  };
  assert(!matchesShoppingSearch(service, { category: "services", q: "drain" }));
  assert(
    matchesShoppingSearch(service, {
      category: "services",
      q: "drain",
      serviceExpandSearch: "true",
    }),
  );
});

test("saved-search HTTP writes require a receipt and delegate locked-record validation", async () => {
  const { writeMobileSavedSearch } = await import("../src/lib/mobile-saved-search.server.ts");
  const make = (method, body, receipt = randomUUID()) =>
    new Request(
      "https://onbluebird.com/api/mobile/v1/saved-searches" +
        (method === "POST" ? "" : "/" + randomUUID()),
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(receipt ? { "Idempotency-Key": receipt } : {}),
        },
        body: JSON.stringify(body),
      },
    );
  let calls = 0,
    terms = 0;
  const client = {
    rpc: async () => {
      calls++;
      return { data: { id: randomUUID(), ok: true }, error: null };
    },
  };
  await assert.rejects(
    writeMobileSavedSearch(
      make("POST", { name: "A", search: {} }, null),
      client,
      true,
      async () => {},
    ),
    (error) => error.status === 400,
  );
  await assert.rejects(
    writeMobileSavedSearch(
      make("POST", { name: "A", search: { category: "firearms" } }),
      client,
      true,
      async () => {},
    ),
    (error) => error.status === 400,
  );
  await assert.rejects(
    writeMobileSavedSearch(make("PUT", { name: "Rifles" }), client, true, async () => {}),
    (error) => error.status === 404,
  );
  assert.equal(calls, 0);
  await writeMobileSavedSearch(
    make("PUT", { paused: true, emailAlerts: false }),
    client,
    true,
    async () => {
      terms++;
      throw Error("Terms required");
    },
  );
  assert.equal(terms, 0);
  assert.equal(calls, 1);
  await assert.rejects(
    writeMobileSavedSearch(make("POST", { name: "A", search: {} }), client, false, async () => {}),
    (error) => error.status === 503,
  );
  assert.equal(calls, 1);
});
