import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("native application and notification commit once; replays preserve later employer review, enforce private file ownership and leave failed receipts rollback-safe", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));alter table storage.objects enable row level security;create function storage.foldername(text)returns text[] language sql as $$select string_to_array($1,'/')$$;
 create table categories(id uuid primary key,slug text);create table products(id uuid primary key,category_id uuid,status text,name text,description text);create table asks(id uuid primary key,seller_id uuid,product_id uuid,status text,approved_at timestamptz,expires_at timestamptz,is_demo boolean default false);
 create table classified_listing_details(listing_id uuid,job_application_method text);create table shopping_accounts(user_id uuid,terms_version text);create table mobile_account_deletions(user_id uuid);
 create table conversations(id uuid,buyer_id uuid,seller_id uuid);create table conversation_participants(conversation_id uuid,user_id uuid,blocked_at timestamptz);
 create table notifications(id uuid default gen_random_uuid(),user_id uuid,kind text,title text,body text,entity_type text,entity_id uuid,destination_url text);`);
    for (const name of [
      "20260920020000_add_job_applications.sql",
      "20261113050000_mobile_message_receipts.sql",
      "20261113090000_mobile_job_application_receipts.sql",
    ])
      await db.exec(
        readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"),
      );
    const a = randomUUID(),
      b = randomUUID(),
      seller = randomUUID(),
      category = randomUUID(),
      product = randomUUID(),
      listing = randomUUID(),
      first = randomUUID(),
      path = `${a}/${listing}/${first}.pdf`;
    await db.query("insert into auth.users values($1),($2),($3)", [a, b, seller]);
    await db.query("insert into categories values($1,'jobs')", [category]);
    await db.query(
      "insert into products values($1,$2,'published','Customer support specialist','Help local customers')",
      [product, category],
    );
    await db.query(
      "insert into asks values($1,$2,$3,'active',now(),now()+interval '30 days',false)",
      [listing, seller, product],
    );
    await db.query("insert into classified_listing_details values($1,'gemlist')", [listing]);
    await db.query(
      "insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12'),($3,'2026-11-12')",
      [a, b, seller],
    );
    const as = async (actor) => db.query("select set_config('test.actor',$1,false)", [actor]);
    const commit = async (key, resume = path, cover = "Private cover letter") =>
      (
        await db.query("select mobile_commit_job_application($1,$2,$3,$4) result", [
          key,
          listing,
          resume,
          cover,
        ])
      ).rows[0].result;
    await as(a);
    await assert.rejects(commit(first), /Resume upload is incomplete/);
    assert.equal(
      (await db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      0,
      "Failed upload must not poison the request key",
    );
    await db.query("insert into storage.objects values('job-application-resumes',$1,$2)", [
      path,
      { mimetype: "application/pdf", size: 1200 },
    ]);
    const sent = await commit(first);
    assert.equal(sent.replayed, false);
    const id = sent.applicationId;
    await as(seller);
    await db.query("select update_job_application_status($1,'reviewed')", [id]);
    await as(a);
    const repeat = await commit(first);
    assert.equal(repeat.replayed, true);
    assert.equal(repeat.applicationId, id);
    assert.equal(
      (await db.query("select status from job_applications where id=$1", [id])).rows[0].status,
      "reviewed",
    );
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 1);
    await assert.rejects(commit(first, path, "Changed letter"), /retry does not match/);
    await as(b);
    await assert.rejects(commit(first, path), /Resume unavailable/);
    assert.equal((await db.query("select count(*)::int n from job_applications")).rows[0].n, 1);
    await as(a);
    const bad = randomUUID(),
      badPath = `${a}/${listing}/${bad}.pdf`;
    await db.query("insert into storage.objects values('job-application-resumes',$1,$2)", [
      badPath,
      { size: 1200 },
    ]);
    await assert.rejects(commit(bad, badPath), /Resume upload is incomplete/);
    await db.query("update storage.objects set metadata=$2 where name=$1", [
      badPath,
      { mimetype: "text/html", size: 1200 },
    ]);
    await assert.rejects(commit(bad, badPath), /Resume upload is incomplete/);
    await db.query("update storage.objects set metadata=$2 where name=$1", [
      badPath,
      { mimetype: "application/pdf", size: 1200 },
    ]);
    await db.query("update products set name='Rifle ammunition sales' where id=$1", [product]);
    await assert.rejects(commit(bad, badPath), /Application unavailable/);
    await db.query("update products set name='Customer support specialist' where id=$1", [product]);
    await db.query("update asks set expires_at=now()-interval '1 day' where id=$1", [listing]);
    await assert.rejects(commit(bad, badPath), /Application unavailable/);
    await db.query("update asks set expires_at=now()+interval '30 days' where id=$1", [listing]);
    const conversation = randomUUID();
    await db.query("insert into conversations values($1,$2,$3)", [conversation, a, seller]);
    await db.query("insert into conversation_participants values($1,$2,now())", [
      conversation,
      seller,
    ]);
    await assert.rejects(commit(bad, badPath), /Application unavailable/);
    await db.query("delete from conversation_participants");
    await db.query(
      "update classified_listing_details set job_application_method='external' where listing_id=$1",
      [listing],
    );
    await assert.rejects(commit(bad, badPath), /external|own site/);
    await db.query(
      "update classified_listing_details set job_application_method='gemlist' where listing_id=$1",
      [listing],
    );
    await db.query("insert into mobile_account_deletions values($1)", [a]);
    await assert.rejects(commit(bad, badPath), /Account deletion pending/);
    await db.query("delete from mobile_account_deletions");
    await db.query("update shopping_accounts set terms_version=null where user_id=$1", [a]);
    await assert.rejects(commit(bad, badPath), /Accept current terms/);
    await db.query("update shopping_accounts set terms_version='2026-11-12' where user_id=$1", [a]);
    const update = await commit(bad, badPath, "Updated private cover letter");
    assert.equal(update.applicationId, id);
    assert.equal(update.replayed, false);
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 2);
    await commit(bad, badPath, "Updated private cover letter");
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 2);
    const receipts = (await db.query("select result from mobile_message_receipts")).rows;
    assert(!JSON.stringify(receipts).includes("Private cover letter"));
    assert(!JSON.stringify(receipts).includes(".pdf"));
    await db.exec("set role anon");
    await assert.rejects(commit(randomUUID()), /permission denied/);
    await db.exec("reset role");
    const caps = (await db.query("select mobile_messaging_capabilities() caps")).rows[0].caps;
    assert.equal(caps.applications, true);
    assert.equal(caps.attachments, false);
    assert.equal(caps.posting, false);
    assert.equal(caps.savedSearches, false);
  } finally {
    await db.close();
  }
});
