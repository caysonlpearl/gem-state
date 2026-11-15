import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { conversationDatabase } from "./helpers/account-deletion-conversations-database.mjs";
import { createAccountDeletionConversationErasure } from "../src/lib/account-deletion-conversations.server.ts";
import { mobileListingAllowed } from "../src/lib/mobile-contract.ts";

const signal = () => AbortSignal.timeout(15000);
const failure = (error) =>
  error.code === "records_unavailable" && error.message === "records_unavailable" && !error.cause;
async function setup(
  t,
  { messages = 3, attachment = false, category = "home-garden", dealer = false } = {},
) {
  const db = await conversationDatabase();
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID(),
    stranger = randomUUID(),
    conversation = randomUUID(),
    product = randomUUID(),
    listing = randomUUID(),
    cat = randomUUID(),
    dealerId = dealer ? randomUUID() : null;
  await db.query("insert into auth.users(id)values($1),($2),($3)", [user, other, stranger]);
  await db.query(
    "insert into profiles(id,display_name)values($1,'Target'),($2,'Other'),($3,'Unrelated')",
    [user, other, stranger],
  );
  await db.query("insert into categories(id,slug)values($1,$2)", [cat, category]);
  await db.query("insert into products(id,created_by,category_id)values($1,$2,$3)", [
    product,
    user,
    cat,
  ]);
  await db.query("insert into asks(id,seller_id,product_id)values($1,$2,$3)", [
    listing,
    user,
    product,
  ]);
  if (dealer)
    await db.query("insert into dealer_profiles(id,owner_user_id)values($1,$2)", [dealerId, other]);
  await db.query(
    "insert into conversations(id,listing_id,buyer_id,seller_id,dealer_id)values($1,$2,$3,$4,$5)",
    [conversation, dealer ? null : listing, user, other, null],
  );
  for (const [id, role] of [
    [user, "buyer"],
    [other, "seller"],
  ])
    await db.query(
      "insert into conversation_participants(conversation_id,user_id,role)values($1,$2,$3)",
      [conversation, id, role],
    );
  const path = attachment ? `${user}/private-document.pdf` : null;
  for (let i = 0; i < messages; i++)
    await db.query(
      "insert into conversation_messages(conversation_id,sender_id,body,attachment_path)values($1,$2,$3,$4)",
      [conversation, user, `Synthetic target text ${i}`, i === 0 ? path : null],
    );
  await db.query(
    "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Synthetic other member text')",
    [conversation, other],
  );
  if (dealer)
    await db.query(
      "insert into mobile_dealer_conversations(conversation_id,dealer_id,buyer_id,seller_id)values($1,$2,$3,$4)",
      [conversation, dealerId, user, other],
    );
  const tables = [
    "conversations",
    "conversation_messages",
    "conversation_participants",
    "mobile_dealer_conversations",
    "conversation_reports",
    "account_deletion_conversation_catalog_refs",
  ];
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          (
            await db.query(
              `select to_jsonb(r) row from public.${table} r order by to_jsonb(r)::text`,
            )
          ).rows.map((row) => row.row),
        ]),
      ),
    );
  const inventory = async (job) => {
    for (let i = 0; i < 100; i++) {
      const value = (
        await db.query("select public.scan_account_deletion_media_inventory($1,$2,$3,50) result", [
          job.id,
          job.user_id,
          job.lease_token,
        ])
      ).rows[0].result;
      if (value.pass_done) return;
    }
    throw Error("Fixture inventory did not finish");
  };
  const start = async (target = user, { scan = true } = {}) => {
    await db.query("select public.mobile_request_deletion($1)", [target]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [target],
      )
    ).rows[0];
    // Inventory's scanner runs under its own phase before this component. Provider
    // bytes and the full media/identity pipeline are not exercised by this fixture.
    if (scan) {
      await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
      await inventory(job);
      await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
    }
    return job;
  };
  let loseAck = false;
  const client = createClient(
    "https://udxxfuticbxwiehoepeg.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init),
            name = new URL(request.url).pathname.split("/").at(-1),
            args = await request.json();
          assert(
            [
              "purge_account_deletion_conversations",
              "verify_account_deletion_conversations",
            ].includes(name),
          );
          await db.exec("set role service_role");
          let data;
          try {
            data = (
              await db.query(
                `select public.${name}(${Object.values(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")}) result`,
                Object.values(args),
              )
            ).rows[0].result;
          } finally {
            await db.exec("reset role");
          }
          if (loseAck) {
            loseAck = false;
            throw Error("Synthetic private diagnostic");
          }
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  return {
    db,
    user,
    other,
    stranger,
    conversation,
    listing,
    product,
    path,
    start,
    inventory,
    snapshot,
    component: createAccountDeletionConversationErasure(client),
    loseNextAck: () => {
      loseAck = true;
    },
  };
}
function changedRows(before, after) {
  const key = (table, row) =>
    table === "conversation_participants"
      ? `${row.conversation_id}:${row.user_id}`
      : (row.id ?? row.conversation_id);
  return Object.keys(before).reduce((total, table) => {
    const a = new Map(before[table].map((row) => [key(table, row), JSON.stringify(row)])),
      b = new Map(after[table].map((row) => [key(table, row), JSON.stringify(row)]));
    return (
      total +
      [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id)).length
    );
  }, 0);
}
async function purge(f, job) {
  const pages = [];
  for (let i = 0; i < 100; i++) {
    const before = await f.snapshot(),
      page = await f.component.step(job, signal()),
      after = await f.snapshot();
    assert.equal(
      changedRows(before, after),
      page.changed,
      "Every physical row change counts against the batch limit",
    );
    assert(page.changed <= 100);
    pages.push(page);
    if (page.passDone) return pages;
  }
  throw Error("Fixture cleanup did not finish");
}

async function managedImport(f) {
  const seller = randomUUID(),
    token = randomUUID(),
    transfer = randomUUID(),
    claimant = randomUUID(),
    profile = `https://fixture.invalid/${seller}`;
  await f.db.query("insert into auth.users(id,email_confirmed_at)values($1,now())", [claimant]);
  await f.db.query("insert into conversation_fixture_operators(user_id)values($1)", [f.stranger]);
  await f.db.query("update asks set seller_id=$1 where id=$2", [f.other, f.listing]);
  await f.db.query(
    "insert into managed_import_sellers(id,source_profile_url,display_name,owner_user_id,original_user_id,imported_by)values($1,$2,'Synthetic imported seller',$3,$3,$4)",
    [seller, profile, f.other, f.stranger],
  );
  await f.db.query(
    "insert into fb_marketplace_import_items(id,listing_id,source_profile_url,seller_id)values($1,$2,$3,$4)",
    [randomUUID(), f.listing, profile, f.other],
  );
  await f.db.query(
    "insert into seller_claim_tokens(id,managed_seller_id,token_hash,created_by)values($1,$2,repeat('a',64),$3)",
    [token, seller, f.stranger],
  );
  await f.db.query(
    "insert into seller_claim_transfers(id,claim_token_id,claimant_id)values($1,$2,$3)",
    [transfer, token, claimant],
  );
  return { seller, token, transfer, claimant };
}

test("the existing seller claim hands off the seller seat and read state without rewriting historical authors", async (t) => {
  const f = await setup(t),
    m = await managedImport(f);
  await f.db.query(
    "update conversation_participants set last_read_at=now() where conversation_id=$1 and role='seller'",
    [f.conversation],
  );
  await f.db.query("select finish_seller_claim($1,$2,true,true)", [m.transfer, m.claimant]);
  assert.deepEqual(
    (await f.db.query("select buyer_id,seller_id from conversations where id=$1", [f.conversation]))
      .rows,
    [{ buyer_id: f.user, seller_id: m.claimant }],
  );
  assert.deepEqual(
    (
      await f.db.query(
        "select user_id,last_read_at from conversation_participants where conversation_id=$1 and role='seller'",
        [f.conversation],
      )
    ).rows,
    [{ user_id: m.claimant, last_read_at: null }],
  );
  assert.equal(
    (
      await f.db.query(
        "select sender_id from conversation_messages where body='Synthetic other member text'",
      )
    ).rows[0].sender_id,
    f.other,
  );
  assert.equal(
    (await f.db.query("select status from seller_claim_transfers where id=$1", [m.transfer]))
      .rows[0].status,
    "complete",
  );
  await assert.rejects(
    f.db.query("select reply_managed_import_conversation($1,$2,'After claim')", [
      f.conversation,
      f.stranger,
    ]),
    /no longer admin managed/,
  );
});

test("a trusted-operation flag cannot reassign a conversation without its live, matching seller claim", async (t) => {
  const f = await setup(t),
    m = await managedImport(f);
  await f.db.query("update asks set seller_id=$1 where id=$2", [m.claimant, f.listing]);
  const transfer = () =>
    f.db.query("update conversations set seller_id=$1 where id=$2", [m.claimant, f.conversation]);
  await assert.rejects(transfer(), /immutable/);
  await f.db.exec("select set_config('parkvault.trusted_operation','on',false)");
  for (const [sql, restore] of [
    [
      "update seller_claim_transfers set lease_until=now()-interval '1 minute'",
      "update seller_claim_transfers set lease_until=now()+interval '10 minutes'",
    ],
    [
      "update seller_claim_tokens set revoked_at=now()",
      "update seller_claim_tokens set revoked_at=null",
    ],
    [
      "update seller_claim_tokens set consumed_at=now()",
      "update seller_claim_tokens set consumed_at=null",
    ],
    [
      "update seller_claim_tokens set expires_at=now()-interval '1 minute'",
      "update seller_claim_tokens set expires_at=now()+interval '1 day'",
    ],
  ]) {
    await f.db.exec(sql);
    await assert.rejects(transfer(), /immutable/);
    await f.db.exec(restore);
  }
  await f.db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(transfer(), /immutable/);
  await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  await f.db.query("select mobile_request_deletion($1)", [m.claimant]);
  await assert.rejects(transfer(), /Private account records unavailable/);
  assert.equal(
    (await f.db.query("select seller_id from conversations where id=$1", [f.conversation])).rows[0]
      .seller_id,
    f.other,
  );
});

test("the existing managed inbox accepts authorized operator replies but not arbitrary senders or claimed/retired threads", async (t) => {
  const f = await setup(t),
    m = await managedImport(f);
  const result = (
    await f.db.query(
      "select reply_managed_import_conversation($1,$2,'Synthetic operator reply') id",
      [f.conversation, f.stranger],
    )
  ).rows[0].id;
  assert.deepEqual(
    (
      await f.db.query(
        "select sender_id,managed_seller_id,sender_label from conversation_messages where id=$1",
        [result],
      )
    ).rows,
    [
      {
        sender_id: f.stranger,
        managed_seller_id: m.seller,
        sender_label: "Bluebird on behalf of Synthetic imported seller",
      },
    ],
  );
  await assert.rejects(
    f.db.query(
      "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Forged reply')",
      [f.conversation, m.claimant],
    ),
    /sender is unavailable/,
  );
  await assert.rejects(
    f.db.query(
      "insert into conversation_messages(conversation_id,sender_id,managed_seller_id,body)values($1,$2,$3,'Forged managed reply')",
      [f.conversation, m.claimant, m.seller],
    ),
    /Administrator access required/,
  );
  const job = await f.start();
  await assert.rejects(
    f.db.query("select reply_managed_import_conversation($1,$2,'Late operator reply')", [
      f.conversation,
      f.stranger,
    ]),
    /Private account records unavailable/,
  );
  await purge(f, job);
  await assert.rejects(
    f.db.query("select reply_managed_import_conversation($1,$2,'Retired operator reply')", [
      f.conversation,
      f.stranger,
    ]),
    /Messaging is unavailable/,
  );
});

test("bounded cleanup removes only authored messages, retires membership and keeps the other participant and dealer context", async (t) => {
  const f = await setup(t, { messages: 205, dealer: true, attachment: true }),
    job = await f.start();
  const pages = await purge(f, job);
  assert(pages.some((page) => page.source === "messages" && page.changed === 100));
  assert.deepEqual((await f.db.query("select sender_id,body from conversation_messages")).rows, [
    { sender_id: f.other, body: "Synthetic other member text" },
  ]);
  const parent = (
    await f.db.query("select buyer_id,seller_id,closed_at from conversations where id=$1", [
      f.conversation,
    ])
  ).rows[0];
  assert.equal(parent.buyer_id, null);
  assert.equal(parent.seller_id, f.other);
  assert(parent.closed_at);
  assert.deepEqual(
    (await f.db.query("select buyer_id,seller_id from mobile_dealer_conversations")).rows,
    [{ buyer_id: null, seller_id: f.other }],
  );
  assert.deepEqual((await f.db.query("select user_id from conversation_participants")).rows, [
    { user_id: f.other },
  ]);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where source='conversation_messages' and job_id=$1",
        [job.id],
      )
    ).rows[0].n,
    1,
    "The media reference survives message deletion",
  );
  const repeat = await f.component.step(job, signal());
  assert.deepEqual(repeat, { source: null, changed: 0, passDone: true });
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
  assert.equal(
    (await f.db.query("select count(*)::int n from conversation_messages")).rows[0].n,
    1,
  );
});

test("a lost acknowledgement resumes remaining work without deleting another member content", async (t) => {
  const f = await setup(t, { messages: 120 }),
    job = await f.start();
  f.loseNextAck();
  await assert.rejects(f.component.step(job, signal()), failure);
  await purge(f, job);
  assert.equal(
    (
      await f.db.query("select count(*)::int n from conversation_messages where sender_id=$1", [
        f.other,
      ])
    ).rows[0].n,
    1,
  );
});

test("an attachment must be in the durable current inventory before its row can disappear", async (t) => {
  const f = await setup(t, { attachment: true }),
    job = await f.start(undefined, { scan: false }),
    before = await f.snapshot();
  await assert.rejects(f.component.step(job, signal()), failure);
  assert.deepEqual(await f.snapshot(), before);
});

for (const status of ["open", "under_review", "reviewed", "dismissed"])
  test(`moderation ${status} waits for explicit retention handling without erasing shared content`, async (t) => {
    const f = await setup(t);
    await f.db.query(
      "insert into conversation_reports(conversation_id,reporter_id,reason,status)values($1,$2,$3,$4)",
      [f.conversation, f.other, "Synthetic report", status],
    );
    const job = await f.start(),
      before = await f.snapshot();
    await assert.rejects(f.component.step(job, signal()), failure);
    assert.deepEqual(await f.snapshot(), before);
  });

test("pending and retired identities cannot receive late messages, regain membership or be removed through a cascading shortcut", async (t) => {
  const f = await setup(t),
    job = await f.start(),
    before = await f.snapshot();
  await assert.rejects(
    f.db.query(
      "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Late message')",
      [f.conversation, f.other],
    ),
    /Private account records unavailable/,
  );
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.user]));
  assert.deepEqual(await f.snapshot(), before);
  await purge(f, job);
  await assert.rejects(
    f.db.query("update conversations set buyer_id=$1,closed_at=null where id=$2", [
      f.user,
      f.conversation,
    ]),
    /immutable/,
  );
  await assert.rejects(
    f.db.query(
      "insert into conversation_participants(conversation_id,user_id,role)values($1,$2,'buyer')",
      [f.conversation, f.user],
    ),
    /membership is unavailable/,
  );
  await assert.rejects(
    f.db.query(
      "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Late message')",
      [f.conversation, f.other],
    ),
    /read-only/,
  );
});

test("eligible closed history keeps a private canonical category after the listing disappears; strangers and prohibited categories stay excluded", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await purge(f, job);
  await f.db.query("delete from asks where id=$1", [f.listing]);
  assert.deepEqual(
    (
      await f.db.query("select * from mobile_retired_conversation_contexts($1,$2)", [
        f.other,
        [f.conversation],
      ])
    ).rows,
    [{ conversation_id: f.conversation, category_slug: "home-garden", catalog_version: 1 }],
  );
  assert.deepEqual(
    (
      await f.db.query("select * from mobile_retired_conversation_contexts($1,$2)", [
        f.stranger,
        [f.conversation],
      ])
    ).rows,
    [],
  );
  await f.db.exec("set role authenticated");
  await assert.rejects(
    f.db.query("select * from mobile_retired_conversation_contexts($1,$2)", [
      f.other,
      [f.conversation],
    ]),
    /permission denied/,
  );
  await f.db.exec("reset role");
  const prohibited = await setup(t, { category: "firearms" }),
    prohibitedJob = await prohibited.start();
  await purge(prohibited, prohibitedJob);
  assert.deepEqual(
    (
      await prohibited.db.query("select * from mobile_retired_conversation_contexts($1,$2)", [
        prohibited.other,
        [prohibited.conversation],
      ])
    ).rows,
    [],
  );
});

test("the last member cleanup removes only the empty conversation and its catalog reference", async (t) => {
  const f = await setup(t, { dealer: true }),
    first = await f.start();
  await purge(f, first);
  const second = await f.start(f.other);
  await purge(f, second);
  for (const table of [
    "conversations",
    "conversation_messages",
    "conversation_participants",
    "mobile_dealer_conversations",
    "account_deletion_conversation_catalog_refs",
  ])
    assert.equal((await f.db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
});

test("the existing native dealer starter and message retries survive the deletion writer guards", async (t) => {
  const f = await setup(t),
    dealer = randomUUID();
  await f.db
    .exec(`alter table dealer_profiles add column display_name text,add column description text,add column status text,add column agreements_accepted_at timestamptz;
  alter table dealer_inventory_sources add column status text;
  create table dealer_feed_publications(source_id uuid,dealer_id uuid,inbox_enabled boolean,enabled boolean,revoked_at timestamptz);
  alter table account_contact_preferences add column allow_internal_messages boolean;
  alter table asks add column variant_id uuid;
  create table product_variants(id uuid primary key,product_id uuid);
  create table rate_limit_events(user_id uuid,action text,created_at timestamptz default now());
  alter table notifications add column order_id uuid;
 `);
  const hardened = readFileSync(
    new URL(
      "../supabase/migrations/20260920210000_harden_conversation_blocks_reports.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await f.db.exec(
    hardened.slice(
      hardened.indexOf("CREATE OR REPLACE FUNCTION public.send_conversation_message("),
      hardened.indexOf(
        "CREATE OR REPLACE FUNCTION public.send_conversation_message_with_attachment(",
      ),
    ),
  );
  const native = readFileSync(
    new URL(
      "../supabase/migrations/20261113100000_mobile_dealer_conversations.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await f.db.exec(
    native.match(/create function public.mobile_start_dealer_conversation\([\s\S]*?end \$\$;/)[0],
  );
  await f.db.exec("select public.protect_account_access_boundaries()");
  await f.db.query(
    "insert into dealer_profiles(id,owner_user_id,display_name,description,status,agreements_accepted_at)values($1,$2,'Synthetic Motors','Local cars','ready',now())",
    [dealer, f.other],
  );
  await f.db.query("insert into shopping_accounts(user_id,terms_version)values($1,'2026-11-12')", [
    f.user,
  ]);
  const session = randomUUID();
  await f.db.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, f.user]);
  await f.db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: f.user, role: "authenticated", session_id: session }),
  ]);
  const request = randomUUID(),
    start = (id = request) =>
      f.db.query(
        "select mobile_start_dealer_conversation($1,$2,'Synthetic dealer inquiry') result",
        [id, dealer],
      );
  const first = (await start()).rows[0].result,
    repeat = (await start()).rows[0].result;
  assert.equal(repeat.messageId, first.messageId);
  assert.equal(repeat.replayed, true);
  assert.equal(
    (await f.db.query("select dealer_id from conversations where id=$1", [first.conversationId]))
      .rows[0].dealer_id,
    null,
    "The production starter intentionally stores dealer scope only in its trusted mapping",
  );
  const job = await f.start(f.other);
  await purge(f, job);
  assert.equal(
    (
      await f.db.query("select dealer_context_title from conversations where id=$1", [
        first.conversationId,
      ])
    ).rows[0].dealer_context_title,
    null,
    "Retirement clears the departing seller’s copied dealer label",
  );
  assert.deepEqual(
    (
      await f.db.query(
        "select dealer_id,buyer_id,seller_id from mobile_dealer_conversations where conversation_id=$1",
        [first.conversationId],
      )
    ).rows,
    [{ dealer_id: dealer, buyer_id: f.user, seller_id: null }],
  );
  assert.equal(
    (await start()).rows[0].result.messageId,
    first.messageId,
    "A committed buyer retry remains a replay",
  );
  await assert.rejects(start(randomUUID()), /Private account records unavailable/);
});

test("retirement catalog proofs keep the same text and demo exclusions as current app listing eligibility", async (t) => {
  const f = await setup(t),
    cases = [];
  for (const [title, description, demo] of [
    ["Desk lamp", "Ordinary local item", false],
    ["Rifle", "", false],
    ["GLOCK accessories", "", false],
    ["Tool set", "Includes ammunition", false],
    ["Cabinet", "AR-15 storage", false],
    ["Jacket", "", false],
    ["AK47 kit", "", false],
    ["Silencer", "", false],
    ["Ammolite jewelry", "", false],
    ["Desk", "", true],
  ]) {
    const category = (await f.db.query("select id from categories where slug='home-garden'"))
      .rows[0].id;
    const product = randomUUID(),
      listing = randomUUID(),
      conversation = randomUUID();
    await f.db.query(
      "insert into products(id,created_by,category_id,name,description,is_demo)values($1,$2,$3,$4,$5,$6)",
      [product, f.user, category, title, description, demo],
    );
    await f.db.query("insert into asks(id,seller_id,product_id,is_demo)values($1,$2,$3,$4)", [
      listing,
      f.user,
      product,
      demo,
    ]);
    await f.db.query(
      "insert into conversations(id,listing_id,buyer_id,seller_id)values($1,$2,$3,$4)",
      [conversation, listing, f.user, f.other],
    );
    cases.push({
      conversation,
      allowed: mobileListingAllowed({
        categorySlug: "home-garden",
        title,
        description,
        isMock: demo,
      }),
    });
  }
  const job = await f.start();
  await purge(f, job);
  const allowed = new Set(
    (
      await f.db.query("select conversation_id from mobile_retired_conversation_contexts($1,$2)", [
        f.other,
        cases.map((row) => row.conversation),
      ])
    ).rows.map((row) => row.conversation_id),
  );
  for (const row of cases) assert.equal(allowed.has(row.conversation), row.allowed);
});

test("wrong targets, expired leases, pauses, schema drift and guest execution cannot mutate records", async (t) => {
  const f = await setup(t),
    job = await f.start(),
    before = await f.snapshot();
  for (const patch of [{ user_id: f.other }, { lease_token: randomUUID() }, { phase: "identity" }])
    await assert.rejects(f.component.step({ ...job, ...patch }, signal()), failure);
  await f.db.exec("update account_deletion_controls set worker_enabled=false");
  await assert.rejects(f.component.step(job, signal()), failure);
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  await f.db.exec(
    "alter table conversation_messages disable trigger guard_account_deletion_conversation_writer",
  );
  await assert.rejects(f.component.step(job, signal()), failure);
  await f.db.exec(
    "alter table conversation_messages enable trigger guard_account_deletion_conversation_writer",
  );
  await f.db.exec("set role authenticated");
  await assert.rejects(
    f.db.query("select purge_account_deletion_conversations($1,$2,$3,100)", [
      job.id,
      f.user,
      job.lease_token,
    ]),
    /permission denied/,
  );
  await f.db.exec("reset role");
  assert.deepEqual(await f.snapshot(), before);
});

test("the SDK adapter freezes scope, rejects malformed/private acknowledgements and obeys cancellation without retrying", async () => {
  const original = {
    id: randomUUID(),
    user_id: randomUUID(),
    lease_token: randomUUID(),
    phase: "records",
  };
  let calls = 0,
    release,
    started;
  const next = () =>
    new Promise((resolve) => {
      started = resolve;
    });
  const client = createClient(
    "https://fixture.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          calls++;
          const request = new Request(input, init),
            args = await request.json();
          return new Promise((resolve) => {
            release = (data, status = 200) =>
              resolve(
                new Response(JSON.stringify(data), {
                  status,
                  headers: { "content-type": "application/json" },
                }),
              );
            started({ args, signal: request.signal });
          });
        },
      },
    },
  );
  const component = createAccountDeletionConversationErasure(client),
    ready = next(),
    mutable = { ...original },
    work = component.step(mutable, signal());
  const first = await ready;
  mutable.user_id = randomUUID();
  mutable.lease_token = randomUUID();
  release({ source: "messages", changed: 1, pass_done: false });
  assert.deepEqual(await work, { source: "messages", changed: 1, passDone: false });
  assert.deepEqual(first.args, {
    _id: original.id,
    _user: original.user_id,
    _lease: original.lease_token,
    _limit: 100,
  });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(component.step(original, cancelled.signal), failure);
  assert.equal(calls, 1);
  for (const data of [
    null,
    { source: null, changed: 0, pass_done: false },
    { source: "messages", changed: 101, pass_done: false },
    { source: "messages", changed: 0, pass_done: true },
    { source: "messages", changed: 1, pass_done: false, private: "DO NOT EXPOSE" },
  ]) {
    const ready = next(),
      attempt = component.step(original, signal());
    await ready;
    release(data);
    await assert.rejects(attempt, failure);
  }
  const ready2 = next(),
    abort = new AbortController(),
    attempt = component.step(original, abort.signal);
  const active = await ready2;
  abort.abort();
  assert.equal(active.signal.aborted, true);
  release({ source: null, changed: 0, pass_done: true });
  await assert.rejects(attempt, failure);
  const before = calls,
    ready3 = next(),
    failed = component.step(original, signal());
  await ready3;
  release({ message: "Private provider diagnostic" }, 503);
  await assert.rejects(failed, failure);
  assert.equal(calls, before + 1);
  const ready4 = next(),
    verify = component.verify({ ...original, phase: "verification" }, signal());
  await ready4;
  release("true");
  await assert.rejects(verify, (error) => error.code === "verification_failed");
});
