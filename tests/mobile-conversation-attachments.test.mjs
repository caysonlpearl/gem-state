import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

test("atomic attachment receipts verify the stored object and replay one message/notification", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create table shopping_accounts(user_id uuid,terms_version text);
      create table mobile_account_deletions(user_id uuid);
      create table storage.objects(bucket_id text,name text,metadata jsonb);
      create table conversations(id uuid primary key,buyer_id uuid,seller_id uuid,last_message_at timestamptz,closed_at timestamptz);
      create table conversation_participants(conversation_id uuid,user_id uuid,blocked_at timestamptz);
      create table conversation_messages(id uuid default gen_random_uuid(),conversation_id uuid,sender_id uuid,body text,attachment_path text,attachment_content_type text,attachment_size integer,created_at timestamptz default clock_timestamp());
      create table rate_limit_events(user_id uuid,action text);
      create table notifications(user_id uuid,kind text,title text,body text,order_id uuid,entity_type text,entity_id uuid,destination_url text);
    `);
    const hardened = readFileSync(
      new URL(
        "../supabase/migrations/20260920210000_harden_conversation_blocks_reports.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      hardened.slice(
        hardened.indexOf(
          "CREATE OR REPLACE FUNCTION public.send_conversation_message_with_attachment(",
        ),
        hardened.indexOf('DROP POLICY IF EXISTS "Members report conversations"'),
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261113050000_mobile_message_receipts.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261113060000_mobile_conversation_attachments.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = randomUUID(),
      b = randomUUID(),
      outsider = randomUUID(),
      conversation = randomUUID(),
      other = randomUUID();
    await db.query("insert into auth.users values($1),($2),($3)", [a, b, outsider]);
    await db.query(
      "insert into shopping_accounts values($1,'2026-11-12'),($2,'2026-11-12'),($3,'2026-11-12')",
      [a, b, outsider],
    );
    await db.query("insert into conversations(id,buyer_id,seller_id) values($1,$2,$3)", [
      conversation,
      a,
      b,
    ]);
    await db.query(
      "insert into conversation_participants(conversation_id,user_id) values($1,$2),($1,$3)",
      [conversation, a, b],
    );
    await db.query("select set_config('test.actor',$1,false)", [a]);
    const path = `${a}/${conversation}/${randomUUID()}.pdf`,
      request = randomUUID();
    const send = (
      req = request,
      to = conversation,
      object = path,
      type = "application/pdf",
      size = 42,
      body = "Fixture attachment",
    ) =>
      db
        .query("select mobile_commit_attachment($1,$2,$3,$4,$5,$6) result", [
          req,
          to,
          body,
          object,
          type,
          size,
        ])
        .then((r) => r.rows[0].result);
    await assert.rejects(() => send(), /upload is incomplete/);
    assert.equal(
      (await db.query("select count(*)::int n from mobile_message_receipts")).rows[0].n,
      0,
    );
    await db.query("insert into storage.objects values('conversation-attachments',$1,$2)", [
      path,
      { size: 42, mimetype: "application/pdf" },
    ]);
    const first = await send(),
      retry = await send();
    assert.equal(first.replayed, false);
    assert.equal(retry.replayed, true);
    assert.equal(first.messageId, retry.messageId);
    assert.equal(
      (await db.query("select count(*)::int n from conversation_messages")).rows[0].n,
      1,
    );
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 1);
    await assert.rejects(
      () => send(request, conversation, path, "application/pdf", 42, "Edited text"),
      /does not match/,
    );
    await assert.rejects(
      () => send(randomUUID(), conversation, path, "application/pdf", 43),
      /metadata/,
    );
    await assert.rejects(() => send(randomUUID(), conversation, path, "image/png", 42), /metadata/);
    await assert.rejects(() => send(randomUUID(), other, path), /Invalid attachment/);
    await assert.rejects(
      () => send(randomUUID(), conversation, `${b}/${conversation}/${randomUUID()}.pdf`),
      /Invalid attachment/,
    );
    await assert.rejects(
      () => send(randomUUID(), conversation, path, "application/pdf", 0),
      /Invalid attachment/,
    );
    await db.query("update conversation_participants set blocked_at=now() where user_id=$1", [b]);
    await assert.rejects(() => send(randomUUID()), /Messaging is unavailable/);
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 1);
    await db.query("select set_config('test.actor',$1,false)", [outsider]);
    const outsiderPath = `${outsider}/${conversation}/${randomUUID()}.pdf`;
    await db.query("insert into storage.objects values('conversation-attachments',$1,$2)", [
      outsiderPath,
      { size: 42, mimetype: "application/pdf" },
    ]);
    await assert.rejects(() => send(randomUUID(), conversation, outsiderPath), /not a participant/);
    await db.query("select set_config('test.actor',$1,false)", [a]);
    await db.query("insert into mobile_account_deletions values($1)", [a]);
    await assert.rejects(() => send(), /deletion pending/);
    await db.query("delete from mobile_account_deletions");
    await db.query("delete from shopping_accounts where user_id=$1", [a]);
    await assert.rejects(() => send(), /current terms/);
    await db.query("select set_config('test.actor','',false)");
    await assert.rejects(() => send(), /Unauthorized/);
    await db.exec("set role anon");
    await assert.rejects(() => send(), /permission denied/);
    await assert.rejects(
      () => db.query("select mobile_messaging_capabilities()"),
      /permission denied/,
    );
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
    assert.equal(
      (await db.query("select mobile_messaging_capabilities() c")).rows[0].c.attachments,
      true,
    );
  } finally {
    await db.close();
  }
});

test("missing attachment migration and outages keep the capability off with bounded shared reads", async () => {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/mobile-messaging.server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  let calls = 0,
    now = 0,
    mode = "missing";
  const exports = {};
  new Function("require", "exports", "Date", code)(
    () => ({
      supabaseAdmin: {
        rpc: async () => {
          calls++;
          if (mode === "outage") throw Error("unavailable");
          return mode === "missing"
            ? { error: { code: "PGRST202" }, data: null }
            : { error: null, data: { attachments: true, posting: mode === "posting" } };
        },
      },
    }),
    exports,
    { now: () => now },
  );
  assert.deepEqual(
    await Promise.all([exports.mobileAttachmentsReady(), exports.mobileAttachmentsReady()]),
    [false, false],
  );
  assert.equal(calls, 1);
  mode = "ready";
  assert.equal(await exports.mobileAttachmentsReady(), false);
  assert.equal(calls, 1);
  now = 30001;
  assert.equal(await exports.mobileAttachmentsReady(), true);
  assert.equal(await exports.mobilePostingReady(), false);
  assert.equal(calls, 2);
  now = 60002;
  mode = "outage";
  assert.equal(await exports.mobileAttachmentsReady(), false);
  assert.equal(calls, 3);
  assert.equal(await exports.mobilePostingReady(), false);
  now = 90003;
  mode = "posting";
  assert.deepEqual(
    await Promise.all([exports.mobileAttachmentsReady(), exports.mobilePostingReady()]),
    [true, true],
  );
  assert.equal(calls, 4);
});

test("uncertain uploads are verified before reupload; private receipts survive restoration and account changes fail closed", async () => {
  const code = ts.transpileModule(
    readFileSync(
      new URL("../apps/mobile/src/conversation-attachments.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const user = randomUUID(),
    thread = randomUUID(),
    stored = new Map(),
    uploads = [],
    commits = [],
    prepares = [];
  let actor = user,
    uploadFailure = true,
    objectExists = true;
  class ApiError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  const storage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, v),
    removeItem: (k) => stored.delete(k),
  };
  const modules = {
    "./identity": { installIdentifier: () => "install" },
    "./client": {
      ApiError,
      api: async (path, method, payload, signal, expected) => {
        assert.equal(expected.userId, user);
        if (actor !== user) throw Error("account changed");
        const prepared = {
          path: `${user}/${thread}/${randomUUID()}.pdf`,
          token: "not-for-storage",
          contentType: payload.contentType,
          size: payload.size,
        };
        prepares.push(prepared);
        return prepared;
      },
      auth: {
        auth: { getSession: async () => ({ data: { session: { user: { id: actor } } } }) },
        storage: {
          from: () => ({
            uploadToSignedUrl: async (path) => {
              uploads.push(path);
              return { error: uploadFailure ? { message: "upload response lost" } : null };
            },
          }),
        },
      },
    },
    "./message-retries": {
      sendMessageOnce: async (owner, path, payload) => {
        assert.equal(owner, user);
        commits.push(payload);
        if (!objectExists) throw new ApiError("attachment_upload_missing");
        return { messageId: "fixture" };
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
  const file = new File(["%PDF fixture"], "private-filename.pdf", { type: "application/pdf" });
  let client = load();
  await assert.rejects(
    () => client.sendConversationAttachmentOnce(user, thread, "Private reply", file),
    /upload response lost/,
  );
  assert.equal(prepares.length, 1);
  assert.equal(uploads.length, 1);
  assert.equal(commits.length, 0);
  assert(!JSON.stringify([...stored.values()]).includes("Private reply"));
  assert(!JSON.stringify([...stored.values()]).includes("not-for-storage"));
  assert(!JSON.stringify([...stored.values()]).includes("private-filename"));
  client = load();
  await client.sendConversationAttachmentOnce(user, thread, "Private reply", file);
  assert.equal(prepares.length, 1);
  assert.equal(uploads.length, 1);
  assert.equal(commits[0].attachmentPath, uploads[0]);
  assert.equal(stored.size, 0);
  // A missing object rolls back finalization, then an explicit retry may upload anew.
  objectExists = false;
  await assert.rejects(
    () => client.sendConversationAttachmentOnce(user, thread, "New reply", file),
    /upload response lost/,
  );
  uploadFailure = false;
  modules["./client"].auth.storage.from = () => ({
    uploadToSignedUrl: async (path) => {
      uploads.push(path);
      objectExists = true;
      return { error: null };
    },
  });
  await client.sendConversationAttachmentOnce(user, thread, "New reply", file);
  assert.equal(prepares.length, 3);
  // A switch after preparation cannot publish or upload using the new account.
  modules["./client"].api = async () => {
    actor = randomUUID();
    return {
      path: `${user}/${thread}/${randomUUID()}.pdf`,
      token: "private",
      contentType: file.type,
      size: file.size,
    };
  };
  const before = uploads.length;
  await assert.rejects(
    () => client.sendConversationAttachmentOnce(user, thread, "Changed account", file),
    /account changed/i,
  );
  assert.equal(uploads.length, before);
});

test("attachment preparation checks both participants' blocks before issuing an upload token", async () => {
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/conversation.functions.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const actor = randomUUID(),
    thread = randomUUID();
  let participant = true,
    blocked = true,
    tokens = 0,
    adminReads = 0;
  const modules = {
    "@tanstack/react-start": {
      createServerFn: () => {
        let validate;
        const b = {
          middleware: () => b,
          validator: (v) => ((validate = v), b),
          handler:
            (handler) =>
            async ({ data, context }) =>
              handler({ data: validate ? validate(data) : data, context }),
        };
        return b;
      },
    },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "./mobile-write": { mobileWriteId: (v) => v },
    "./email-notifications.server": { emailMarketplaceMessage: async () => {} },
    "@/integrations/supabase/client.server": {
      supabaseAdmin: {
        from: () => {
          adminReads++;
          const q = {
            select: () => q,
            eq: () => q,
            not: async () => ({ data: blocked ? [{ user_id: randomUUID() }] : [], error: null }),
          };
          return q;
        },
        storage: {
          from: () => ({
            createSignedUploadUrl: async () => {
              tokens++;
              return { data: { token: "private-token" }, error: null };
            },
          }),
        },
      },
    },
  };
  const exports = {};
  new Function("require", "exports", code)((n) => {
    assert(n in modules, n);
    return modules[n];
  }, exports);
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    maybeSingle: async () => ({
      data: participant ? { conversation_id: thread } : null,
      error: null,
    }),
  };
  const call = (
    data = {
      conversationId: thread,
      fileName: "private.pdf",
      contentType: "application/pdf",
      size: 42,
    },
  ) =>
    exports.createConversationAttachmentUpload({
      data,
      context: { userId: actor, supabase: { from: () => q } },
    });
  await assert.rejects(call, /Messaging is unavailable/);
  assert.equal(tokens, 0);
  participant = false;
  await assert.rejects(call, /not a participant/);
  assert.equal(adminReads, 1);
  participant = true;
  blocked = false;
  const result = await call();
  assert(result.path.startsWith(`${actor}/${thread}/`));
  assert(result.path.endsWith(".pdf"));
  assert.equal(result.size, 42);
  assert.equal(tokens, 1);
  await assert.rejects(
    () => call({ conversationId: thread, contentType: "text/html", size: 42 }),
    /JPG, PNG, WebP, or PDF/,
  );
  await assert.rejects(
    () => call({ conversationId: thread, contentType: "application/pdf", size: 10485761 }),
    /10 MB/,
  );
  assert.equal(tokens, 1);
});
