import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

test("a lost message response replays one committed result; mismatch, failure and account isolation are enforced", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create table shopping_accounts(user_id uuid,terms_version text);
      create table mobile_account_deletions(user_id uuid);
      create table conversation_messages(id uuid default gen_random_uuid(),conversation_id uuid,sender_id uuid,body text,created_at timestamptz default clock_timestamp());
      create function send_conversation_message(_conversation_id uuid,_body text) returns uuid language plpgsql as $$
      declare result uuid; begin
       insert into conversation_messages(conversation_id,sender_id,body) values(_conversation_id,auth.uid(),_body) returning id into result;
       if _body='simulate transaction failure' then raise exception 'Provider/domain failure'; end if;
       return result;
      end $$;
      create function start_conversation(_listing_id uuid,_body text) returns uuid language plpgsql as $$
      declare thread uuid:=gen_random_uuid();begin perform send_conversation_message(thread,_body); return thread;end $$;
      create function start_dealer_conversation(_dealer_id uuid,_record_id uuid,_body text) returns uuid language sql as $$select start_conversation(_record_id,_body)$$;`);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261113050000_mobile_message_receipts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = randomUUID(),
      b = randomUUID(),
      request = randomUUID(),
      target = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.query("insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12')", [
      a,
      b,
    ]);
    const actor = async (user) => db.query("select set_config('test.actor',$1,false)", [user]);
    const send = async (id = request, op = "reply", to = target, body = "Is it available?") =>
      (await db.query("select mobile_commit_message($1,$2,$3,$4) result", [id, op, to, body]))
        .rows[0].result;
    await actor(a);
    const first = await send(),
      retry = await send();
    assert.equal(first.replayed, false);
    assert.equal(retry.replayed, true);
    assert.equal(first.messageId, retry.messageId);
    assert.equal(
      (await db.query("select count(*)::int n from conversation_messages")).rows[0].n,
      1,
    );
    await assert.rejects(() => send(request, "reply", target, "Changed body"), /does not match/);
    await assert.rejects(() => send(request, "start", target), /does not match/);
    await actor(b);
    const second = await send();
    assert.notEqual(second.messageId, first.messageId);
    const failing = randomUUID();
    await assert.rejects(
      () => send(failing, "reply", target, "simulate transaction failure"),
      /domain failure/,
    );
    assert.equal(
      (
        await db.query("select count(*)::int n from mobile_message_receipts where request_id=$1", [
          failing,
        ])
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from conversation_messages")).rows[0].n,
      2,
    );
    for (const listing of [target, "dealerfeed-" + target]) {
      const key = randomUUID(),
        created = await send(key, "start", listing),
        again = await send(key, "start", listing);
      assert.equal(created.conversationId, again.conversationId);
      assert.equal(created.messageId, again.messageId);
    }
    await db.query("insert into mobile_account_deletions values($1)", [b]);
    await assert.rejects(() => send(), /deletion pending/);
    await actor("");
    await assert.rejects(() => send(), /Unauthorized/);
    await db.exec("set role anon");
    await assert.rejects(() => send(), /permission denied/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      () => db.query("select * from mobile_message_receipts"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("explicit message retries preserve request ids after network failures and session restoration", async () => {
  const code = ts.transpileModule(
    readFileSync(new URL("../apps/mobile/src/message-retries.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const stored = new Map(),
    calls = [];
  let failure = true;
  const storage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, v),
    removeItem: (k) => stored.delete(k),
  };
  const modules = {
    "./identity": { installIdentifier: () => "install" },
    "./client": {
      api: async (...args) => {
        calls.push(args);
        if (failure) throw Error("lost response");
        return { messageId: "one" };
      },
    },
  };
  const load = () => {
    const exports = {};
    new Function("require", "exports", "sessionStorage", "crypto", code)(
      (n) => modules[n],
      exports,
      storage,
      crypto,
    );
    return exports;
  };
  let client = load();
  const user = randomUUID(),
    path = "conversations/one/messages",
    payload = { body: "Hello" };
  await assert.rejects(() => client.sendMessageOnce(user, path, payload), /lost response/);
  client = load();
  failure = false;
  await client.sendMessageOnce(user, path, payload);
  assert.equal(calls[0][5], calls[1][5]);
  assert.equal(calls[1][4].userId, user);
  await client.sendMessageOnce(user, path, payload);
  assert.notEqual(calls[1][5], calls[2][5]);
  assert.equal(stored.size, 0);
  const before = calls.length;
  await Promise.all([
    client.sendMessageOnce(user, path, payload),
    client.sendMessageOnce(user, path, payload),
  ]);
  assert.equal(calls.length, before + 1);
  assert(!JSON.stringify(calls[0][5]).includes("Hello"));
});
