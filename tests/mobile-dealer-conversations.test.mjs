import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("native dealership threads stay separate from website chats and commit one owned message, notification and retry receipt", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table shopping_accounts(user_id uuid,terms_version text);create table mobile_account_deletions(user_id uuid);
 create table dealer_profiles(id uuid primary key,owner_user_id uuid,display_name text,description text,status text,agreements_accepted_at timestamptz);
 create table dealer_inventory_sources(id uuid primary key,status text);create table dealer_feed_publications(source_id uuid,dealer_id uuid,inbox_enabled boolean,enabled boolean,revoked_at timestamptz);
 create table account_contact_preferences(user_id uuid,allow_internal_messages boolean);
 create table products(id uuid primary key,name text);create table product_variants(id uuid primary key,product_id uuid);create table asks(id uuid primary key,variant_id uuid);
 create table conversations(id uuid primary key default gen_random_uuid(),listing_id uuid,dealer_id uuid,dealer_inventory_record_id uuid,dealer_context_title text,buyer_id uuid,seller_id uuid,last_message_at timestamptz,closed_at timestamptz);
 create table conversation_participants(conversation_id uuid,user_id uuid,role text,blocked_at timestamptz,last_read_at timestamptz,primary key(conversation_id,user_id));
 create table conversation_messages(id uuid default gen_random_uuid(),conversation_id uuid,sender_id uuid,body text,created_at timestamptz default clock_timestamp());
 create table rate_limit_events(user_id uuid,action text,created_at timestamptz default now());
 create table notifications(id uuid default gen_random_uuid(),user_id uuid,kind text,title text,body text,order_id uuid,entity_type text,entity_id uuid,destination_url text);`);
    const hard = readFileSync(
      new URL(
        "../supabase/migrations/20260920210000_harden_conversation_blocks_reports.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      hard.slice(
        hard.indexOf("CREATE OR REPLACE FUNCTION public.send_conversation_message("),
        hard.indexOf(
          "CREATE OR REPLACE FUNCTION public.send_conversation_message_with_attachment(",
        ),
      ),
    );
    for (const name of [
      "20261113050000_mobile_message_receipts.sql",
      "20261113100000_mobile_dealer_conversations.sql",
    ])
      await db.exec(
        readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"),
      );
    const buyer = randomUUID(),
      seller = randomUUID(),
      other = randomUUID(),
      dealer = randomUUID(),
      website = randomUUID(),
      request = randomUUID();
    await db.query("insert into auth.users values($1),($2),($3)", [buyer, seller, other]);
    for (const id of [buyer, seller, other])
      await db.query("insert into shopping_accounts values($1,'2026-11-12')", [id]);
    await db.query(
      "insert into dealer_profiles values($1,$2,'Fixture Motors','Local cars and trucks','ready',now())",
      [dealer, seller],
    );
    await db.query(
      "insert into conversations(id,dealer_id,buyer_id,seller_id,dealer_context_title)values($1,$2,$3,$4,'Website inquiry')",
      [website, dealer, buyer, seller],
    );
    await db.query(
      "insert into conversation_participants values($1,$2,'buyer',null,null),($1,$3,'seller',null,null)",
      [website, buyer, seller],
    );
    await db.query(
      "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'PRIVATE website-only history')",
      [website, buyer],
    );
    const as = async (uid) => db.query("select set_config('test.actor',$1,false)", [uid]);
    const start = async (key = request, id = dealer, body = "A private dealership inquiry") =>
      (await db.query("select mobile_start_dealer_conversation($1,$2,$3) result", [key, id, body]))
        .rows[0].result;
    const count = async (table) =>
      (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
    await as(buyer);
    const first = await start(),
      again = await start();
    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal(first.messageId, again.messageId);
    assert.notEqual(first.conversationId, website);
    assert.equal(await count("mobile_dealer_conversations"), 1);
    assert.equal(await count("notifications"), 1);
    assert.equal(await count("conversation_messages"), 2);
    const mapped = (await db.query("select * from mobile_dealer_conversations")).rows[0];
    assert.equal(mapped.conversation_id, first.conversationId);
    assert.equal(mapped.buyer_id, buyer);
    assert.equal(mapped.seller_id, seller);
    assert.equal(
      (await db.query("select dealer_id from conversations where id=$1", [first.conversationId]))
        .rows[0].dealer_id,
      null,
    );
    assert(
      !JSON.stringify((await db.query("select result from mobile_message_receipts")).rows).includes(
        "private dealership inquiry",
      ),
    );
    await assert.rejects(start(request, dealer, "Changed message"), /retry does not match/);
    const second = await start(randomUUID());
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(await count("notifications"), 2);
    await as(seller);
    const reply = (
      await db.query("select mobile_commit_message($1,'reply',$2,'Dealership reply') result", [
        randomUUID(),
        first.conversationId,
      ])
    ).rows[0].result;
    assert.equal(reply.conversationId, first.conversationId);
    await as(buyer);
    await db.query(
      "update conversation_participants set blocked_at=now() where conversation_id=$1 and user_id=$2",
      [website, seller],
    );
    const blocked = randomUUID();
    await assert.rejects(start(blocked), /Messaging is unavailable/);
    assert.equal(
      (
        await db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
          blocked,
        ])
      ).rows[0].n,
      0,
    );
    assert.equal((await start()).replayed, true);
    await db.query("update conversation_participants set blocked_at=null");
    await db.query("insert into account_contact_preferences values($1,false)", [seller]);
    await assert.rejects(start(randomUUID()), /messaging unavailable/);
    await db.query("delete from account_contact_preferences");
    await db.query("update dealer_profiles set display_name='Rifle ammunition store'");
    await assert.rejects(start(randomUUID()), /messaging unavailable/);
    await db.query(
      "update dealer_profiles set display_name='Fixture Motors',agreements_accepted_at=null",
    );
    await assert.rejects(start(randomUUID()), /messaging unavailable/);
    const source = randomUUID();
    await db.query("insert into dealer_inventory_sources values($1,'error')", [source]);
    await db.query("insert into dealer_feed_publications values($1,$2,true,true,null)", [
      source,
      dealer,
    ]);
    assert.equal((await start(randomUUID())).conversationId, first.conversationId);
    await db.query("update dealer_profiles set status='paused'");
    await assert.rejects(start(randomUUID()), /messaging unavailable/);
    await db.query("update dealer_profiles set status='ready'");
    await db.query("update shopping_accounts set terms_version='old' where user_id=$1", [buyer]);
    await assert.rejects(start(randomUUID()), /Accept current terms/);
    await db.query("update shopping_accounts set terms_version='2026-11-12'");
    await db.query("insert into mobile_account_deletions values($1)", [buyer]);
    await assert.rejects(start(randomUUID()), /deletion pending/);
    await db.query("delete from mobile_account_deletions");
    await db.exec(
      `create function fail_notification() returns trigger language plpgsql as $$begin if new.body like '%simulate write rollback%' then raise exception 'Simulated notification failure';end if;return new;end$$;create trigger fail_notice before insert on notifications for each row execute function fail_notification();`,
    );
    await as(other);
    const failed = randomUUID(),
      before = await count("conversations");
    await assert.rejects(
      start(failed, dealer, "simulate write rollback"),
      /Simulated notification failure/,
    );
    assert.equal(await count("conversations"), before);
    assert.equal(await count("mobile_dealer_conversations"), 1);
    assert.equal(
      (
        await db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
          failed,
        ])
      ).rows[0].n,
      0,
    );
    const own = await start(request);
    assert.notEqual(own.conversationId, first.conversationId);
    assert.equal(
      (
        await db.query(
          "select buyer_id from mobile_dealer_conversations where conversation_id=$1",
          [own.conversationId],
        )
      ).rows[0].buyer_id,
      other,
    );
    await as("");
    await assert.rejects(start(randomUUID()), /Unauthorized/);
    await db.exec("set role anon");
    await assert.rejects(start(randomUUID()), /permission denied/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      db.query("select * from mobile_dealer_conversations"),
      /permission denied/,
    );
    await assert.rejects(db.query("select mobile_messaging_capabilities()"), /permission denied/);
    await db.exec("reset role");
    const cap = (await db.query("select mobile_messaging_capabilities() value")).rows[0].value;
    assert.equal(cap.dealerMessages, true);
    assert.equal(cap.applications, false);
    assert.equal(cap.attachments, false);
  } finally {
    await db.close();
  }
});
