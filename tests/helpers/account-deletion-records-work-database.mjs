import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ledgerActorDatabase,
  seedLedgerActors,
} from "./account-deletion-ledger-actors-database.mjs";
import { createAccountDeletionRecordsWork } from "../../src/lib/account-deletion-records-work.server.ts";
import { createAccountDeletionQueue } from "../../src/lib/account-deletion-queue.server.ts";
import { deletionPhases, runAccountDeletion } from "../../src/lib/account-deletion-worker.ts";

export async function recordsWorkFixture(t, { unknown = false, financial = false, provided } = {}) {
  const db = await ledgerActorDatabase({ provided });
  if (!provided) t.after(() => db.close());
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261114160000_account_deletion_auth_dependencies.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const f = await seedLedgerActors(db, { many: 203 });
  const user = financial ? f.f.buyer : f.user;
  if (!financial)
    await db.query("insert into profiles(id,display_name)values($1,'Synthetic private name')", [
      user,
    ]);
  await db.query(
    "insert into shopping_privacy(subject,personalization,advertising)values($1,true,false)",
    ["u:" + user],
  );
  await db.query(
    "insert into shopping_choices(subject,listing_id,user_id,dismissed)select $1,'synthetic:'||n,$2,true from generate_series(1,103)n",
    ["u:" + user, user],
  );
  await db.query(
    "insert into watchlist(id,user_id,variant_id)select gen_random_uuid(),$1,$2 from generate_series(1,50)",
    [user, f.f.variant],
  );
  for (let n = 0; n < 101; n++)
    await db.query(
      "insert into employer_claims(employer_key,employer_name,user_id,contact,role)values($1,'Synthetic employer',$2,'Synthetic private contact','Manager')",
      ["records-fixture-" + n, user],
    );
  if (unknown) {
    await db.exec(
      "create table public.unhandled_account_records(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,payload text);select protect_account_access_boundaries()",
    );
    await db.query(
      "insert into unhandled_account_records values($1,$2,'Synthetic retained evidence')",
      [randomUUID(), user],
    );
  }
  await db.query("select mobile_request_deletion($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (
    await db.query(
      "update account_deletion_jobs set phase='inventory',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where user_id=$1 returning *",
      [user],
    )
  ).rows[0];
  for (let n = 0; n < 200; n++) {
    const r = (
      await db.query("select scan_account_deletion_media_inventory($1,$2,$3,50)r", [
        job.id,
        user,
        job.lease_token,
      ])
    ).rows[0].r;
    if (r.pass_done) break;
    if (n === 199) throw Error("Synthetic inventory did not finish");
  }
  await db.query(
    "update account_deletion_jobs set phase='records',status='requested',lease_token=null,lease_until=null where id=$1",
    [job.id],
  );
  const calls = [];
  let loseAck = null,
    lastFailure,
    afterRpc;
  const client = createClient("https://disposable.invalid", "fixture-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const name = new URL(String(input)).pathname.split("/").at(-1);
        assert.match(name, /^[a-z_]+$/);
        const args = JSON.parse(init.body || "{}");
        const entry = { name, args, changed: 0 };
        calls.push(entry);
        await db.exec("set role service_role");
        let result;
        try {
          if (name === "claim_account_deletion")
            result = (await db.query("select * from claim_account_deletion()")).rows;
          else
            result = (
              await db.query(
                `select public.${name}(${Object.keys(args)
                  .map((k, i) => {
                    assert.match(k, /^_[a-z_]+$/);
                    return '"' + k + '"=>$' + (i + 1);
                  })
                  .join(",")})r`,
                Object.values(args),
              )
            ).rows[0].r;
          entry.changed = result?.deleted ?? result?.changed ?? 0;
        } catch (error) {
          lastFailure = { name, message: error.message };
          return new Response(JSON.stringify({ message: error.message }), { status: 400 });
        } finally {
          await db.exec("reset role");
        }
        await afterRpc?.(name, args, result);
        if (loseAck === name) {
          loseAck = null;
          return new Response(
            JSON.stringify({ message: "Synthetic private provider diagnostic" }),
            { status: 503 },
          );
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const records = createAccountDeletionRecordsWork(client),
    queue = createAccountDeletionQueue(client);
  const work = Object.fromEntries(
    deletionPhases.map((p) => [
      p,
      async () => {
        throw Error("Unbound phase must not run in this records test");
      },
    ]),
  );
  work.records = records.step;
  const run = async () => {
    const start = calls.length;
    const r = await runAccountDeletion(queue, work);
    const changes = calls.slice(start).filter((c) => c.changed > 0);
    assert(changes.length <= 1, "At most one nonempty component batch per invocation");
    assert(
      changes.reduce((n, c) => n + c.changed, 0) <= 100,
      "At most 100 physical record changes",
    );
    return r;
  };
  const drain = async () => {
    for (let n = 0; n < 40; n++) {
      const result = await run();
      if (result.status === "retry") return { result, lastFailure };
      if (result.status === "advanced") return { result };
      assert.equal(result.status, "continued");
    }
    throw Error("Synthetic records did not drain");
  };
  return {
    db,
    user,
    job,
    f,
    calls,
    queue,
    records,
    run,
    drain,
    afterRpc: (hook) => {
      afterRpc = hook;
    },
    loseAck: (name = "purge_account_deletion_shopping") => {
      loseAck = name;
    },
  };
}
