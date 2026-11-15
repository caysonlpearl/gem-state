import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAccountDeletionBusinessClaimErasure } from "../src/lib/account-deletion-business-claims.server.ts";
import { businessClaimsDatabase } from "./helpers/account-deletion-business-claims-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";

const sources = ["employer_claims", "service_directory_claims", "service_directory"];
async function fixture(t, { many = 1 } = {}) {
  const db = await businessClaimsDatabase();
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID(),
    admin = randomUUID();
  for (const id of [user, other, admin])
    await db.query("insert into auth.users(id,raw_user_meta_data)values($1,$2)", [
      id,
      { shopping_terms_version: "2026-11-12" },
    ]);
  await db.query("insert into conversation_fixture_operators(user_id)values($1),($2)", [
    user,
    admin,
  ]);
  const directories = Array.from(
    { length: 3 },
    () => "fsq-" + randomUUID().replaceAll("-", "").slice(0, 24),
  );
  for (const id of directories)
    await db.query(
      "insert into service_directory(id,name,trade,city,phone)values($1,'Public fixture business','Plumbing','Boise','208-555-0100')",
      [id],
    );
  await db.query(
    "insert into employer_claims(employer_key,employer_name,user_id,contact,role,note)select 'synthetic-employer-'||n,'Fixture employer',$1,'Private fixture contact','Manager','Private fixture note'from generate_series(1,$2::int)n",
    [user, many],
  );
  const employerOther = (
    await db.query(
      "insert into employer_claims(employer_key,employer_name,user_id,contact,role,note)values('other-employer','Other employer',$1,'Other private contact','Manager','Other private note')returning id",
      [other],
    )
  ).rows[0].id;
  const ownService = (
    await db.query(
      "insert into service_directory_claims(directory_id,user_id,contact,role,note)values($1,$2,'Private fixture contact','Manager','Private fixture note')returning id",
      [directories[0], user],
    )
  ).rows[0].id;
  const otherService = (
    await db.query(
      "insert into service_directory_claims(directory_id,user_id,contact,role,note)values($1,$2,'Other private contact','Manager','Other private note')returning id",
      [directories[1], other],
    )
  ).rows[0].id;
  await fixtureMemberSession(db, user);
  await db.query("select review_employer_claim($1,true)", [employerOther]);
  await db.query("select review_service_directory_claim($1,true)", [otherService]);
  await fixtureMemberSession(db, admin);
  await db.query("select review_service_directory_claim($1,true)", [ownService]);
  const clear = () => db.exec("select set_config('request.jwt.claims','{}',false)");
  await clear();
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        sources.map(async (table) => [
          table,
          (await db.query(`select * from ${table} order by id`)).rows,
        ]),
      ),
    );
  const start = async () => {
    await clear();
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    return (
      await db.query(
        "update account_deletion_jobs set status='processing',phase='records',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_business_claims($1,$2,$3,$4)r", [
        job.id,
        user,
        job.lease_token,
        limit,
      ])
      .then((result) => result.rows[0].r);
  const drain = async (job) => {
    for (let n = 0; n < 20; n++) if ((await step(job)).pass_done) return;
    throw Error("Claim cleanup did not finish");
  };
  return {
    db,
    user,
    other,
    admin,
    directories,
    employerOther,
    otherService,
    ownService,
    clear,
    snapshot,
    start,
    step,
    drain,
  };
}

test("bounded claim cleanup erases owned contacts and retires assignments while preserving public businesses and other members' claim evidence", async (t) => {
  const f = await fixture(t, { many: 203 }),
    before = await f.snapshot(),
    job = await f.start();
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.user]), (e) =>
    ["23503", "23001"].includes(e.code),
  );
  const receipts = [];
  for (let n = 0; n < 20; n++) {
    const old = await f.snapshot(),
      result = await f.step(job),
      next = await f.snapshot();
    let changes = 0;
    for (const table of sources) {
      const remaining = new Map(next[table].map((row) => [row.id, row]));
      changes += old[table].filter(
        (row) => JSON.stringify(remaining.get(row.id)) !== JSON.stringify(row),
      ).length;
    }
    assert.equal(result.changed, changes);
    assert(result.changed > 0 && result.changed <= 100);
    receipts.push(result);
    if (result.pass_done) break;
  }
  assert.equal(receipts.at(-1).pass_done, true);
  assert(receipts.some((result) => result.changed === 100));
  assert.deepEqual(
    new Set(receipts.map((result) => result.source + ":" + result.mode)),
    new Set([
      "service_directory:assignment",
      "employer_claims:owned",
      "employer_claims:reviewer",
      "service_directory_claims:owned",
      "service_directory_claims:reviewer",
    ]),
  );
  const after = await f.snapshot();
  for (const table of ["employer_claims", "service_directory_claims"]) {
    const expected = before[table]
      .filter((row) => row.user_id !== f.user)
      .map((row) => ({ ...row, reviewed_by: row.reviewed_by === f.user ? null : row.reviewed_by }));
    assert.deepEqual(after[table], expected);
  }
  const publicData = (rows) =>
    rows.map(({ claimed_by, claimed_at, updated_at, ...business }) => business);
  assert.deepEqual(publicData(after.service_directory), publicData(before.service_directory));
  assert.equal(after.service_directory.find((row) => row.id === f.directories[0]).claimed_by, null);
  assert.equal(
    after.service_directory.find((row) => row.id === f.directories[1]).claimed_by,
    f.other,
  );
  assert.deepEqual(await f.step(job), { source: null, mode: null, changed: 0, pass_done: true });
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    f.db.query("select verify_account_deletion_business_claims($1,$2,$3)", [
      job.id,
      f.user,
      job.lease_token,
    ]),
  );
  // Independent verification follows identity removal. Consent handling is a
  // separate predecessor step; completing claims alone must not skip it.
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  for (let n = 0; n < 10; n++) {
    const result = (
      await f.db.query("select purge_account_deletion_consents($1,$2,$3,'records',100)r", [
        job.id,
        f.user,
        job.lease_token,
      ])
    ).rows[0].r;
    if (result.pass_done) break;
  }
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(
    (
      await f.db.query("select verify_account_deletion_business_claims($1,$2,$3)r", [
        job.id,
        f.user,
        job.lease_token,
      ])
    ).rows[0].r,
    true,
  );
});

test("pending deletion rejects new claims, reviews, ownership changes and reassignment while unrelated public enrichment remains operational", async (t) => {
  const f = await fixture(t),
    job = await f.start(),
    before = await f.snapshot();
  await assert.rejects(
    f.db.query(
      "insert into employer_claims(employer_key,employer_name,user_id,contact,role)values('late-employer','Late employer',$1,'Private contact','Manager')",
      [f.user],
    ),
  );
  await assert.rejects(
    f.db.query("update employer_claims set user_id=$1 where id=$2", [f.admin, f.employerOther]),
  );
  await assert.rejects(
    f.db.query("update service_directory set claimed_by=$1,claimed_at=now()where id=$2", [
      f.user,
      f.directories[2],
    ]),
  );
  await fixtureMemberSession(f.db, f.admin);
  const ownEmployer = (
    await f.db.query("select id from employer_claims where user_id=$1", [f.user])
  ).rows[0].id;
  await assert.rejects(f.db.query("select review_employer_claim($1,true)", [ownEmployer]));
  await fixtureMemberSession(f.db, f.user);
  await assert.rejects(f.db.query("select review_employer_claim($1,false)", [f.employerOther]));
  await f.clear();
  assert.deepEqual(await f.snapshot(), before);
  await f.db.query(
    "update service_directory set phone='208-555-0199',enriched_at=now()where id=$1",
    [f.directories[0]],
  );
  await f.drain(job);
  const business = (
    await f.db.query("select * from service_directory where id=$1", [f.directories[0]])
  ).rows[0];
  assert.equal(business.phone, "208-555-0199");
  assert.equal(business.phone_digits, "2085550199");
  assert.equal(business.claimed_by, null);
});

test("claim approval commits atomically, rejects hidden and already-assigned businesses, and derives the active administrator", async (t) => {
  const f = await fixture(t);
  const claim = async (directory, user = f.other) =>
    (
      await f.db.query(
        "insert into service_directory_claims(directory_id,user_id,contact,role)values($1,$2,'Private fixture contact','Manager')returning id",
        [directory, user],
      )
    ).rows[0].id;
  const hiddenClaim = await claim(f.directories[2]);
  await f.db.query("update service_directory set hidden=true where id=$1", [f.directories[2]]);
  await fixtureMemberSession(f.db, f.admin);
  await assert.rejects(f.db.query("select review_service_directory_claim($1,true)", [hiddenClaim]));
  assert.equal(
    (await f.db.query("select status from service_directory_claims where id=$1", [hiddenClaim]))
      .rows[0].status,
    "pending",
  );
  await f.db.query("update service_directory set hidden=false where id=$1", [f.directories[2]]);
  await fixtureMemberSession(f.db, f.other);
  await assert.rejects(f.db.query("select review_service_directory_claim($1,true)", [hiddenClaim]));
  await fixtureMemberSession(f.db, f.admin);
  assert.equal(
    (await f.db.query("select review_service_directory_claim($1,true)r", [hiddenClaim])).rows[0].r,
    true,
  );
  assert.equal(
    (await f.db.query("select claimed_by from service_directory where id=$1", [f.directories[2]]))
      .rows[0].claimed_by,
    f.other,
  );
  assert.equal(
    (
      await f.db.query("select reviewed_by from service_directory_claims where id=$1", [
        hiddenClaim,
      ])
    ).rows[0].reviewed_by,
    f.admin,
  );
  assert.equal(
    (await f.db.query("select review_service_directory_claim($1,true)r", [hiddenClaim])).rows[0].r,
    false,
  );
  await f.clear();
  const losingClaim = await claim(f.directories[2], f.user);
  await fixtureMemberSession(f.db, f.admin);
  await assert.rejects(f.db.query("select review_service_directory_claim($1,true)", [losingClaim]));
  assert.equal(
    (await f.db.query("select status from service_directory_claims where id=$1", [losingClaim]))
      .rows[0].status,
    "pending",
  );
});

test("permissions, schema drift, forged cleanup context and stale leases stop claim erasure without partial changes", async (t) => {
  const f = await fixture(t),
    job = await f.start(),
    before = await f.snapshot();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    try {
      await assert.rejects(f.step(job), (e) => e.code === "42501");
    } finally {
      await f.db.exec("reset role");
    }
  }
  for (const mutation of [
    "alter table employer_claims disable trigger account_deletion_business_claim_writer",
    "create table synthetic_claim_child(id uuid primary key,claim_id uuid references employer_claims(id)on delete cascade)",
    "alter table service_directory_claims add column unexpected_private text",
    "grant execute on function purge_account_deletion_business_claims(uuid,uuid,uuid,integer)to authenticated",
    "update account_deletion_controls set worker_enabled=false",
    "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second'",
  ]) {
    await f.db.exec("begin");
    try {
      await f.db.exec(mutation);
      await assert.rejects(f.step(job));
    } finally {
      await f.db.exec("rollback");
    }
    assert.deepEqual(await f.snapshot(), before);
  }
  await f.db.query("select set_config('bluebird.business_claim_cleanup',$1,false)", [
    JSON.stringify({ id: job.id, user: f.user, lease: randomUUID() }),
  ]);
  await assert.rejects(f.db.query("delete from employer_claims where user_id=$1", [f.user]));
  assert.deepEqual(await f.snapshot(), before);
});

test("the actual service adapter resumes a committed cleanup after a lost response without exporting claim text or exposing provider errors", async (t) => {
  const f = await fixture(t),
    job = await f.start();
  let calls = 0;
  const client = createClient("https://fixture.supabase.co", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, options) => {
        calls++;
        assert.equal(new URL(url).pathname, "/rest/v1/rpc/purge_account_deletion_business_claims");
        const args = JSON.parse(options.body);
        assert.deepEqual(Object.keys(args).sort(), ["_id", "_lease", "_limit", "_user"]);
        assert.equal(args._user, f.user);
        assert(options.signal);
        const result = await f.db.query(
          "select purge_account_deletion_business_claims($1,$2,$3,$4)r",
          [args._id, args._user, args._lease, args._limit],
        );
        if (calls === 1)
          return new Response(JSON.stringify({ message: "Sensitive synthetic backend detail" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        return new Response(JSON.stringify(result.rows[0].r), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const component = createAccountDeletionBusinessClaimErasure(client);
  await assert.rejects(
    component.step(job, AbortSignal.timeout(15000)),
    (e) => e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await f.db.query("select claimed_by from service_directory where id=$1", [f.directories[0]]))
      .rows[0].claimed_by,
    null,
  );
  for (let n = 0; n < 10; n++)
    if ((await component.step(job, AbortSignal.timeout(15000))).passDone) break;
  assert.deepEqual(await component.step(job, AbortSignal.timeout(15000)), {
    source: null,
    mode: null,
    changed: 0,
    passDone: true,
  });
  const before = calls;
  await assert.rejects(
    component.step({ ...job, phase: "identity" }, AbortSignal.timeout(15000)),
    (e) => e.code === "records_unavailable",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    component.step(job, controller.signal),
    (e) => e.code === "records_unavailable",
  );
  assert.equal(calls, before);
});
