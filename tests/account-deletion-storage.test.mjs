import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  storageAccessDatabase,
  storageWriterMigration,
} from "./helpers/account-deletion-storage-database.mjs";

async function member(db) {
  const user = randomUUID(),
    session = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session, user]);
  return { user, session };
}
async function asMember(db, { user, session }) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "authenticated", sub: user, session_id: session }),
  ]);
  await db.exec("set role authenticated");
}
async function reset(db) {
  await db.exec("reset role;select set_config('request.jwt.claims','{}',false)");
}
const denied = /Account access is unavailable|row-level security policy/;
const coverage = async (db) => (await db.query("select account_access_coverage() c")).rows[0].c;
const clean = { unguarded_functions: 0, unguarded_tables: 0, helper_privilege_gaps: 0 };

test("active file access retains folder ownership and the worker stays disabled", async () => {
  const db = await storageAccessDatabase();
  try {
    const owner = await member(db),
      other = await member(db),
      path = `${owner.user}/photo.jpg`;
    await asMember(db, owner);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
      path,
    ]);
    assert.equal((await db.query("select name from storage.objects")).rows[0].name, path);
    await db.query("update storage.objects set name=$2 where name=$1", [
      path,
      `${owner.user}/renamed.jpg`,
    ]);
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
        `${other.user}/forbidden.jpg`,
      ]),
      denied,
    );
    await reset(db);
    await asMember(db, other);
    assert.equal((await db.query("select name from storage.objects")).rows.length, 0);
    await reset(db);
    assert.deepEqual(await coverage(db), clean);
    assert.equal(
      (await db.query("select worker_enabled from account_deletion_controls")).rows[0]
        .worker_enabled,
      false,
    );
  } finally {
    await db.close();
  }
});

test("deletion-pending and revoked sessions cannot use direct file access while another member can", async () => {
  const db = await storageAccessDatabase();
  try {
    const owner = await member(db),
      other = await member(db),
      path = `${owner.user}/photo.jpg`;
    await asMember(db, owner);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
      path,
    ]);
    await reset(db);
    await db.query("select mobile_request_deletion($1)", [owner.user]);
    await asMember(db, owner);
    assert.equal((await db.query("select name from storage.objects")).rows.length, 0);
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
        `${owner.user}/late.jpg`,
      ]),
      denied,
    );
    assert.equal((await db.query("delete from storage.objects returning name")).rows.length, 0);
    await reset(db);
    await asMember(db, other);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
      `${other.user}/photo.jpg`,
    ]);
    await reset(db);
    await db.query("delete from auth.sessions where id=$1", [other.session]);
    await asMember(db, other);
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
        `${other.user}/late.jpg`,
      ]),
      denied,
    );
  } finally {
    await db.close();
  }
});

test("Storage writers reject an older retained transaction snapshot", async () => {
  const db = await storageAccessDatabase();
  try {
    const owner = await member(db);
    await asMember(db, owner);
    for (const isolation of ["repeatable read", "serializable"]) {
      await db.exec(`begin isolation level ${isolation}`);
      await assert.rejects(
        db.query("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [
          `${owner.user}/${isolation}.jpg`,
        ]),
        denied,
      );
      await db.exec("rollback");
    }
  } finally {
    await db.close();
  }
});

test("policy drift blocks the existing worker boundary and repair keeps the stronger writer check", async () => {
  const db = await storageAccessDatabase();
  try {
    await db.exec(
      "alter policy bluebird_account_session_boundary on storage.objects with check ((select public.account_current_session_active()))",
    );
    assert.equal((await coverage(db)).unguarded_tables, 1);
    await assert.rejects(
      db.query("select protect_account_access_boundaries()"),
      /policy requires review/,
    );
    await db.exec("drop policy bluebird_account_session_boundary on storage.objects");
    assert.equal((await coverage(db)).unguarded_tables, 1);
    await db.exec("select protect_account_access_boundaries()");
    const expression = (
      await db.query(
        "select pg_get_expr(polwithcheck,polrelid) expression from pg_policy where polrelid='storage.objects'::regclass and polname='bluebird_account_session_boundary'",
      )
    ).rows[0].expression;
    assert(expression.includes("account_storage_writer_allowed"));
    assert.deepEqual(await coverage(db), clean);
  } finally {
    await db.close();
  }
});

test("ordinary grants cannot expose the writer check to guests or create a privileged deletion bypass", async () => {
  const db = await storageAccessDatabase();
  try {
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select public.account_storage_writer_allowed()"),
      /permission denied/,
    );
    await db.exec("reset role;set role service_role");
    await assert.rejects(
      db.query("select public.account_storage_writer_allowed()"),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.deepEqual(await coverage(db), clean);
  } finally {
    await db.close();
  }
});

test("storage safeguard installation refuses an enabled worker", async () => {
  const db = await storageAccessDatabase({ applyMigration: false });
  try {
    await db.exec("update account_deletion_controls set worker_enabled=true");
    await assert.rejects(db.exec(storageWriterMigration()), /Review disabled worker/);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regprocedure('public.account_storage_writer_allowed()') f"))
        .rows[0].f,
      null,
    );
  } finally {
    await db.close();
  }
});

test("installation preserves an unexpectedly changed account-boundary installer for review", async () => {
  const db = await storageAccessDatabase({ applyMigration: false });
  try {
    await db.exec(
      "create or replace function protect_account_access_boundaries() returns jsonb language sql security definer as $$select '{}'::jsonb$$",
    );
    assert.deepEqual(await coverage(db), clean);
    await assert.rejects(
      db.exec(storageWriterMigration()),
      /Review changed account boundary installer/,
    );
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regprocedure('public.account_storage_writer_allowed()') f"))
        .rows[0].f,
      null,
    );
    assert.deepEqual(
      (await db.query("select protect_account_access_boundaries() c")).rows[0].c,
      {},
    );
  } finally {
    await db.close();
  }
});
