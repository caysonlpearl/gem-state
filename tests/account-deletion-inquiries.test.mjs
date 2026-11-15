import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  inquiryDatabase,
  inquiryMigration,
} from "./helpers/account-deletion-inquiries-database.mjs";
import { createAccountDeletionInquiryErasure } from "../src/lib/account-deletion-inquiries.server.ts";
const signal = () => AbortSignal.timeout(15000);
async function setup(t, { count = 3 } = {}) {
  const db = await inquiryDatabase();
  t.after(() => db.close());
  const buyer = randomUUID(),
    seller = randomUUID(),
    stranger = randomUUID(),
    listing = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2),($3)", [buyer, seller, stranger]);
  await db.query(
    "insert into profiles(id,display_name)values($1,'Buyer'),($2,'Seller'),($3,'Other')",
    [buyer, seller, stranger],
  );
  await db.query("insert into asks(id,seller_id)values($1,$2)", [listing, seller]);
  const add = async (target = buyer, n = 1) =>
    db.query(
      "insert into listing_inquiries(listing_id,seller_id,buyer_id,buyer_name,buyer_email,message)select $1,$2,$3,'Synthetic name','synthetic@example.invalid','Synthetic private inquiry' from generate_series(1,$4)",
      [listing, seller, target, n],
    );
  await add(buyer, count);
  await add(stranger, 1);
  const start = async (user = buyer) => {
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    return (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
  };
  let lostAck = false;
  const calls = [];
  const client = createClient(
    "https://udxxfuticbxwiehoepeg.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const req = new Request(input, init),
            name = new URL(req.url).pathname.split("/").at(-1),
            args = await req.json();
          assert(
            ["purge_account_deletion_inquiries", "verify_account_deletion_inquiries"].includes(
              name,
            ),
          );
          calls.push({ name, args });
          await db.exec("set role service_role");
          let result;
          try {
            result = (
              await db.query(
                `select public.${name}(${Object.keys(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")})result`,
                Object.values(args),
              )
            ).rows[0].result;
          } finally {
            await db.exec("reset role");
          }
          if (lostAck) {
            lostAck = false;
            throw Error("Synthetic private SQL diagnostic");
          }
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const step = (job, limit = 100) =>
    db
      .query("select public.purge_account_deletion_inquiries($1,$2,$3,$4)result", [
        job.id,
        job.user_id,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].result);
  return {
    db,
    buyer,
    seller,
    stranger,
    listing,
    start,
    add,
    step,
    calls,
    component: createAccountDeletionInquiryErasure(client),
    loseAck: () => (lostAck = true),
  };
}
const failed = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
test("SDK inquiry cleanup bounds authored removal, preserves unrelated rows and retries a lost acknowledgement", async (t) => {
  const f = await setup(t, { count: 205 }),
    job = await f.start();
  f.loseAck();
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(f.calls.length, 1, "SDK must not retry a mutation automatically");
  const first = await f.component.step(job, signal());
  assert.deepEqual(first, { source: "authored", changed: 100, passDone: false });
  assert.equal((await f.component.step(job, signal())).changed, 5);
  assert.deepEqual(await f.component.step(job, signal()), {
    source: null,
    changed: 0,
    passDone: true,
  });
  const rows = (await f.db.query("select * from listing_inquiries")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].buyer_id, f.stranger);
  assert.equal(rows[0].message, "Synthetic private inquiry");
  await assert.rejects(f.component.verify(job, signal()), (e) => e.code === "verification_failed");
  await f.db.query("delete from auth.users where id=$1", [f.buyer]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("departing sellers leave buyers own text intact, close inquiries and remove only the seller reference", async (t) => {
  const f = await setup(t),
    before = (await f.db.query("select * from listing_inquiries order by id")).rows,
    job = await f.start(f.seller);
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "seller",
    changed: 4,
    passDone: true,
  });
  const after = (await f.db.query("select * from listing_inquiries order by id")).rows;
  assert.deepEqual(
    after,
    before.map((row) => ({ ...row, seller_id: null, status: "closed" })),
  );
  await assert.rejects(
    f.db.query("update listing_inquiries set status='new'where id=$1", [after[0].id]),
    /read-only|retired/,
  );
  await assert.rejects(
    f.db.query("update listing_inquiries set seller_id=$1 where id=$2", [f.stranger, after[0].id]),
    /immutable/,
  );
});
test("copied buyer inquiries wait for conversation cleanup and never erase the other members replies", async (t) => {
  const f = await setup(t),
    inquiry = (
      await f.db.query("select id from listing_inquiries where buyer_id=$1 limit 1", [f.buyer])
    ).rows[0].id,
    conversation = randomUUID();
  await f.db.query(
    "insert into conversations(id,listing_id,buyer_id,seller_id)values($1,$2,$3,$4)",
    [conversation, f.listing, f.buyer, f.seller],
  );
  await f.db.query(
    "insert into conversation_messages(conversation_id,sender_id,body,source_inquiry_id)values($1,$2,'Synthetic private inquiry',$3)",
    [conversation, f.buyer, inquiry],
  );
  await f.db.query(
    "insert into conversation_messages(conversation_id,sender_id,body)values($1,$2,'Surviving seller reply')",
    [conversation, f.seller],
  );
  const job = await f.start();
  await assert.rejects(f.step(job), /conversation cleanup/);
  for (let i = 0; i < 5; i++) {
    const r = (
      await f.db.query("select purge_account_deletion_conversations($1,$2,$3,100)result", [
        job.id,
        f.buyer,
        job.lease_token,
      ])
    ).rows[0].result;
    if (r.pass_done) break;
  }
  assert.equal((await f.component.step(job, signal())).passDone, true);
  assert.deepEqual((await f.db.query("select sender_id,body from conversation_messages")).rows, [
    { sender_id: f.seller, body: "Surviving seller reply" },
  ]);
});
test("listing removal closes retained inquiries instead of cascading another members content", async (t) => {
  const f = await setup(t),
    before = (await f.db.query("select * from listing_inquiries order by id")).rows;
  await f.db.query("delete from asks where id=$1", [f.listing]);
  const after = (await f.db.query("select * from listing_inquiries order by id")).rows;
  assert.deepEqual(
    after,
    before.map((row) => ({ ...row, listing_id: null, status: "closed" })),
  );
  const job = await f.start();
  assert.equal((await f.step(job)).changed, 3);
});
test("pending deletion prevents incoming inquiries, changes of authorship and forged seller transfers", async (t) => {
  const f = await setup(t),
    row = (await f.db.query("select * from listing_inquiries limit 1")).rows[0];
  for (const sql of [
    "update listing_inquiries set buyer_email='changed'where id=$1",
    "update listing_inquiries set message='changed'where id=$1",
    "update listing_inquiries set created_at=now()+interval '1 day'where id=$1",
  ])
    await assert.rejects(f.db.query(sql, [row.id]), /authorship/);
  await f.db.exec("select set_config('parkvault.trusted_operation','on',false)");
  await assert.rejects(
    f.db.query("update listing_inquiries set seller_id=$1 where id=$2", [f.stranger, row.id]),
    /immutable/,
  );
  const job = await f.start(f.seller);
  await assert.rejects(f.add(f.stranger), /unavailable/);
  await assert.rejects(
    f.db.query("update listing_inquiries set status='read'where id=$1", [row.id]),
    /unavailable/,
  );
  await assert.rejects(f.step({ ...job, user_id: f.buyer }), /unavailable/);
  await assert.rejects(f.step({ ...job, lease_token: randomUUID() }), /unavailable/);
  await assert.rejects(f.step(job, 101), /unavailable/);
  await assert.rejects(f.step(job, 0), /unavailable/);
  assert.equal((await f.step(job)).changed, 4);
});
test("schema or hook changes, disabled workers and stale leases fail before inquiry writes", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await f.db.exec("alter table listing_inquiries add column unexpected text");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("alter table listing_inquiries drop column unexpected");
  await f.db.exec("alter table listing_inquiries disable trigger shopping_accepted_inquiry");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("alter table listing_inquiries enable trigger shopping_accepted_inquiry");
  await f.db.exec("update account_deletion_controls set worker_enabled=false");
  await assert.rejects(f.step(job), /unavailable/);
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
  assert.equal((await f.db.query("select count(*)::int n from listing_inquiries")).rows[0].n, 4);
});
test("inquiry helpers and contracts are inaccessible to clients and do not authorize whole-job completion", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.step(job), /permission/);
    await assert.rejects(
      f.db.query("select * from account_deletion_inquiry_contract"),
      /permission/,
    );
    await f.db.exec("reset role");
  }
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.buyer]), /foreign key/);
  assert.equal((await f.step(job)).pass_done, true);
  assert.equal(
    (await f.db.query("select status,phase from account_deletion_jobs where id=$1", [job.id]))
      .rows[0].status,
    "processing",
  );
  await f.db.exec("set role service_role");
  await assert.rejects(
    f.db.query("select account_deletion_inquiry_context($1)", [f.buyer]),
    /permission/,
  );
  await f.db.exec("reset role");
});
test("migration rejects unexpected incoming children instead of authorizing cascade deletion", async (t) => {
  const db = await inquiryDatabase({ install: false });
  t.after(() => db.close());
  await db.exec(
    "create table unexpected_inquiry_child(id uuid references listing_inquiries(id)on delete cascade)",
  );
  await assert.rejects(db.exec(inquiryMigration()), /child relationships/);
  await db.exec("rollback");
  assert.equal(
    (
      await db.query(
        "select to_regprocedure('purge_account_deletion_inquiries(uuid,uuid,uuid,integer)')name",
      )
    ).rows[0].name,
    null,
  );
});
async function managedImport(f) {
  const managed = randomUUID(),
    token = randomUUID(),
    transfer = randomUUID(),
    claimant = randomUUID(),
    profile = `https://fixture.invalid/${managed}`;
  await f.db.query("insert into auth.users(id,email_confirmed_at)values($1,now())", [claimant]);
  await f.db.query("insert into conversation_fixture_operators(user_id)values($1)", [f.stranger]);
  await f.db.query(
    "insert into managed_import_sellers(id,source_profile_url,display_name,owner_user_id,original_user_id,imported_by)values($1,$2,'Synthetic seller',$3,$3,$4)",
    [managed, profile, f.seller, f.stranger],
  );
  await f.db.query(
    "insert into fb_marketplace_import_items(id,listing_id,source_profile_url,seller_id)values($1,$2,$3,$4)",
    [randomUUID(), f.listing, profile, f.seller],
  );
  await f.db.query(
    "insert into seller_claim_tokens(id,managed_seller_id,token_hash,created_by)values($1,$2,repeat('b',64),$3)",
    [token, managed, f.stranger],
  );
  await f.db.query(
    "insert into seller_claim_transfers(id,claim_token_id,claimant_id)values($1,$2,$3)",
    [transfer, token, claimant],
  );
  return { managed, token, transfer, claimant };
}
test("existing operator inquiry replies copy original authorship and reject pending-account conversations", async (t) => {
  const f = await setup(t),
    m = await managedImport(f),
    row = (await f.db.query("select * from listing_inquiries where buyer_id=$1 limit 1", [f.buyer]))
      .rows[0];
  const conversation = (
    await f.db.query("select reply_managed_import_inquiry($1,$2,'Synthetic operator reply')id", [
      row.id,
      f.stranger,
    ])
  ).rows[0].id;
  const messages = (
    await f.db.query(
      "select sender_id,body,source_inquiry_id,managed_seller_id from conversation_messages where conversation_id=$1 order by created_at",
      [conversation],
    )
  ).rows;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].sender_id, f.buyer);
  assert.equal(messages[0].source_inquiry_id, row.id);
  assert.equal(messages[1].managed_seller_id, m.managed);
  await f.start();
  await assert.rejects(
    f.db.query("select reply_managed_import_inquiry($1,$2,'Must not be delivered')", [
      row.id,
      f.stranger,
    ]),
    /unavailable/,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from conversation_messages where conversation_id=$1",
        [conversation],
      )
    ).rows[0].n,
    2,
  );
});
test("real seller claim transfers inquiry inbox ownership without changing buyer data", async (t) => {
  const f = await setup(t),
    m = await managedImport(f),
    before = (await f.db.query("select * from listing_inquiries order by id")).rows;
  await f.db.query("select finish_seller_claim($1,$2,true,true)", [m.transfer, m.claimant]);
  assert.deepEqual(
    (await f.db.query("select * from listing_inquiries order by id")).rows,
    before.map((row) => ({ ...row, seller_id: m.claimant })),
  );
  assert.equal(
    (await f.db.query("select status from seller_claim_transfers where id=$1", [m.transfer]))
      .rows[0].status,
    "complete",
  );
});
test("invalidated transfer journals and a pending claimant cannot use the trusted operation flag", async (t) => {
  const f = await setup(t),
    m = await managedImport(f);
  await f.db.query("update asks set seller_id=$1 where id=$2", [m.claimant, f.listing]);
  const transfer = () =>
    f.db.query("update listing_inquiries set seller_id=$1 where seller_id=$2", [
      m.claimant,
      f.seller,
    ]);
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
  await assert.rejects(transfer(), /unavailable/);
});
test("source references authored by somebody else defer erasure without editing their text", async (t) => {
  const f = await setup(t),
    row = (
      await f.db.query("select id from listing_inquiries where buyer_id=$1 limit 1", [f.buyer])
    ).rows[0],
    conversation = randomUUID();
  await f.db.query("insert into conversations(id,buyer_id,seller_id)values($1,$2,$3)", [
    conversation,
    f.buyer,
    f.seller,
  ]);
  await f.db.query(
    "insert into conversation_messages(conversation_id,sender_id,body,source_inquiry_id)values($1,$2,'Do not erase another author',$3)",
    [conversation, f.seller, row.id],
  );
  const job = await f.start();
  await assert.rejects(f.step(job), /conversation cleanup/);
  assert.equal(
    (
      await f.db.query("select body from conversation_messages where source_inquiry_id=$1", [
        row.id,
      ])
    ).rows[0].body,
    "Do not erase another author",
  );
  assert.equal((await f.db.query("select count(*)::int n from listing_inquiries")).rows[0].n, 4);
});
test("withdrawn or aborted calls and malformed RPC acknowledgements cannot claim a completed pass", async () => {
  const job = {
      id: randomUUID(),
      user_id: randomUUID(),
      lease_token: randomUUID(),
      phase: "records",
    },
    abort = new AbortController();
  abort.abort();
  let called = 0;
  const db = {
    rpc() {
      called++;
      return {
        abortSignal() {
          return this;
        },
        retry() {
          return Promise.resolve({
            error: null,
            data: { source: "authored", changed: 1, pass_done: true },
          });
        },
      };
    },
  };
  await assert.rejects(createAccountDeletionInquiryErasure(db).step(job, abort.signal), failed);
  assert.equal(called, 0);
  for (const value of [
    {},
    [],
    { source: "authored", changed: 101, pass_done: false },
    { source: null, changed: 0, pass_done: false },
    { source: "seller", changed: 0, pass_done: true },
    { source: "authored", changed: 1, pass_done: true, diagnostic: "private" },
  ]) {
    const fake = {
      rpc() {
        return {
          abortSignal() {
            return this;
          },
          retry() {
            return Promise.resolve({ error: null, data: value });
          },
        };
      },
    };
    await assert.rejects(createAccountDeletionInquiryErasure(fake).step(job, signal()), failed);
  }
});
