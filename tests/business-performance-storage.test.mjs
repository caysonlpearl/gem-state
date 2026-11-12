import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("business attribution and sales assumptions remain private, durable, and bounded", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create table public.analytics_events(id uuid,name text,occurred_at timestamptz,is_demo boolean);`);
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/20261112050000_business_performance.sql", import.meta.url),
        "utf8",
      ),
    );
    for (const table of [
      "business_performance_entities",
      "business_listing_attribution",
      "business_sales_assumptions",
      "business_tracking_release",
    ]) {
      assert.equal(
        (await db.query("select relrowsecurity from pg_class where relname=$1", [table])).rows[0]
          .relrowsecurity,
        true,
      );
      for (const role of ["anon", "authenticated"])
        assert.equal(
          (
            await db.query("select has_table_privilege($1,$2,'select') as allowed", [
              role,
              "public." + table,
            ])
          ).rows[0].allowed,
          false,
        );
      assert.equal(
        (
          await db.query("select has_table_privilege('service_role',$1,'insert') as allowed", [
            "public." + table,
          ])
        ).rows[0].allowed,
        true,
      );
    }
    await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into business_performance_entities values('dealer:real','dealer:real','{"name":"Real Dealer"}',now());
   insert into business_listing_attribution(listing_id,business_key,title,source)values('expired-car','dealer:real','Sold inventory record','Authorized feed');`);
    assert.equal(
      (await db.query("select count(*)::int as n from business_sales_assumptions")).rows[0].n,
      0,
    );
    for (const rate of [-1, 101])
      await assert.rejects(
        db.query(
          "insert into business_sales_assumptions(business_key,conversion_percent,updated_by) values('dealer:real',$1,'00000000-0000-4000-8000-000000000001')",
          [rate],
        ),
      );
    await db.query(
      "insert into business_sales_assumptions(business_key,conversion_percent,updated_by) values('dealer:real',2,'00000000-0000-4000-8000-000000000001')",
    );
    assert.equal(
      (
        await db.query(
          "select title from business_listing_attribution where listing_id='expired-car'",
        )
      ).rows[0].title,
      "Sold inventory record",
    );
  } finally {
    await db.close();
  }
});
