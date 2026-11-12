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
  await db.exec(`create table public.saved_partner_homes(listing_id text check(listing_id ~ '^(mashvisor-[0-9]{1,15}|openwebninja-[0-9]{1,20})$'));
    create table public.listing_view_counts(listing_id text check(listing_id ~ '^(openwebninja-[0-9]{1,20}|avantlink-[0-9]{1,20})$'));`);
  await db.exec(migration);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261112020000_regional_redfin_home_budget.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261112030000_home_backup_account_budget.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261112040000_fill_homes_preserve_weekly_updates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const reserve = async (key, provider = "zillow") =>
    (
      await db.query("select public.reserve_openwebninja_provider_call($1,$2) as result", [
        key,
        provider,
      ])
    ).rows[0].result;
  return { db, reserve };
}

test("backup budgets do not erase primary usage or exceed 100 per account and provider", async () => {
  const { db, reserve } = await fixture();
  try {
    await db.exec(`insert into public.openwebninja_api_requests(cache_key,provider,created_at)
      select 'old-'||i,'zillow',now()-interval '2 days' from generate_series(1,100) i;`);
    assert.equal((await reserve("primary-over")).allowed, false);
    const backup = async (key) =>
      (
        await db.query(
          "select public.reserve_openwebninja_account_call($1,'zillow','backup') as result",
          [key],
        )
      ).rows[0].result;
    assert.equal((await backup("backup-first")).allowed, true);
    await db.exec(`insert into public.openwebninja_api_requests(cache_key,provider,account,created_at)
      select 'backup-old-'||i,'zillow','backup',now()-interval '2 days' from generate_series(1,99) i;`);
    assert.equal((await backup("backup-over")).allowed, false);
    assert.equal((await reserve("different-provider", "realestate")).allowed, true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.openwebninja_api_requests where account='primary' and provider='zillow'",
        )
      ).rows[0].n,
      100,
    );
  } finally {
    await db.close();
  }
});

test("combined weekly reserve is atomic, shared once, and still usable for searches", async () => {
  const { db } = await fixture();
  try {
    await db.exec(`insert into public.openwebninja_api_requests(cache_key,provider,account)
   select 'primary-'||i,'zillow','primary' from generate_series(1,100) i;
   insert into public.openwebninja_api_requests(cache_key,provider,account)
   select 'backup-'||i,'zillow','backup' from generate_series(1,85) i;`);
    const detail = async (key) =>
      (
        await db.query(
          "select public.reserve_openwebninja_home_call($1,'zillow','backup',array['primary','backup'],12) as result",
          [key],
        )
      ).rows[0].result;
    for (let i = 0; i < 3; i++) assert.equal((await detail("detail-" + i)).allowed, true);
    assert.equal((await detail("would-spend-weekly-credit")).allowed, false);
    assert.equal(
      (await db.query("select count(*)::int as n from public.openwebninja_api_requests")).rows[0].n,
      188,
    );
    assert.equal(
      (
        await db.query(
          "select public.reserve_openwebninja_account_call('weekly-search','zillow','backup') as result",
        )
      ).rows[0].result.allowed,
      true,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'public.reserve_openwebninja_home_call(text,text,text,text[],integer)','execute') as allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    await assert.rejects(
      db.query(
        "select public.reserve_openwebninja_home_call('bad','zillow','backup',array['backup','backup'],12)",
      ),
    );
  } finally {
    await db.close();
  }
});

test("backup shares cache hits and retry locks while using its full monthly allowance", async () => {
  const { db, reserve } = await fixture();
  try {
    assert.equal((await reserve("same-home")).allowed, true);
    const backup = async (key) =>
      (
        await db.query(
          "select public.reserve_openwebninja_account_call($1,'zillow','backup') as result",
          [key],
        )
      ).rows[0].result;
    assert.equal((await backup("same-home")).allowed, false);
    for (let i = 0; i < 100; i++) assert.equal((await backup("backup-daily-" + i)).allowed, true);
    assert.equal((await backup("backup-monthly-over")).allowed, false);
    assert.equal((await reserve("primary-still-open")).allowed, true);
    await db.exec(
      `insert into public.openwebninja_cache values('saved-home','{"complete":true}',now()+interval '1 day');`,
    );
    assert.equal((await backup("saved-home")).cached, true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.openwebninja_api_requests where account='backup'",
        )
      ).rows[0].n,
      100,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'public.reserve_openwebninja_account_call(text,text,text)','execute') as allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    await assert.rejects(
      db.query("select public.reserve_openwebninja_account_call('bad','zillow','untracked')"),
    );
  } finally {
    await db.close();
  }
});
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
test("all 100 monthly requests may be used on the same day", async () => {
  const { db, reserve } = await fixture();
  try {
    for (let i = 1; i <= 100; i++) assert.equal((await reserve("daily-" + i)).allowed, true);
    assert.equal((await reserve("daily-101")).allowed, false);
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

test("Redfin retains an independent 100-request monthly budget", async () => {
  const { db, reserve } = await fixture();
  try {
    await db.exec(
      `insert into public.openwebninja_api_requests(cache_key,provider,created_at) select 'redfin-'||i,'redfin',now()-interval '2 days' from generate_series(1,100) i;`,
    );
    assert.equal((await reserve("redfin-extra", "redfin")).allowed, false);
    assert.equal((await reserve("zillow-still-free", "zillow")).allowed, true);
  } finally {
    await db.close();
  }
});
test("Redfin saved-home and view-count constraints preserve other provider IDs", async () => {
  const { db } = await fixture();
  try {
    await db.query("insert into public.saved_partner_homes values ($1)", [
      "openwebninja-redfin-123",
    ]);
    await db.query("insert into public.listing_view_counts values ($1)", [
      "openwebninja-redfin-123",
    ]);
    await db.query("insert into public.listing_view_counts values ($1)", ["avantlink-123"]);
    await assert.rejects(
      db.query("insert into public.saved_partner_homes values ($1)", ["openwebninja-redfin-bad"]),
    );
  } finally {
    await db.close();
  }
});
