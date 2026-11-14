import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadPhotoModules } from "./photo-storage-fixture.mjs";
import { photoWriteIntentDatabase } from "./helpers/photo-write-intent-database.mjs";
import { storageProviderBridge } from "./helpers/account-deletion-storage-provider-database.mjs";
import {
  r2FixtureConfig,
  r2ListXml,
  r2XmlResponse,
} from "./helpers/account-deletion-r2-database.mjs";
const load = loadPhotoModules();
const { createR2PhotoStore } = load("./r2-photo-storage.server");
const { createAccountDeletionMediaInventory } = load("./account-deletion-media-inventory.server");
const { createAccountDeletionReferenceInventory } = load("./account-deletion-inventory.server");
const signal = () => AbortSignal.timeout(15000);
async function setup({ pin = true, path: providedPath } = {}) {
  const db = await photoWriteIntentDatabase(),
    user = randomUUID(),
    config = r2FixtureConfig(),
    store = createR2PhotoStore(config),
    path = providedPath ?? `${user}/planned.jpg`;
  await db.query("insert into auth.users(id) values($1)", [user]);
  if (pin)
    for (const bucket of ["listing-media", "ask-evidence"])
      await db.query("insert into account_deletion_r2_stores values($1,$2)", [
        bucket,
        store.fingerprint(bucket),
      ]);
  const intents = [
    {
      bucket: "ask-evidence",
      path,
      variant: "original",
      sha256: "a".repeat(64),
      bytes: 100,
      storeFingerprint: store.fingerprint("ask-evidence"),
    },
    {
      bucket: "listing-media",
      path,
      variant: "original",
      sha256: "a".repeat(64),
      bytes: 100,
      storeFingerprint: store.fingerprint("listing-media"),
    },
    {
      bucket: "listing-media",
      path,
      variant: "thumbnail",
      sha256: "b".repeat(64),
      bytes: 10,
      storeFingerprint: store.fingerprint("listing-media"),
    },
  ];
  return { db, user, path, config, store, intents };
}
const plan = (f, intents = f.intents) =>
  f.db.query("select plan_private_photo_writes($1) p", [JSON.stringify(intents)]);
async function request(f) {
  await f.db.query("select mobile_request_deletion($1)", [f.user]);
  await f.db.exec("update account_deletion_controls set worker_enabled=true");
  return (await f.db.query("select * from claim_account_deletion()")).rows[0];
}
test("photo planning records originals/thumbnails atomically without publishing a verified receipt or making provider requests", async () => {
  const f = await setup();
  try {
    assert.equal((await plan(f)).rows[0].p, true);
    const before = (
      await f.db.query("select * from private_photo_write_intents order by bucket,variant")
    ).rows;
    assert.equal(before.length, 3);
    assert(before.every((row) => row.path === f.path));
    assert.equal(
      (await f.db.query("select count(*)::int n from photo_object_receipts")).rows[0].n,
      0,
    );
    assert.equal(
      (await f.db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
    assert.equal((await plan(f)).rows[0].p, true);
    assert.deepEqual(
      (await f.db.query("select * from private_photo_write_intents order by bucket,variant")).rows,
      before,
    );
    await assert.rejects(
      plan(f, [{ ...f.intents[0], bytes: 101 }]),
      /Photo write planning unavailable/,
    );
    assert.equal(
      (await f.db.query("select sum(byte_size)::int n from private_photo_write_intents")).rows[0].n,
      210,
    );
  } finally {
    await f.db.close();
  }
});
test("invalid/broadened batches roll back every entry and preserve exact literal filename characters", async () => {
  const f = await setup();
  try {
    const invalid = [
      [],
      [...f.intents, f.intents[0]],
      [f.intents[0], { ...f.intents[1], path: f.path + "-other" }],
      [f.intents[0], { ...f.intents[1], bytes: 52428801 }],
      [{ ...f.intents[2], bytes: 524289 }],
      [{ ...f.intents[0], variant: "thumbnail" }],
      [{ ...f.intents[0], path: "../other.jpg" }],
      [{ ...f.intents[0], path: "folder\\other.jpg" }],
      [{ ...f.intents[0], extra: "not accepted" }],
    ];
    for (const batch of invalid) {
      await assert.rejects(plan(f, batch), /Photo write planning unavailable/);
      assert.equal(
        (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
        0,
      );
    }
    const path = f.user + "/literal%?# name.jpg";
    await plan(f, [{ ...f.intents[1], path }]);
    assert.equal(
      (await f.db.query("select path from private_photo_write_intents")).rows[0].path,
      path,
    );
  } finally {
    await f.db.close();
  }
});
test("new plans and replayed permissions refuse a pending, banned or missing account", async () => {
  for (const mutation of [
    (f) => request(f),
    (f) =>
      f.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [f.user]),
    (f) => f.db.query("delete from auth.users where id=$1", [f.user]),
  ]) {
    const f = await setup();
    try {
      await plan(f);
      await mutation(f);
      await assert.rejects(plan(f), /Photo account is unavailable/);
      assert.equal(
        (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
        3,
      );
    } finally {
      await f.db.close();
    }
  }
});
test("unverified or changed store pins cannot redirect a plan or silently inventory a different physical store", async () => {
  const missing = await setup({ pin: false });
  try {
    await assert.rejects(plan(missing), /Photo write planning unavailable/);
  } finally {
    await missing.db.close();
  }
  const f = await setup();
  try {
    await plan(f);
    await f.db.exec(
      "update account_deletion_r2_stores set store_fingerprint=repeat('f',64) where bucket='listing-media'",
    );
    await assert.rejects(plan(f), /Photo write planning unavailable/);
    const job = await request(f),
      refs = createAccountDeletionReferenceInventory(storageProviderBridge(f.db));
    for (let i = 0; i < 35; i++) {
      if ((await refs.scan(job, signal())).passDone) break;
    }
    await assert.rejects(
      f.db.query("select prepare_account_deletion_r2_inventory($1,$2,$3)", [
        job.id,
        f.user,
        job.lease_token,
      ]),
      /stores require reconciliation/,
    );
  } finally {
    await f.db.close();
  }
});
test("inventory discovers unattached upload plans even when the provider has no committed objects yet", async () => {
  const f = await setup();
  try {
    await plan(f);
    const job = await request(f),
      calls = [];
    const inventory = createAccountDeletionMediaInventory(
      storageProviderBridge(f.db),
      {
        supabase: {
          url: "https://udxxfuticbxwiehoepeg.supabase.co",
          serviceKey: "sb_secret_" + "d".repeat(32),
        },
        r2: f.config,
      },
      async (req) => {
        calls.push(req);
        return r2XmlResponse(r2ListXml(new URL(req.url), []));
      },
    );
    let done = false;
    for (let i = 0; i < 45; i++) {
      const p = await inventory.step(job, signal());
      if (p.stage === "r2_hash_copies" && p.passDone) {
        done = true;
        break;
      }
    }
    assert.equal(done, true);
    assert.equal(calls.length, 3);
    assert(calls.every((req) => req.method === "GET"));
    const tasks = (await f.db.query("select bucket,path,variant from account_deletion_r2_scans"))
      .rows;
    assert.equal(tasks.length, 3);
    assert(tasks.every((t) => t.path === f.path));
    assert.equal(
      (await f.db.query("select count(*)::int n from private_photo_write_intents")).rows[0].n,
      3,
    );
    assert.equal(
      (await f.db.query("select phase from account_deletion_jobs")).rows[0].phase,
      "inventory",
    );
  } finally {
    await f.db.close();
  }
});
test("discovered legacy references reject later plans without guessing that a UUID folder identifies their owner", async () => {
  const f = await setup({ path: "legacy/photo.jpg" });
  try {
    await plan(f);
    const ask = randomUUID();
    await f.db.query("insert into asks(id,seller_id) values($1,$2)", [ask, f.user]);
    await f.db.query("insert into listing_media(id,ask_id,storage_path) values($1,$2,$3)", [
      randomUUID(),
      ask,
      f.path,
    ]);
    const job = await request(f),
      refs = createAccountDeletionReferenceInventory(storageProviderBridge(f.db));
    for (let i = 0; i < 35; i++) {
      if ((await refs.scan(job, signal())).passDone) break;
    }
    await assert.rejects(
      plan(f, [{ ...f.intents[1], sha256: "f".repeat(64) }]),
      /Photo write planning unavailable/,
    );
  } finally {
    await f.db.close();
  }
});
test("write evidence survives Auth removal and blocks a minimal completion receipt until verified cleanup handles it", async () => {
  const f = await setup();
  try {
    await plan(f);
    const job = await request(f);
    await f.db.query("delete from auth.users where id=$1", [f.user]);
    await f.db.exec("update account_deletion_jobs set phase='verification'");
    await assert.rejects(
      f.db.query("select advance_account_deletion($1,$2,'verification',true)", [
        job.id,
        job.lease_token,
      ]),
      /Photo write evidence still needs verified cleanup/,
    );
    const still = (await f.db.query("select status,user_id from account_deletion_jobs")).rows[0];
    assert.equal(still.status, "processing");
    assert.equal(still.user_id, f.user);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(
        f.db.exec("delete from private_photo_write_intents"),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
  } finally {
    await f.db.close();
  }
});
test("members cannot plan writes or read private intent metadata", async () => {
  const f = await setup();
  try {
    for (const role of ["anon", "authenticated"]) {
      await f.db.exec(`set role ${role}`);
      await assert.rejects(plan(f), /permission denied/);
      await assert.rejects(
        f.db.exec("select * from private_photo_write_intents"),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
  } finally {
    await f.db.close();
  }
});
