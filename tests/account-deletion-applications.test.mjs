import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  applicationDatabase,
  seedListing,
  fixtureMemberSession,
  applicationMigration,
  ownedListingDatabase,
} from "./helpers/account-deletion-owned-listings-database.mjs";
import { createAccountDeletionApplicationErasure } from "../src/lib/account-deletion-applications.server.ts";
const signal = () => AbortSignal.timeout(15000);
const failed = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
async function setup(t, { many = 1, install = true } = {}) {
  const db = await (install ? applicationDatabase() : ownedListingDatabase());
  t.after(() => db.close());
  const f = await seedListing(db);
  await fixtureMemberSession(db, f.buyer);
  const first = (
    await db.query("select submit_job_application($1,$2,'Synthetic private letter')id", [
      f.listing,
      `${f.buyer}/resume.pdf`,
    ])
  ).rows[0].id;
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.exec("select set_config('parkvault.trusted_operation','on',false)");
  if (many > 1) {
    const asks = (
      await db.query(
        "insert into asks(product_id,variant_id,seller_id,price_cents)select $1,$2,$3,123 from generate_series(1,$4)returning id",
        [f.product, f.variant, f.seller, many - 1],
      )
    ).rows.map((r) => r.id);
    await db.query(
      "insert into job_applications(listing_id,applicant_id,resume_path,cover_letter)select id,$2,$3,'Synthetic additional letter'from unnest($1::uuid[])id",
      [asks, f.buyer, `${f.buyer}/additional.pdf`],
    );
  }
  const stranger = randomUUID();
  await db.query("insert into auth.users(id)values($1)", [stranger]);
  await db.query("insert into profiles(id,display_name)values($1,'Unrelated applicant')", [
    stranger,
  ]);
  const other = (
    await db.query(
      "insert into job_applications(listing_id,applicant_id,resume_path,cover_letter)values($1,$2,$3,'Other members letter')returning id",
      [f.listing, stranger, `${stranger}/resume.pdf`],
    )
  ).rows[0].id;
  await db.exec("select set_config('parkvault.trusted_operation','off',false)");
  const start = async (user = f.buyer, { scan = true } = {}) => {
    await db.query("select mobile_request_deletion($1)", [user]);
    await db.exec("update account_deletion_controls set worker_enabled=true");
    const job = (
      await db.query(
        "update account_deletion_jobs set status='processing',phase='inventory',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
        [user],
      )
    ).rows[0];
    if (scan) {
      for (let i = 0; i < 100; i++) {
        const r = (
          await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
            job.id,
            user,
            job.lease_token,
          ])
        ).rows[0].result;
        if (r.pass_done) break;
        if (i === 99) throw Error("Synthetic source scan exceeded bound");
      }
    }
    await db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
    job.phase = "records";
    return job;
  };
  let loseAck = false;
  const calls = [];
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
              "purge_account_deletion_applications",
              "verify_account_deletion_applications",
            ].includes(name),
          );
          calls.push({ name, args });
          await db.exec("set role service_role");
          let result;
          try {
            result = (
              await db.query(
                `select public.${name}(${Object.values(args)
                  .map((_, i) => "$" + (i + 1))
                  .join(",")})result`,
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
      .query("select purge_account_deletion_applications($1,$2,$3,$4)result", [
        job.id,
        job.user_id,
        job.lease_token,
        limit,
      ])
      .then((r) => r.rows[0].result);
  return {
    ...f,
    db,
    first,
    other,
    stranger,
    start,
    step,
    calls,
    component: createAccountDeletionApplicationErasure(client),
    loseAck: () => (loseAck = true),
  };
}
test("SDK application cleanup removes owned resumes references in bounded chunks, preserves others and replays lost acknowledgements", async (t) => {
  const f = await setup(t, { many: 205 }),
    job = await f.start();
  f.loseAck();
  await assert.rejects(f.component.step(job, signal()), failed);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "authored",
    changed: 100,
    passDone: false,
  });
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "authored",
    changed: 5,
    passDone: true,
  });
  assert.deepEqual(await f.component.step(job, signal()), {
    source: null,
    changed: 0,
    passDone: true,
  });
  const rows = (await f.db.query("select applicant_id,cover_letter from job_applications")).rows;
  assert.deepEqual(rows, [{ applicant_id: f.stranger, cover_letter: "Other members letter" }]);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from account_deletion_media_observations where job_id=$1 and source='job_applications'",
        [job.id],
      )
    ).rows[0].n,
    205,
    "Inventory remains durable after references disappear",
  );
  await assert.rejects(
    f.component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed",
  );
  await f.db.query("delete from auth.users where id=$1", [f.buyer]);
  await f.db.query("update account_deletion_jobs set phase='verification'where id=$1", [job.id]);
  assert.equal(await f.component.verify({ ...job, phase: "verification" }, signal()), true);
});
test("deleting employers unlink applications without removing another applicants private letter or resume", async (t) => {
  const f = await setup(t, { many: 205 }),
    before = (await f.db.query("select * from job_applications order by id")).rows,
    job = await f.start(f.seller);
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "listing",
    changed: 100,
    passDone: false,
  });
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "listing",
    changed: 100,
    passDone: false,
  });
  assert.deepEqual(await f.component.step(job, signal()), {
    source: "listing",
    changed: 6,
    passDone: true,
  });
  const after = (await f.db.query("select * from job_applications order by id")).rows;
  assert.deepEqual(
    after.map(({ unavailable_at, ...row }) => ({ ...row, unavailable_at: !!unavailable_at })),
    before.map((row) => ({ ...row, listing_id: null, unavailable_at: true })),
  );
  await assert.rejects(
    f.db.query("update job_applications set status='reviewed'where id=$1", [f.first]),
    /read-only/,
  );
  await f.db.query("delete from auth.users where id=$1", [f.seller]);
  // Minimum SELECT grants exercise the captured participant policies; the
  // disposable fixture starts with conservative service-only table grants.
  await f.db.exec("grant select on job_applications,asks to authenticated");
  for (const member of [f.buyer, f.stranger]) {
    await fixtureMemberSession(f.db, member);
    await f.db.exec("set role authenticated");
    assert.deepEqual(
      (await f.db.query("select id from job_applications order by id")).rows,
      before.filter((row) => row.applicant_id === member).map((row) => ({ id: row.id })),
    );
    await f.db.exec("reset role");
  }
  await f.db.query("select set_config('request.jwt.claims','{}',false)");
  assert.equal(
    (await f.db.query("select count(*)::int n from job_applications")).rows[0].n,
    before.length,
  );
});
test("ordinary listing removal preserves applicant rows and closes their listing links", async (t) => {
  const f = await setup(t),
    before = (await f.db.query("select * from job_applications order by id")).rows;
  await f.db.query("delete from asks where id=$1", [f.listing]);
  const after = (await f.db.query("select * from job_applications order by id")).rows;
  assert.deepEqual(
    after.map(({ unavailable_at, ...row }) => ({ ...row, unavailable_at: !!unavailable_at })),
    before.map((row) => ({ ...row, listing_id: null, unavailable_at: true })),
  );
  const job = await f.start();
  assert.equal((await f.component.step(job, signal())).changed, 1);
});
test("missing, unfinished or stale-generation resume inventory stops erasure before any author content is removed", async (t) => {
  const f = await setup(t),
    job = await f.start(f.buyer, { scan: false });
  await assert.rejects(f.step(job), /inventory/);
  await f.db.query("update account_deletion_jobs set phase='inventory'where id=$1", [job.id]);
  for (let i = 0; i < 100; i++) {
    const r = (
      await f.db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)result", [
        job.id,
        f.buyer,
        job.lease_token,
      ])
    ).rows[0].result;
    if (r.pass_done) break;
  }
  await f.db.query("update account_deletion_jobs set phase='records'where id=$1", [job.id]);
  await f.db.query(
    "update account_deletion_inventory_cursors set done=false where job_id=$1 and source='job_applications'",
    [job.id],
  );
  await assert.rejects(f.step(job), /inventory/);
  await f.db.query(
    "update account_deletion_inventory_cursors set done=true where job_id=$1 and source='job_applications'",
    [job.id],
  );
  await f.db.query(
    "update account_deletion_inventory_runs set generation=generation+1 where job_id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /inventory/);
  assert.equal((await f.db.query("select count(*)::int n from job_applications")).rows[0].n, 2);
});
test("pending applicants or employers cannot receive new applications or change existing private content", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await fixtureMemberSession(f.db, f.seller);
  await assert.rejects(
    f.db.query("select update_job_application_status($1,'reviewed')", [f.first]),
    /unavailable/,
  );
  await f.db.query("select set_config('request.jwt.claims','{}',false)");
  await assert.rejects(
    f.db.query("update job_applications set cover_letter='Changed'where id=$1", [f.first]),
    /unavailable/,
  );
  await assert.rejects(
    f.db.query("update job_applications set applicant_id=$1 where id=$2", [f.stranger, f.first]),
    /immutable/,
  );
  await assert.rejects(f.step({ ...job, user_id: f.stranger }), /unavailable/);
  await assert.rejects(f.step({ ...job, lease_token: randomUUID() }), /unavailable/);
  await assert.rejects(f.step(job, 101), /unavailable/);
  assert.equal((await f.step(job)).pass_done, true);
});
test("schema, policy, hook and lease drift cannot turn an application component into a whole-job completion", async (t) => {
  const f = await setup(t),
    job = await f.start();
  await f.db.exec("alter table job_applications add column unexpected text");
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec("alter table job_applications drop column unexpected");
  await f.db.exec(
    "alter table job_applications disable trigger guard_account_deletion_application_writer",
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec(
    "alter table job_applications enable trigger guard_account_deletion_application_writer",
  );
  await f.db.exec(
    'alter policy "Applicants read their own applications" on job_applications using(true)',
  );
  await assert.rejects(f.step(job), /schema review/);
  await f.db.exec(
    'alter policy "Applicants read their own applications" on job_applications using(applicant_id=auth.uid())',
  );
  await f.db.query(
    "update account_deletion_jobs set lease_until=now()-interval '1 minute'where id=$1",
    [job.id],
  );
  await assert.rejects(f.step(job), /unavailable/);
  assert.equal((await f.db.query("select count(*)::int n from job_applications")).rows[0].n, 2);
});
test("clients cannot invoke application erasure, alter its contract or shortcut the applicant Auth foreign key", async (t) => {
  const f = await setup(t),
    job = await f.start();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.step(job), /permission/);
    await assert.rejects(
      f.db.query("select * from account_deletion_application_contract"),
      /permission/,
    );
    await f.db.exec("reset role");
  }
  await assert.rejects(f.db.query("delete from auth.users where id=$1", [f.buyer]), /foreign key/);
  assert.equal((await f.step(job)).pass_done, true);
  assert.equal(
    (await f.db.query("select status from account_deletion_jobs where id=$1", [job.id])).rows[0]
      .status,
    "processing",
  );
});
test("migration refuses unknown application children instead of allowing unbounded cascades", async (t) => {
  const f = await setup(t, { install: false });
  await f.db.exec(
    "create table unexpected_application_child(id uuid references job_applications(id)on delete cascade)",
  );
  await assert.rejects(f.db.exec(applicationMigration()), /child relationships/);
  await f.db.exec("rollback");
  assert.equal(
    (
      await f.db.query(
        "select to_regprocedure('purge_account_deletion_applications(uuid,uuid,uuid,integer)')name",
      )
    ).rows[0].name,
    null,
  );
});

test("employer inbox applies an owned-listing join even though applicants can read their own submissions", async (t) => {
  const { loadSourceModule } = await import("./helpers/load-source-module.mjs"),
    f = await setup(t),
    requests = [];
  const clientFor = (user) =>
    createClient(
      "https://udxxfuticbxwiehoepeg.supabase.co",
      "sb_secret_synthetic_fixture_only_123456",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            const request = new Request(input, init),
              url = new URL(request.url);
            requests.push(url);
            assert.equal(url.pathname, "/rest/v1/job_applications");
            assert(url.searchParams.get("select").includes("asks!inner(seller_id)"));
            assert.equal(url.searchParams.get("asks.seller_id"), "eq." + user);
            const rows = (
              await f.db.query(
                "select j.*,jsonb_build_object('seller_id',a.seller_id)asks from job_applications j join asks a on a.id=j.listing_id where a.seller_id=$1 order by j.created_at desc",
                [user],
              )
            ).rows;
            return new Response(JSON.stringify(rows), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
      },
    );
  const admin = createClient(
    "https://udxxfuticbxwiehoepeg.supabase.co",
    "sb_secret_synthetic_fixture_only_123456",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(new Request(input, init).url);
          requests.push(url);
          const ids = url.searchParams.get("id")?.slice(4, -1).split(",");
          assert(
            ids?.length && ids.every((id) => /^[a-f0-9-]{36}$/.test(id)),
            "Only real, authorized parent IDs may reach privileged lookup",
          );
          let rows;
          if (url.pathname === "/rest/v1/asks")
            rows = (
              await f.db.query(
                "select a.id,jsonb_build_object('name',p.name)products from asks a join products p on p.id=a.product_id where a.id=any($1::uuid[])",
                [ids],
              )
            ).rows;
          else {
            assert.equal(url.pathname, "/rest/v1/profiles");
            rows = (
              await f.db.query("select id,display_name from profiles where id=any($1::uuid[])", [
                ids,
              ])
            ).rows;
          }
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    },
  );
  const handlers = loadSourceModule("lib/job-applications.functions.ts", {
    "@tanstack/react-start": {
      createServerFn: () => {
        const b = { middleware: () => b, inputValidator: () => b, handler: (fn) => fn };
        return b;
      },
    },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/integrations/supabase/client.server": { supabaseAdmin: admin },
  });
  assert.deepEqual(
    await handlers.getSellerJobApplications({
      context: { userId: f.buyer, supabase: clientFor(f.buyer) },
    }),
    [],
  );
  assert.equal(
    requests.length,
    1,
    "An applicant does not trigger any privileged listing/profile lookups",
  );
  const inbox = await handlers.getSellerJobApplications({
    context: { userId: f.seller, supabase: clientFor(f.seller) },
  });
  assert.equal(inbox.length, 2);
  assert(inbox.every((row) => row.listingId === f.listing));
  await f.db.query("delete from asks where id=$1", [f.listing]);
  const before = requests.length;
  assert.deepEqual(
    await handlers.getSellerJobApplications({
      context: { userId: f.buyer, supabase: clientFor(f.buyer) },
    }),
    [],
  );
  assert.equal(
    requests.length,
    before + 1,
    "Retired submissions never produce a null-ID privileged query",
  );
});

test("unresolved private resume locations remain held even when the discovery cursor finished", async (t) => {
  const f = await setup(t);
  await f.db.query(
    "update job_applications set resume_path='https://foreign.invalid/private?token=synthetic'where id=$1",
    [f.first],
  );
  const job = await f.start();
  await assert.rejects(f.step(job), /inventory/);
  assert.equal((await f.db.query("select count(*)::int n from job_applications")).rows[0].n, 2);
});
