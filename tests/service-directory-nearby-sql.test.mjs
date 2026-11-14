import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("nearby SQL honors all three text modes before counting/paging and preserves geographic, visibility and trade filters", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.service_directory(id text primary key,name text,trade text,trades text[],enrichment jsonb,hidden boolean not null default false,state text,latitude double precision,longitude double precision,claimed_at timestamptz,priority integer default 0,source_refreshed_at timestamptz);
      insert into public.service_directory(id,name,trade,trades,enrichment,state,latitude,longitude) values
       ('name','Needle Works','Plumbers',array['Plumbers'],'{}','ID',43.6,-116.2),
       ('trade','Trade Works','Needle Specialists',array['Plumbers'],'{}','ID',43.6,-116.2),
       ('summary','Summary Works','Plumbers',array['Plumbers'],'{"summary":"Trusted NEEDLE repair"}','ID',43.6,-116.2),
       ('null','Other Works','Plumbers',array['Plumbers'],null,'ID',43.6,-116.2),
       ('outside','Needle Far','Plumbers',array['Plumbers'],'{}','ID',45.6,-116.2),
       ('state','Needle Oregon','Plumbers',array['Plumbers'],'{}','OR',43.6,-116.2),
       ('hidden','Needle Hidden','Plumbers',array['Plumbers'],'{}','ID',43.6,-116.2),
       ('othertrade','Needle Electric','Electricians',array['Electricians'],'{}','ID',43.6,-116.2);
      update public.service_directory set hidden=true where id='hidden';`);
    const old = migration("20261016110000_service_directory_phone_match.sql");
    await db.exec(old.slice(old.indexOf("create or replace function")));
    await db.exec(migration("20261114130000_service_directory_nearby_search_modes.sql"));
    const nearby = async (mode, offset = 0, limit = 24, q = "needle") =>
      (
        await db.query(
          "select * from public.service_directory_nearby_search(43.6,-116.2,25,'Plumbers',$1,$2,$3,$4)",
          [q, offset, limit, mode],
        )
      ).rows;
    assert.deepEqual(await nearby(false), [{ id: "name", total: 1 }]);
    assert.deepEqual(await nearby(null), [
      { id: "name", total: 2 },
      { id: "trade", total: 2 },
    ]);
    assert.deepEqual(await nearby(true), [
      { id: "name", total: 3 },
      { id: "summary", total: 3 },
      { id: "trade", total: 3 },
    ]);
    assert.deepEqual(await nearby(true, 1, 1), [{ id: "summary", total: 3 }]);
    assert.deepEqual(await nearby(false, 0, 24, "absent"), []);
    const noText = await nearby(false, 0, 24, null);
    assert.equal(noText.length, 4);
    assert(noText.every((r) => r.total === 4));
    const legacy = (
      await db.query(
        "select * from public.service_directory_nearby(43.6,-116.2,25,'Plumbers','needle',0,24)",
      )
    ).rows;
    assert.deepEqual(legacy, await nearby(null));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(nearby(true), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.deepEqual(await nearby(false), [{ id: "name", total: 1 }]);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
