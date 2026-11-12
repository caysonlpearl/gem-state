import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261112010000_use_full_home_free_allowance.sql",
    import.meta.url,
  ),
  "utf8",
);
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.openwebninja_cache(cache_key text primary key,payload jsonb not null,expires_at timestamptz not null);
    create table public.openwebninja_api_requests(id bigint generated always as identity,cache_key text not null,provider text not null default 'zillow',created_at timestamptz not null default now());`);
  await db.exec(migration);
  const reserve = async (key, provider = "zillow") =>
    (
      await db.query("select public.reserve_openwebninja_provider_call($1,$2) as result", [
        key,
        provider,
      ])
    ).rows[0].result;
  return { db, reserve };
}
test("the final ten free requests are usable and request 101 is denied", async () => {
  const { db, reserve } = await fixture();
  try {
    await db.exec(
      `insert into public.openwebninja_api_requests(cache_key,provider,created_at) select 'used-'||i,'zillow',now()-interval '2 days' from generate_series(1,90) i;`,
    );
    for (let i = 91; i <= 100; i++) assert.equal((await reserve("property-" + i)).allowed, true);
    assert.equal((await reserve("property-101")).allowed, false);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as total from public.openwebninja_api_requests where provider='zillow'",
        )
      ).rows[0].total,
      100,
    );
    assert.equal((await reserve("other-provider", "realestate")).allowed, true);
  } finally {
    await db.close();
  }
});
test("the 25-per-day ceiling still applies under the full monthly allowance", async () => {
  const { db, reserve } = await fixture();
  try {
    for (let i = 1; i <= 25; i++) assert.equal((await reserve("daily-" + i)).allowed, true);
    assert.equal((await reserve("daily-26")).allowed, false);
  } finally {
    await db.close();
  }
});
test("same-home retries across providers remain blocked, while cache hits use no allowance", async () => {
  const { db, reserve } = await fixture();
  try {
    assert.equal((await reserve("same-home")).allowed, true);
    assert.equal((await reserve("same-home", "realestate")).allowed, false);
    await db.exec(
      `insert into public.openwebninja_cache values ('saved-home','{"photos":15}',now()+interval '1 day');`,
    );
    assert.equal((await reserve("saved-home")).cached, true);
    assert.equal(
      (await db.query("select count(*)::int as total from public.openwebninja_api_requests"))
        .rows[0].total,
      1,
    );
  } finally {
    await db.close();
  }
});
