import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  sightingsDatabase,
  sightingsMigration,
} from "./helpers/account-deletion-sightings-database.mjs";
import { seedCatalog } from "./helpers/account-deletion-catalog-database.mjs";
import {
  submissionRecordsDatabase,
  submissionRecordsMigration,
} from "./helpers/account-deletion-submission-records-database.mjs";
import { fixtureMemberSession } from "./helpers/account-deletion-owned-listings-database.mjs";
import { createAccountDeletionSightingErasure } from "../src/lib/account-deletion-sightings.server.ts";
async function setup(t) {
  const db = await sightingsDatabase();
  t.after(() => db.close());
  const own = await seedCatalog(db),
    other = await seedCatalog(db);
  const resort = (
    await db.query(
      "insert into resorts(id,code,name)values(gen_random_uuid(),'SYN','Synthetic resort')returning id",
    )
  ).rows[0].id;
  const park = (
    await db.query(
      "insert into parks(id,name,resort_id)values(gen_random_uuid(),'Synthetic park',$1)returning id",
      [resort],
    )
  ).rows[0].id;
  const location = (
    await db.query(
      "insert into locations(id,name,park_id)values(gen_random_uuid(),'Synthetic location',$1)returning id",
      [park],
    )
  ).rows[0].id;
  const report = async (owner = own.seller, evidence = null) =>
    (
      await db.query(
        "insert into sightings(reporter_id,variant_id,location_id,seen_at,availability,note,evidence_path)values($1,$2,$3,now(),'in_stock','Original community note',$4)returning id",
        [owner, other.variant, location, evidence],
      )
    ).rows[0].id;
  const respond = async (parent, user = own.seller, kind = "confirm") => {
    await fixtureMemberSession(db, user);
    await db.query("select respond_to_sighting($1,$2)", [parent, kind]);
    await db.exec("select set_config('request.jwt.claims','{}',false)");
  };
  const scan = async (job) => {
    await db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
    for (let i = 0; i < 100; i++) {
      const p = (
        await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)r", [
          job.id,
          own.seller,
          job.lease_token,
        ])
      ).rows[0].r;
      if (p.pass_done) break;
      if (i === 99) throw Error("Inventory did not finish");
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  };
  const start = async ({ inventory = true } = {}) => {
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await db.query("select mobile_request_deletion($1)", [own.seller]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [own.seller],
      )
    ).rows[0];
    if (inventory) await scan(job);
    return job;
  };
  const step = (job, limit = 100) =>
    db
      .query("select purge_account_deletion_sightings($1,$2,$3,$4)r", [
        job.id,
        own.seller,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].r);
  const snap = async () =>
    (
      await db.query(
        "select jsonb_build_object('sightings',(select jsonb_agg(to_jsonb(s)order by id)from sightings s),'responses',(select jsonb_agg(to_jsonb(s)order by id)from sighting_confirmations s))r",
      )
    ).rows[0].r;
  return { db, own, other, location, report, respond, start, scan, step, snap };
}
async function finish(f, job) {
  const pages = [];
  for (let i = 0; i < 100; i++) {
    const p = await f.step(job);
    pages.push(p);
    assert(p.changed <= 100);
    if (p.pass_done) return pages;
  }
  throw Error("Cleanup did not finish");
}
test("owned reports retire more than 200 other responses without deleting their payload or current media evidence", async (t) => {
  const f = await setup(t),
    path = `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/public/ask-evidence/${f.own.seller}/synthetic.jpg`;
  const id = await f.report(f.own.seller, path);
  await f.db.query("insert into auth.users(id)select gen_random_uuid()from generate_series(1,201)");
  await f.db.query(
    "insert into sighting_confirmations(sighting_id,user_id,kind)select $1,id,'confirm'from auth.users where id not in($2,$3,$4,$5)",
    [id, f.own.seller, f.own.buyer, f.other.seller, f.other.buyer],
  );
  const before = (await f.db.query("select * from sighting_confirmations order by id")).rows;
  const job = await f.start(),
    pages = await finish(f, job);
  assert.deepEqual(
    pages.filter((p) => p.source === "retired").map((p) => p.changed),
    [100, 100, 1],
  );
  const after = (await f.db.query("select * from sighting_confirmations order by id")).rows;
  assert(after.every((r) => r.unavailable_at));
  assert.deepEqual(
    after.map((r) => ({ ...r, unavailable_at: null })),
    before.map((r) => ({ ...r, sighting_id: null })),
  );
  assert.equal(
    (await f.db.query("select count(*)::int n from sightings where id=$1", [id])).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source='sightings'",
        [job.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    f.db.query("update sighting_confirmations set kind='flag'where id=$1", [before[0].id]),
    /read-only/,
  );
});
test("real report/respond functions retain other reports and repair confirmation influence in exactly two physical writes", async (t) => {
  const f = await setup(t);
  await fixtureMemberSession(f.db, f.other.seller);
  const id = (
    await f.db.query("select report_sighting($1,$2,'in_stock',1500,'Original public note')id", [
      f.other.variant,
      f.location,
    ])
  ).rows[0].id;
  await f.respond(id);
  await f.respond(id, f.other.buyer);
  const before = (await f.db.query("select * from sightings where id=$1", [id])).rows[0];
  assert.equal(before.confirmation_count, 2);
  const job = await f.start(),
    p = await f.step(job, 2);
  assert.equal(p.changed, 2);
  assert.equal(p.source, "responses");
  const after = (await f.db.query("select * from sightings where id=$1", [id])).rows[0];
  assert.deepEqual(
    { ...after, updated_at: before.updated_at },
    { ...before, confirmation_count: 1 },
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from sighting_confirmations where sighting_id=$1", [
        id,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.db.query(
        "select confirmation_count from variant_sightings_public where sighting_id=$1",
        [id],
      )
    ).rows[0].confirmation_count,
    1,
  );
});
test("moderation, verification and flags require explicit retention and leave source evidence unchanged", async (t) => {
  for (const kind of [
    "own_flag",
    "parent_flag",
    "hidden",
    "verified",
    "trusted_source",
    "verifier_reference",
  ])
    await t.test(kind, async (t) => {
      const f = await setup(t),
        id = await f.report(
          kind === "own_flag" || kind === "verifier_reference" ? f.other.seller : f.own.seller,
        );
      if (kind === "own_flag") await f.respond(id, f.own.seller, "flag");
      if (kind === "parent_flag") await f.respond(id, f.other.seller, "flag");
      if (kind === "hidden") await f.db.query("update sightings set hidden=true where id=$1", [id]);
      if (kind === "verified" || kind === "verifier_reference")
        await f.db.query("update sightings set verified_by=$1,verified_at=now()where id=$2", [
          kind === "verified" ? f.other.seller : f.own.seller,
          id,
        ]);
      if (kind === "trusted_source")
        await f.db.query("update sightings set source_type='receipt_verified'where id=$1", [id]);
      const before = await f.snap(),
        job = await f.start();
      await assert.rejects(f.step(job), /moderation retention/);
      assert.deepEqual(await f.snap(), before);
    });
});
test("current-generation discovery is required and ambiguous bare evidence cannot be assigned a guessed bucket", async (t) => {
  for (const bare of [false, true])
    await t.test(String(bare), async (t) => {
      const f = await setup(t);
      await f.report(
        f.own.seller,
        bare
          ? `${f.own.seller}/synthetic.jpg`
          : `https://udxxfuticbxwiehoepeg.supabase.co/storage/v1/object/public/ask-evidence/${f.own.seller}/synthetic.jpg`,
      );
      const job = await f.start({ inventory: bare });
      await assert.rejects(f.step(job), /requires resolution/);
      if (!bare) {
        await f.scan(job);
        await finish(f, job);
      }
    });
});
test("pending reporters/responders cannot create or restore content, reassign authorship or bypass Auth cleanup", async (t) => {
  const f = await setup(t),
    id = await f.report(),
    other = await f.report(f.other.seller);
  await f.respond(other);
  const job = await f.start();
  for (const [sql, args] of [
    ["update sightings set note='Restored'where id=$1", [id]],
    ["update sightings set reporter_id=$1 where id=$2", [f.other.seller, id]],
    [
      "insert into sighting_confirmations(sighting_id,user_id,kind)values($1,$2,'confirm')",
      [id, f.other.buyer],
    ],
    ["update sighting_confirmations set kind='flag'where user_id=$1", [f.own.seller]],
  ])
    await assert.rejects(f.db.query(sql, args), /unavailable|immutable/i);
  await assert.rejects(
    f.db.query("delete from auth.users where id=$1", [f.own.seller]),
    /foreign key/,
  );
  await finish(f, job);
});
test("ordinary removal preserves surviving responses and cleanup rejects public-view, policy or lease drift", async (t) => {
  const f = await setup(t),
    id = await f.report();
  await f.respond(id, f.other.seller);
  const before = (
    await f.db.query("select * from sighting_confirmations where sighting_id=$1", [id])
  ).rows[0];
  await f.db.query("delete from sightings where id=$1", [id]);
  const after = (await f.db.query("select * from sighting_confirmations where id=$1", [before.id]))
    .rows[0];
  assert(after.unavailable_at);
  assert.deepEqual({ ...after, unavailable_at: null }, { ...before, sighting_id: null });
  const job = await f.start();
  await f.db.exec("alter view variant_sightings_public set(security_barrier=true)");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("alter view variant_sightings_public reset(security_barrier)");
  await f.db.exec("create policy unexpected_sighting_policy on sightings for select using(true)");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("drop policy unexpected_sighting_policy on sightings");
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
});
test("service-only SDK sanitizes lost acknowledgments and independently verifies Auth absence", async (t) => {
  const f = await setup(t);
  await f.report();
  const job = await f.start();
  let lost = true,
    calls = 0;
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
          calls++;
          assert(
            ["purge_account_deletion_sightings", "verify_account_deletion_sightings"].includes(
              name,
            ),
          );
          await f.db.exec("set role service_role");
          let value;
          try {
            value = (
              await f.db.query(
                `select ${name}(${Object.values(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")})r`,
                Object.values(args),
              )
            ).rows[0].r;
          } finally {
            await f.db.exec("reset role");
          }
          if (lost) {
            lost = false;
            throw Error("Private fixture diagnostic");
          }
          return new Response(JSON.stringify(value), {
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const component = createAccountDeletionSightingErasure(client),
    signal = () => AbortSignal.timeout(15000);
  await assert.rejects(
    component.step(job, signal()),
    (e) => e.code === "records_unavailable" && !e.cause && e.message === "records_unavailable",
  );
  assert.equal(calls, 1);
  assert.equal((await component.step(job, signal())).passDone, true);
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec("set role " + role);
    await assert.rejects(f.step(job), /permission denied/);
    await f.db.exec("reset role");
  }
  for (const name of ["listings", "catalog"])
    for (let i = 0; i < 100; i++) {
      const p = (
        await f.db.query(`select purge_account_deletion_${name}($1,$2,$3,100)r`, [
          job.id,
          f.own.seller,
          job.lease_token,
        ])
      ).rows[0].r;
      if (p.pass_done) break;
      if (i === 99) throw Error("Subsequent component did not finish");
    }
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  await assert.rejects(
    component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  await f.db.query("delete from auth.users where id=$1", [f.own.seller]);
  assert.equal(await component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("installation rejects an unreviewed incoming cascade", async (t) => {
  const db = await sightingsDatabase({ install: false });
  t.after(() => db.close());
  await db.exec(
    "create table unexpected_sighting_child(id uuid references sightings(id)on delete cascade)",
  );
  await assert.rejects(db.exec(sightingsMigration()), /relationships/);
  await db.exec("rollback");
});
test("installers reject an unexpected existing completion callback before refreshing its contract", async (t) => {
  for (const [name, factory, migration] of [
    ["submissions", submissionRecordsDatabase, submissionRecordsMigration],
    ["sightings", sightingsDatabase, sightingsMigration],
  ])
    await t.test(name, async (t) => {
      const db = await factory({ install: false });
      t.after(() => db.close());
      const before = (
        await db.query("select hooks from account_deletion_private_contract where id")
      ).rows[0].hooks;
      await db.exec(
        "create function unexpected_job_observer()returns trigger language plpgsql as $$begin return new;end$$;create trigger unexpected_job_observer after update on account_deletion_jobs for each row execute function unexpected_job_observer()",
      );
      await assert.rejects(db.exec(migration()), /disabled .* prerequisites/);
      await db.exec("rollback");
      assert.deepEqual(
        (await db.query("select hooks from account_deletion_private_contract where id")).rows[0]
          .hooks,
        before,
      );
    });
});
