import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import { shoppingErasureDatabase } from "./helpers/account-deletion-shopping-database.mjs";
import { storageProviderBridge } from "./helpers/account-deletion-storage-provider-database.mjs";
const { createAccountDeletionShoppingErasure } = loadPhotoModules()(
  "./account-deletion-shopping.server",
);
const signal = () => AbortSignal.timeout(15000);
const unavailable = (e) =>
  e.code === "records_unavailable" && e.message === "records_unavailable" && !e.cause;
const sources = [
  "shopping_events",
  "shopping_choices",
  "shopping_favorites",
  "shopping_experiments",
  "shopping_ad_outbox",
  "shopping_privacy",
];
async function setup({ many = 1, after, manual = false, finance = true } = {}) {
  const db = await shoppingErasureDatabase(),
    user = randomUUID(),
    other = randomUUID(),
    guest = "g:" + randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
  for (const [subject, owner, n] of [
    ["u:" + user, user, many],
    ["u:" + other, other, 1],
    [guest, null, 1],
  ]) {
    await db.query(
      "insert into shopping_privacy(subject,personalization,advertising) values($1,true,true)",
      [subject],
    );
    await db.query("insert into shopping_experiments(subject,holdout) values($1,false)", [subject]);
    for (let i = 0; i < n; i++) {
      const id = randomUUID(),
        listing = "listing-" + i;
      await db.query(
        "insert into shopping_events(id,subject,user_id,session_id,kind,listing_id,context) values($1,$2,$3,$4,'view',$5,$6)",
        [id, subject, owner, randomUUID(), listing, { query: "synthetic shopping intent" }],
      );
      await db.query("insert into shopping_favorites(subject,listing_id) values($1,$2)", [
        subject,
        listing,
      ]);
      await db.query(
        "insert into shopping_choices(subject,listing_id,user_id,dismissed) values($1,$2,$3,true)",
        [subject, listing, owner],
      );
      for (const provider of ["meta", "google"])
        await db.query(
          "insert into shopping_ad_outbox(id,user_id,subject,provider,name,payload) values($1,$2,$3,$4,'view',$5)",
          [id, owner, subject, provider, { private: "synthetic export data" }],
        );
    }
  }
  if (finance) {
    await db.exec(
      "create table synthetic_financial_records(id uuid primary key,user_id uuid references auth.users(id),amount_cents integer)",
    );
    await db.query("insert into synthetic_financial_records values($1,$2,12345)", [
      randomUUID(),
      user,
    ]);
  }
  if (manual) await db.query("insert into account_deletion_jobs(user_id) values($1)", [user]);
  else await db.query("select mobile_request_deletion($1)", [user]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const job = (
    await db.query(
      "update account_deletion_jobs set phase='records',status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes' where user_id=$1 returning *",
      [user],
    )
  ).rows[0];
  const bridge = storageProviderBridge(db, after),
    component = createAccountDeletionShoppingErasure(bridge);
  return { db, job, user, other, guest, component, bridge };
}
async function finish(f) {
  for (let i = 0; i < 60; i++) {
    const p = await f.component.step(f.job, signal());
    assert(p.deleted <= 100);
    assert.equal("done" in p, false);
    if (p.passDone) return p;
  }
  throw Error("Synthetic shopping erasure did not finish");
}
const count = async (f, table, subject) =>
  (await f.db.query(`select count(*)::int n from ${table} where subject=$1`, [subject])).rows[0].n;
test("bounded shopping cleanup removes only the target's private learning/export data and preserves financial fixtures", async () => {
  const f = await setup({ many: 203 });
  try {
    const first = await f.component.step(f.job, signal());
    assert.equal(first.source, "shopping_events");
    assert.equal(first.deleted, 100);
    assert.equal(first.passDone, false);
    assert.equal(await count(f, "shopping_events", "u:" + f.user), 103);
    assert.equal(
      (
        await f.db.query(
          "select advertising,personalization from shopping_privacy where subject=$1",
          ["u:" + f.user],
        )
      ).rows[0].advertising,
      false,
    );
    await finish(f);
    for (const table of sources) {
      assert.equal(await count(f, table, "u:" + f.user), 0);
      assert.equal(await count(f, table, "u:" + f.other), table === "shopping_ad_outbox" ? 2 : 1);
      assert.equal(await count(f, table, f.guest), table === "shopping_ad_outbox" ? 2 : 1);
    }
    assert.equal(
      (await f.db.query("select amount_cents from synthetic_financial_records")).rows[0]
        .amount_cents,
      12345,
    );
    assert.equal((await f.db.query("select count(*)::int n from auth.users")).rows[0].n, 2);
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs")).rows[0].phase,
      "records",
    );
    assert(
      (await f.db.query("select count(*)::int n from shopping_consents where user_id=$1", [f.user]))
        .rows[0].n >= 3,
      "consent retention is a separate reviewed step",
    );
  } finally {
    await f.db.close();
  }
});
test("choice children are erased in bounded chunks before their privacy parent", async () => {
  const f = await setup({ many: 201, manual: true });
  try {
    for (let i = 0; i < 3; i++) await f.component.step(f.job, signal());
    const p = await f.component.step(f.job, signal());
    assert.equal(p.source, "shopping_choices");
    assert.equal(p.deleted, 100);
    assert.equal(await count(f, "shopping_choices", "u:" + f.user), 101);
    assert.equal(await count(f, "shopping_privacy", "u:" + f.user), 1);
    await finish(f);
    assert.equal(await count(f, "shopping_choices", "u:" + f.user), 0);
  } finally {
    await f.db.close();
  }
});
test("lost acknowledgements resume from remaining rows and errors retain no private database details", async () => {
  let lost = false;
  const f = await setup({
    many: 201,
    after: async (name) => {
      if (name === "purge_account_deletion_shopping" && !lost) {
        lost = true;
        throw Error("private@example.invalid ack lost");
      }
    },
  });
  try {
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(await count(f, "shopping_events", "u:" + f.user), 101);
    assert.equal((await f.component.step(f.job, signal())).deleted, 100);
    assert.equal(await count(f, "shopping_events", "u:" + f.user), 1);
    await finish(f);
    assert.equal((await f.component.step(f.job, signal())).deleted, 0);
  } finally {
    await f.db.close();
  }
});
test("shopping collectors cannot recreate deleting members' data, while suppression, other members and guests still work", async () => {
  const f = await setup();
  try {
    for (const sql of [
      "insert into shopping_experiments(subject,holdout) values($1,true) on conflict(subject) do update set holdout=true",
      "insert into shopping_favorites(subject,listing_id) values($1,'new')",
      "insert into shopping_privacy(subject,personalization,advertising) values($1,true,true) on conflict(subject) do update set personalization=true",
    ]) {
      await assert.rejects(
        f.db.query(sql, ["u:" + f.user]),
        /Photo account is unavailable|Shopping account is unavailable/,
      );
    }
    await f.db.query("update shopping_ad_outbox set status='suppressed' where user_id=$1", [
      f.user,
    ]);
    await assert.rejects(
      f.db.query("update shopping_ad_outbox set payload=$2 where user_id=$1", [
        f.user,
        { changed: true },
      ]),
      /Photo account is unavailable/,
    );
    await finish(f);
    await assert.rejects(
      f.db.query("insert into shopping_favorites values($1,'restored')", ["u:" + f.user]),
      /Photo account is unavailable/,
    );
    await f.db.query(
      "insert into shopping_favorites(subject,listing_id) values($1,'other-new'),($2,'guest-new')",
      ["u:" + f.other, f.guest],
    );
    assert.equal(await count(f, "shopping_favorites", "u:" + f.other), 2);
  } finally {
    await f.db.close();
  }
});
test("post-identity cleanup removes a late opt-out tombstone and independent verification never repairs data", async () => {
  const f = await setup({ finance: false });
  try {
    await finish(f);
    await f.db.query(
      "insert into shopping_privacy(subject,personalization,advertising) values($1,false,false)",
      ["u:" + f.user],
    );
    await f.db.exec("update account_deletion_jobs set phase='identity'");
    f.job.phase = "identity";
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    await f.db.query("delete from auth.users where id=$1", [f.user]);
    assert.equal((await f.component.step(f.job, signal())).source, "shopping_privacy");
    await assert.rejects(
      f.db.query(
        "insert into shopping_privacy(subject,personalization,advertising) values($1,false,false)",
        ["u:" + f.user],
      ),
      /Shopping account is unavailable/,
    );
    await f.db.exec("update account_deletion_jobs set phase='verification'");
    f.job.phase = "verification";
    assert.equal(await f.component.verify(f.job, signal()), true);
    await f.db.exec(
      "alter table shopping_experiments disable trigger guard_account_deletion_shopping",
    );
    await f.db.query("insert into shopping_experiments(subject,holdout) values($1,false)", [
      "u:" + f.user,
    ]);
    await f.db.exec(
      "alter table shopping_experiments enable trigger guard_account_deletion_shopping",
    );
    await assert.rejects(
      f.component.verify(f.job, signal()),
      (e) => e.code === "verification_failed",
    );
    assert.equal(await count(f, "shopping_experiments", "u:" + f.user), 1);
  } finally {
    await f.db.close();
  }
});
test("stale leases, pauses, wrong phase/account and disabled/modified barriers refuse erasure before changes", async () => {
  const mutations = [
    (f) => f.db.exec("update account_deletion_controls set worker_enabled=false"),
    (f) => f.db.exec("update account_deletion_jobs set lease_token=gen_random_uuid()"),
    (f) =>
      f.db.exec(
        "update account_deletion_jobs set lease_until=clock_timestamp()-interval '1 second'",
      ),
    (f) => f.db.exec("alter table shopping_events disable trigger guard_account_deletion_shopping"),
    (f) =>
      f.db.exec(
        "create or replace function guard_account_deletion_shopping() returns trigger language plpgsql as $$begin return new;end$$",
      ),
    (f) =>
      f.db.exec(
        "create or replace function assert_member_photo_writer(_user uuid) returns void language plpgsql as $$begin return;end$$",
      ),
    (f) =>
      f.db.exec(
        "create or replace trigger guard_account_deletion_shopping before insert or update on shopping_events for each row when(false) execute function guard_account_deletion_shopping()",
      ),
    async (f) => {
      f.job.phase = "media";
    },
    async (f) => {
      f.job.user_id = f.other;
    },
  ];
  for (const mutation of mutations) {
    const f = await setup();
    try {
      await mutation(f);
      await assert.rejects(f.component.step(f.job, signal()), unavailable);
      assert.equal(await count(f, "shopping_events", "u:" + f.user), 1);
    } finally {
      await f.db.close();
    }
  }
});
test("inconsistent historical ownership and new privacy cascades require review instead of deleting other members' rows", async () => {
  const f = await setup();
  try {
    await f.db.exec("alter table shopping_events disable trigger guard_account_deletion_shopping");
    await f.db.query(
      "insert into shopping_events(id,user_id,subject,session_id,kind) values($1,$2,$3,$4,'view')",
      [randomUUID(), f.user, "u:" + f.other, randomUUID()],
    );
    await f.db.exec("alter table shopping_events enable trigger guard_account_deletion_shopping");
    await assert.rejects(f.component.step(f.job, signal()), unavailable);
    assert.equal(await count(f, "shopping_events", "u:" + f.other), 2);
    await f.db.query("delete from shopping_events where user_id=$1 and subject=$2", [
      f.user,
      "u:" + f.other,
    ]);
    await f.db.exec(
      "create table unknown_privacy_child(subject text references shopping_privacy(subject) on delete cascade)",
    );
    await f.db.query("insert into unknown_privacy_child values($1)", ["u:" + f.user]);
    let refused = false;
    for (let i = 0; i < 10; i++) {
      try {
        await f.component.step(f.job, signal());
      } catch (e) {
        assert(unavailable(e));
        refused = true;
        break;
      }
    }
    assert.equal(refused, true);
    assert.equal(
      (await f.db.query("select count(*)::int n from unknown_privacy_child")).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("members cannot call private erasure/helpers, and worker credentials cannot alter the pinned contract", async () => {
  const f = await setup();
  try {
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(
        f.db.query("select purge_account_deletion_shopping($1,$2,$3,'records',100)", [
          f.job.id,
          f.user,
          f.job.lease_token,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        f.db.query("select verify_account_deletion_shopping($1,$2,$3)", [
          f.job.id,
          f.user,
          f.job.lease_token,
        ]),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
    await f.db.exec("set role service_role");
    await assert.rejects(
      f.db.exec("update account_deletion_shopping_contract set guard_definition_md5='changed'"),
      /permission denied/,
    );
    await assert.rejects(
      f.db.query("select account_deletion_shopping_remaining($1)", [f.user]),
      /permission denied/,
    );
    await f.db.exec("reset role");
    const controller = new AbortController();
    controller.abort();
    const before = f.bridge.calls.length;
    await assert.rejects(f.component.step(f.job, controller.signal), unavailable);
    assert.equal(f.bridge.calls.length, before);
  } finally {
    await f.db.close();
  }
});
test("shopping erasure rejects malformed RPC receipts and provider failures without retaining private details", async () => {
  const job = {
    id: randomUUID(),
    user_id: randomUUID(),
    lease_token: randomUUID(),
    phase: "records",
    lease_until: new Date(Date.now() + 60000).toISOString(),
  };
  for (const data of [
    null,
    [],
    { source: "other_table", deleted: 1, pass_done: true },
    { source: "shopping_events", deleted: 101, pass_done: false },
    { source: null, deleted: 1, pass_done: true },
    { source: "shopping_events", deleted: 1, pass_done: "true" },
    { source: "shopping_events", deleted: 1, pass_done: true, private: "not-a-receipt" },
  ]) {
    const component = createAccountDeletionShoppingErasure({
      rpc: () => ({ abortSignal: async () => ({ data, error: null }) }),
    });
    await assert.rejects(component.step(job, signal()), unavailable);
  }
  const component = createAccountDeletionShoppingErasure({
    rpc: () => ({
      abortSignal: async () => {
        throw Error("private@example.invalid database response");
      },
    }),
  });
  await assert.rejects(component.step(job, signal()), unavailable);
  await assert.rejects(
    component.verify({ ...job, phase: "verification" }, signal()),
    (e) => e.code === "verification_failed" && e.message === "verification_failed" && !e.cause,
  );
});
