import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

test("listing receipt atomically commits category details and replays only the original owner's payload", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create table shopping_accounts(user_id uuid,terms_version text);
      create table mobile_account_deletions(user_id uuid);
      create type item_condition as enum('used_good','not_applicable');
      create table categories(id uuid default gen_random_uuid(),slug text);
      insert into categories(slug) values('general'),('pets'),('firearms');
      create table fixture_listings(id uuid primary key,owner_id uuid,title text,price integer,free_pet boolean,vehicle jsonb,home jsonb,job jsonb,service jsonb,pet jsonb);
      create table classified_listing_details(listing_id uuid primary key,item_details jsonb check(item_details->>'fault' is null));
    `);
    const args = `_title text,_description text,_category uuid,_price integer,_condition item_condition,_note text,_region text,_city text,_state text,_zip text,_fulfillment text,_length numeric,_width numeric,_height numeric,_weight numeric,_evidence text[],_media text[],_vehicle jsonb,_home jsonb,_job jsonb,_service jsonb,_pet jsonb`;
    for (const [name, free] of [
      ["create_classified_listing", false],
      ["create_free_pet_listing", true],
    ])
      await db.exec(`create function public.${name}(${args}) returns uuid language plpgsql as $$
        declare listing uuid:=gen_random_uuid(); begin
        if _price<0 then raise exception 'Domain validation'; end if;
        insert into fixture_listings values(listing,auth.uid(),_title,_price,${free},_vehicle,_home,_job,_service,_pet);
        if _title<>'Missing details' then insert into classified_listing_details values(listing,'{}'); end if;
        return listing;end $$;`);
    for (const migration of [
      "20261113050000_mobile_message_receipts.sql",
      "20261113070000_mobile_listing_receipts.sql",
    ])
      await db.exec(
        readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"),
      );
    const a = randomUUID(),
      b = randomUUID(),
      request = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.query("insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12')", [
      a,
      b,
    ]);
    await db.query("select set_config('test.actor',$1,false)", [a]);
    const input = {
      title: "Fixture bicycle",
      description: "Fixture description",
      category: "general",
      priceCents: 2500,
      condition: "used_good",
      region: "Treasure Valley",
      city: "Boise",
      state: "ID",
      fulfillmentMode: "local_pickup",
      publicMediaPaths: [`${a}/fixture.jpg`],
      evidencePaths: [`${a}/fixture.jpg`],
      itemDetails: { brand: "Fixture" },
      vehicle: { make: "Fixture" },
    };
    const post = (payload = input, id = request) =>
      db
        .query("select mobile_commit_listing($1,$2) result", [id, payload])
        .then((r) => r.rows[0].result);
    const first = await post(),
      replay = await post({ ...input, itemDetails: { brand: "Fixture" } });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.listingId, replay.listingId);
    assert.deepEqual(
      (await db.query("select item_details from classified_listing_details")).rows[0].item_details,
      { brand: "Fixture" },
    );
    assert.deepEqual((await db.query("select vehicle from fixture_listings")).rows[0].vehicle, {
      make: "Fixture",
    });
    await assert.rejects(() => post({ ...input, title: "Changed" }), /does not match/);
    for (const invalid of [
      { ...input, priceCents: -1 },
      { ...input, title: "Missing details" },
      { ...input, itemDetails: { fault: "Reject update" } },
      { ...input, category: "firearms" },
      { ...input, category: "missing" },
      { ...input, publicMediaPaths: [] },
      { ...input, evidencePaths: [`${b}/photo.jpg`] },
      { ...input, publicMediaPaths: Array(9).fill(`${a}/photo.jpg`) },
    ])
      await assert.rejects(() => post(invalid, randomUUID()));
    assert.equal((await db.query("select count(*)::int n from fixture_listings")).rows[0].n, 1);
    assert.equal(
      (await db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      1,
    );
    const pet = await post(
      { ...input, category: "pets", priceCents: 0, pet: { species: "Dog" } },
      randomUUID(),
    );
    assert.equal(
      (await db.query("select free_pet from fixture_listings where id=$1", [pet.listingId])).rows[0]
        .free_pet,
      true,
    );
    await db.query("select set_config('test.actor',$1,false)", [b]);
    await assert.rejects(() => post(), /own listing photos/);
    const other = await post({
      ...input,
      publicMediaPaths: [`${b}/other.jpg`],
      evidencePaths: [`${b}/other.jpg`],
    });
    assert.notEqual(other.listingId, first.listingId);
    await db.query("select set_config('test.actor',$1,false)", [a]);
    await db.query("insert into mobile_account_deletions values($1)", [a]);
    await assert.rejects(() => post(), /deletion pending/);
    await db.exec("delete from mobile_account_deletions;delete from shopping_accounts");
    await assert.rejects(() => post(), /current terms/);
    await db.query("select set_config('test.actor','',false)");
    await assert.rejects(() => post(), /Unauthorized/);
    await db.exec("set role anon");
    await assert.rejects(() => post(), /permission denied/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      () => db.query("select * from mobile_message_receipts"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select mobile_messaging_capabilities()"),
      /permission denied/,
    );
    await db.exec("reset role;set role service_role");
    assert.deepEqual((await db.query("select mobile_messaging_capabilities() c")).rows[0].c, {
      attachments: false,
      posting: true,
    });
  } finally {
    await db.close();
  }
});

function loadModule(path, modules, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", ...Object.keys(globals), code)(
    (name) => {
      assert(name in modules, name);
      return modules[name];
    },
    exports,
    ...Object.values(globals),
  );
  return exports;
}
test("posting recovery scopes persisted photo paths and sends the same payload and receipt after restoration", async () => {
  const owner = randomUUID(),
    stored = new Map(),
    calls = [];
  class ApiError extends Error {
    constructor(status) {
      super("fixture");
      this.status = status;
    }
  }
  const modules = {
    "./identity": { installIdentifier: () => "install" },
    "./client": {
      ApiError,
      api: async (...args) => {
        calls.push(args);
        if (calls.length === 1) throw new ApiError(503);
        return { listingId: "fixture" };
      },
    },
    "../../../src/lib/classified-listing-contracts": {
      classifiedListingSchema: { safeParse: (p) => ({ success: !!p?.title }) },
    },
    "../../../src/lib/mobile-contract": {
      mobileListingAllowed: (p) => p.categorySlug !== "firearms",
    },
  };
  const storage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, v),
    removeItem: (k) => stored.delete(k),
  };
  const load = () =>
    loadModule("../apps/mobile/src/posting-attempts.ts", modules, { sessionStorage: storage });
  let client = load();
  const attempt = {
    requestId: randomUUID(),
    payload: {
      title: "Fixture",
      publicMediaPaths: [`${owner}/a.jpg`],
      evidencePaths: [`${owner}/a.jpg`],
    },
  };
  client.storePostingAttempt(owner, attempt);
  await assert.rejects(() => client.submitPostingAttempt(owner, attempt));
  client = load();
  assert.deepEqual(client.readPostingAttempt(owner), attempt);
  assert.equal(client.readPostingAttempt(randomUUID()), null);
  await client.submitPostingAttempt(owner, client.readPostingAttempt(owner));
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0][4], { userId: owner, installId: "install" });
  assert.equal(calls[0][5], attempt.requestId);
  client.storePostingAttempt(owner, {
    ...attempt,
    payload: { ...attempt.payload, evidencePaths: [`${randomUUID()}/private.jpg`] },
  });
  assert.equal(client.readPostingAttempt(owner), null);
  client.storePostingAttempt(owner, {
    ...attempt,
    payload: { ...attempt.payload, category: "firearms" },
  });
  assert.equal(client.readPostingAttempt(owner), null);
  client.clearPostingAttempt(owner);
  assert.equal(stored.size, 0);
  assert.equal(client.postingDefinitelyRejected(new ApiError(503)), false);
  assert.equal(client.postingDefinitelyRejected(new ApiError(400)), true);
});

test("native photo uploads stop across an account switch between evidence and public uploads", async () => {
  const owner = randomUUID(),
    uploads = [];
  let actor = owner;
  const client = loadModule("../apps/mobile/src/photos.ts", {
    "./identity": { installIdentifier: () => "install" },
    "../../../src/lib/photo-thumbnail.browser": { browserPhotoThumbnail: async () => new Blob() },
    "../../../src/lib/photo-upload": {
      createPhotoUploader: (deps) => async (file, user) => {
        await deps.mode();
        await deps.source("ask-evidence", `${user}/photo.jpg`, file);
        await deps.source("listing-media", `${user}/photo.jpg`, file);
      },
    },
    "./client": {
      api: async (path, method, payload, signal, expected) => {
        assert.equal(expected.userId, owner);
        return { mode: "supabase" };
      },
      auth: {
        auth: { getSession: async () => ({ data: { session: { user: { id: actor } } } }) },
        storage: {
          from: (bucket) => ({
            upload: async () => {
              uploads.push(bucket);
              actor = randomUUID();
              return { error: null };
            },
          }),
        },
      },
    },
  });
  await assert.rejects(
    () => client.uploadPhoto(new File(["fixture"], "a.jpg"), owner),
    /account changed/,
  );
  assert.deepEqual(uploads, ["ask-evidence"]);
});
