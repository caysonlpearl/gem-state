import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  profileDatabase,
  profileMigration,
} from "./helpers/account-deletion-profiles-database.mjs";
import { createAccountDeletionProfileErasure } from "../src/lib/account-deletion-profiles.server.ts";

const signal = () => AbortSignal.timeout(15000);
async function setup(t, { many = 1, avatars = true, install = true } = {}) {
  const db = await profileDatabase({ install });
  t.after(() => db.close());
  const user = randomUUID(),
    other = randomUUID(),
    profile = randomUUID(),
    foreignProfile = randomUUID(),
    park = randomUUID();
  await db.query("insert into auth.users(id)values($1),($2)", [user, other]);
  for (const [id, p] of [
    [user, profile],
    [other, foreignProfile],
  ]) {
    await db.query("insert into profiles(id,display_name,avatar_url)values($1,$2,$3)", [
      id,
      id === user ? "Synthetic target" : "Synthetic other",
      avatars ? `${id}/avatar.jpg` : null,
    ]);
    await db.query(
      "insert into seller_profiles(user_id,slug,status,bio,ship_from_name,ship_from_phone,ship_from_line1)values($1,$2,'active','Synthetic bio','Synthetic name','555-0100','Synthetic street')",
      [id, "fixture-" + id.slice(0, 16)],
    );
    await db.query(
      "insert into shopper_service_profiles(id,shopper_id,bio,avatar_url)values($1,$2,'Synthetic service',$3)",
      [p, id, avatars ? `${id}/service.jpg` : null],
    );
  }
  await db.query("insert into parks(id)values($1)", [park]);
  for (let i = 0; i < many; i++)
    await db.query("insert into shopper_coverage(profile_id,park_id)values($1,$2)", [
      profile,
      park,
    ]);
  await db.query("insert into shopper_coverage(profile_id,park_id)values($1,$2)", [
    foreignProfile,
    park,
  ]);
  const start = async ({ inventory = true } = {}) => {
    await db.query("select public.mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (await db.query("select * from public.claim_account_deletion()")).rows[0];
    assert.equal(job.user_id, user);
    if (inventory) {
      for (let i = 0; i < 100; i++) {
        const p = (
          await db.query(
            "select public.scan_account_deletion_media_inventory($1,$2,$3,50) result",
            [job.id, user, job.lease_token],
          )
        ).rows[0].result;
        if (p.pass_done) break;
        if (i === 99) throw Error("Fixture inventory exceeded bound");
      }
    }
    // Earlier media/provider phases are intentionally not claimed as tested.
    // Set a synthetic records lease to exercise this component alone.
    job.phase = "records";
    await db.query("update account_deletion_jobs set phase='records' where id=$1", [job.id]);
    return job;
  };
  const calls = [];
  let loseAck = false;
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
            ["purge_account_deletion_profiles", "verify_account_deletion_profiles"].includes(name),
          );
          calls.push({ name, args, signal: req.signal });
          let value;
          await db.exec("set role service_role");
          try {
            value = (
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
            throw Error("Synthetic private provider diagnostic");
          }
          return new Response(JSON.stringify(value), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const snapshot = async () =>
    JSON.stringify(
      (
        await db.query(`select
  (select jsonb_agg(to_jsonb(p)order by id) from profiles p) profiles,
  (select jsonb_agg(to_jsonb(p)order by user_id) from seller_profiles p) sellers,
  (select jsonb_agg(to_jsonb(p)order by id) from shopper_service_profiles p) services,
  (select jsonb_agg(to_jsonb(p)order by id) from shopper_coverage p) coverage`)
      ).rows,
    );
  return {
    db,
    user,
    other,
    profile,
    foreignProfile,
    start,
    snapshot,
    calls,
    component: createAccountDeletionProfileErasure(client),
    loseNextAck: () => {
      loseAck = true;
    },
  };
}
const failed = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
async function purgeAll(f, job) {
  const pages = [];
  for (let i = 0; i < 20; i++) {
    const page = await f.component.step(job, signal());
    pages.push(page);
    if (page.passDone) return pages;
  }
  throw Error("Profile fixture did not finish");
}

test("owned profile rows and coverage are erased in bounded chunks; real storefront view and other member survive", async (t) => {
  const f = await setup(t, { many: 103 });
  assert.equal((await f.db.query("select count(*)::int n from seller_storefronts")).rows[0].n, 2);
  const job = await f.start(),
    pages = await purgeAll(f, job);
  assert(pages.every((p) => p.deleted > 0 && p.deleted <= 100));
  assert.equal(
    pages.reduce((n, p) => n + p.deleted, 0),
    106,
  );
  assert(pages.some((p) => p.source === "shopper_coverage" && p.deleted === 100));
  assert.equal((await f.db.query("select count(*)::int n from seller_storefronts")).rows[0].n, 1);
  assert.equal(
    (await f.db.query("select user_id from seller_storefronts")).rows[0].user_id,
    f.other,
  );
  assert.equal((await f.db.query("select count(*)::int n from shopper_coverage")).rows[0].n, 1);
  assert.equal(
    (await f.db.query("select count(*)::int n from auth.users")).rows[0].n,
    2,
    "Profile cleanup is not Auth deletion",
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from account_deletion_media_observations")).rows[0].n,
    3,
    "Avatar observations outlive erased profile rows",
  );
  assert(f.calls.every((c) => c.args._user === f.user && c.args._id === job.id));
  assert.deepEqual(await f.component.step(job, signal()), {
    source: null,
    deleted: 0,
    passDone: true,
  });
});

test("missing or changed avatar observations stop before erasure without dropping the last media reference", async (t) => {
  const f = await setup(t),
    job = await f.start({ inventory: false }),
    before = await f.snapshot();
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(await f.snapshot(), before);
  await f.db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
  for (let i = 0; i < 100; i++) {
    const p = (
      await f.db.query("select scan_account_deletion_media_inventory($1,$2,$3,50) r", [
        job.id,
        f.user,
        job.lease_token,
      ])
    ).rows[0].r;
    if (p.pass_done) break;
  }
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  await f.db.query(
    "update account_deletion_media_observations set last_generation=2 where job_id=$1 and source='profiles'",
    [job.id],
  );
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(await f.snapshot(), before);
});

for (const kind of ["seller_payment", "service_payment", "order", "assignment"])
  test(`financial ${kind} remains pending with all profiles and financial records intact`, async (t) => {
    const f = await setup(t, { avatars: false });
    if (kind === "seller_payment")
      await f.db.query(
        "update seller_profiles set stripe_account_id='acct_synthetic'where user_id=$1",
        [f.user],
      );
    if (kind === "service_payment")
      await f.db.query(
        "update shopper_service_profiles set stripe_account_id='acct_synthetic'where shopper_id=$1",
        [f.user],
      );
    if (kind === "order")
      await f.db.query("insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [
        randomUUID(),
        f.user,
        f.other,
      ]);
    if (kind === "assignment")
      await f.db.query(
        `insert into sourcing_assignments values($1,$2,'{"synthetic":"retained"}')`,
        [randomUUID(), f.profile],
      );
    const job = await f.start(),
      before = await f.snapshot();
    await assert.rejects(f.component.step(job, signal()), failed);
    assert.equal(await f.snapshot(), before);
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs where id=$1", [job.id])).rows[0]
        .phase,
      "records",
    );
  });

test("pending and removed members cannot regain profile data, change ownership or gain a new financial dependency", async (t) => {
  const f = await setup(t, { avatars: false }),
    job = await f.start();
  for (const [sql, args] of [
    ["update profiles set display_name='restored'where id=$1", [f.user]],
    ["update seller_profiles set bio='restored'where user_id=$1", [f.user]],
    ["update shopper_service_profiles set bio='restored'where shopper_id=$1", [f.user]],
    ["insert into shopper_coverage(profile_id,park_id)select $1,id from parks", [f.profile]],
    ["insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [randomUUID(), f.user, f.other]],
  ])
    await assert.rejects(f.db.query(sql, args), /Private account records unavailable/);
  await f.db.query("update seller_profiles set stripe_payouts_enabled=true where user_id=$1", [
    f.user,
  ]);
  await assert.rejects(
    f.db.query("update seller_profiles set stripe_account_id='new_account'where user_id=$1", [
      f.user,
    ]),
    /Private account records unavailable/,
  );
  await assert.rejects(
    f.db.query("update shopper_coverage set profile_id=$1 where profile_id=$2", [
      f.foreignProfile,
      f.profile,
    ]),
    /immutable/,
  );
  await purgeAll(f, job);
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await assert.rejects(
    f.db.query("insert into seller_profiles(user_id,slug)values($1,'restored')", [f.user]),
    /Private account records unavailable/,
  );
});

test("wrong targets, leases, phases, pauses and catalog changes cannot erase profiles", async (t) => {
  const f = await setup(t, { avatars: false }),
    job = await f.start(),
    before = await f.snapshot();
  for (const patch of [{ user_id: f.other }, { lease_token: randomUUID() }, { phase: "media" }])
    await assert.rejects(f.component.step({ ...job, ...patch }, signal()), failed);
  await f.db.exec("update account_deletion_controls set worker_enabled=false");
  await assert.rejects(f.component.step(job, signal()), failed);
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  await f.db.exec(
    "create table synthetic_profile_child(id uuid references profiles(id)on delete cascade)",
  );
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(await f.snapshot(), before);
});

test("lost acknowledgements use remaining rows and the actual SDK sends one request per explicit attempt", async (t) => {
  const f = await setup(t, { avatars: false }),
    job = await f.start();
  f.loseNextAck();
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.db.query("select count(*)::int n from profiles where id=$1", [f.user])).rows[0].n,
    0,
  );
  const pages = await purgeAll(f, job);
  assert(pages.every((p) => p.source !== "profiles"));
});

test("existing financial settlement remains writable while a new order or participant replacement is refused", async (t) => {
  const f = await setup(t, { avatars: false }),
    id = randomUUID();
  await f.db.exec("alter table orders add column synthetic_settled boolean default false");
  await f.db.query("insert into orders(id,buyer_id,seller_id)values($1,$2,$3)", [
    id,
    f.user,
    f.other,
  ]);
  await f.start();
  await f.db.query("update orders set synthetic_settled=true where id=$1", [id]);
  assert.equal(
    (await f.db.query("select synthetic_settled from orders where id=$1", [id])).rows[0]
      .synthetic_settled,
    true,
  );
  await assert.rejects(
    f.db.query("update orders set buyer_id=$1 where id=$2", [f.other, id]),
    /Private account records unavailable/,
  );
  assert.equal(
    (await f.db.query("select buyer_id from orders where id=$1", [id])).rows[0].buyer_id,
    f.user,
  );
});

test("verification is read-only, requires Auth absence and refuses residual orphan seller profiles", async (t) => {
  const f = await setup(t, { avatars: false }),
    job = await f.start({ inventory: false });
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  const before = await f.snapshot();
  await assert.rejects(
    f.component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  assert.equal(await f.snapshot(), before);
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  await f.db.query("delete from auth.users where id=$1", [f.user]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    f.component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  await assert.rejects(
    f.db.query(
      "update account_deletion_jobs set status='completed',phase='completed',completed_at=clock_timestamp(),lease_token=null,lease_until=null,user_id=null where id=$1",
      [job.id],
    ),
    /Account profiles remain/,
  );
  await f.db.query("update account_deletion_jobs set phase='identity'where id=$1", [job.id]);
  await purgeAll(f, { ...job, phase: "identity" });
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});

test("migration refuses an active worker or unknown delete hooks atomically; private RPCs cannot be called by guests or members", async (t) => {
  const f = await setup(t, { install: false });
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  await assert.rejects(f.db.exec(profileMigration()), /prerequisites/);
  await f.db.exec("rollback");
  assert.equal(
    (
      await f.db.query(
        "select to_regprocedure('public.purge_account_deletion_profiles(uuid,uuid,uuid,text,integer)') r",
      )
    ).rows[0].r,
    null,
  );
  await f.db.exec("update account_deletion_controls set worker_enabled=false");
  await f.db.exec(
    "create trigger unexpected_delete before delete on profiles for each row execute function set_updated_at()",
  );
  await assert.rejects(f.db.exec(profileMigration()), /profile hooks/);
  await f.db.exec("rollback");
  await f.db.exec("drop trigger unexpected_delete on profiles");
  await f.db.exec(
    "create table synthetic_profile_link(profile_id uuid references profiles(id)on delete cascade)",
  );
  await assert.rejects(f.db.exec(profileMigration()), /profile child relationships/);
  await f.db.exec("rollback");
  await f.db.exec("drop table synthetic_profile_link");
  await f.db.exec(profileMigration());
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(
      f.db.query("select public.purge_account_deletion_profiles($1,$2,$3,$4,100)", [
        randomUUID(),
        f.user,
        randomUUID(),
        "records",
      ]),
      /permission denied/,
    );
    await f.db.exec("reset role");
  }
  await f.db.exec("set role service_role");
  await assert.rejects(
    f.db.exec("update account_deletion_profile_contract set catalog='{}'"),
    /permission denied/,
  );
  await f.db.exec("reset role");
});

test("the SDK adapter freezes identity, rejects private extra fields and stops pre-cancelled work before transport", async () => {
  const original = {
    id: randomUUID(),
    user_id: randomUUID(),
    lease_token: randomUUID(),
    phase: "records",
    lease_until: new Date(Date.now() + 60000).toISOString(),
  };
  let calls = 0,
    release,
    started;
  const ready = new Promise((r) => {
    started = r;
  });
  const client = createClient(
    "https://udxxfuticbxwiehoepeg.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          calls++;
          const request = new Request(input, init);
          const args = await request.json();
          return await new Promise((r) => {
            release = (value) =>
              r(
                new Response(JSON.stringify(value), {
                  headers: { "content-type": "application/json" },
                }),
              );
            started(args);
          });
        },
      },
    },
  );
  const component = createAccountDeletionProfileErasure(client),
    job = { ...original },
    work = component.step(job, signal());
  const args = await ready;
  job.user_id = randomUUID();
  job.lease_token = randomUUID();
  release({ source: "profiles", deleted: 1, pass_done: false });
  assert.equal((await work).deleted, 1);
  assert.equal(args._user, original.user_id);
  assert.equal(args._lease, original.lease_token);
  assert.equal(calls, 1);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(component.step(original, cancelled.signal), failed);
  assert.equal(calls, 1);
  const secondReady = new Promise((r) => {
    started = r;
  });
  const extra = component.step(original, signal());
  // The second transport installs its own response resolver before signalling.
  await secondReady;
  release({ source: "profiles", deleted: 1, pass_done: false, private: "DO NOT EXPOSE" });
  await assert.rejects(extra, failed);
  assert.equal(calls, 2);
});
