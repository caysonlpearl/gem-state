import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  appleVaultDatabase,
  appleCaptureFixture,
  vaultMigration,
} from "./helpers/apple-authorization-vault-database.mjs";
import { createAppleTokenVaultCrypto } from "../src/lib/apple-token-vault-crypto.server.ts";
import { DeletionStepError } from "../src/lib/account-deletion-worker.ts";
const coded = (e) =>
  e instanceof DeletionStepError &&
  e.code === "authorization_unavailable" &&
  e.message === e.code &&
  e.cause === undefined;
const count = (f, name) => f.calls.filter((c) => c.name === name).length;

test(
  "Apple credential capture verifies signed subject ownership through the real Auth SDK and private SQL storage",
  { timeout: 90000 },
  async (t) => {
    const db = await appleVaultDatabase();
    t.after(() => db.close());
    const f = await appleCaptureFixture(db),
      capture = f.make();
    await t.test(
      "stores encrypted credentials and a verified, resumable acknowledgement",
      async () => {
        f.loseStoreAck();
        await assert.rejects(f.capture(capture), coded);
        assert.equal(count(f, "apple_token"), 1);
        assert.equal(count(f, "store_verified_apple_authorization"), 1);
        assert.equal(
          (await db.query("select count(*)::int n from apple_authorization_vault")).rows[0].n,
          1,
        );
        assert.deepEqual(await f.capture(capture), { stored: true });
        assert.equal(
          count(f, "apple_token"),
          1,
          "Retry restores verified ciphertext without replaying provider refresh",
        );
        assert.equal(
          count(f, "store_verified_apple_authorization"),
          1,
          "SDK must not automatically replay a mutation after 503",
        );
        const args = f.requests.find((c) => c.name === "store_verified_apple_authorization").args;
        for (const value of [
          f.refreshToken,
          f.accessToken,
          f.subject,
          f.apple.privateKeyPem,
          f.vault.keys.v1,
        ])
          assert(!JSON.stringify(args).includes(value));
        const e = (
          await db.query("select apple_authorization_capture_cached($1,$2,$3,$4,$5)r", [
            f.userId,
            f.sessionId,
            f.apple.clientId,
            args._fingerprint,
            "v1",
          ])
        ).rows[0].r;
        const value = await createAppleTokenVaultCrypto(f.vault).open(
          e,
          new AbortController().signal,
        );
        assert.equal(value.refreshToken, f.refreshToken);
        assert.equal(value.subject, f.subject);
        assert.deepEqual(
          (
            await db.query(
              "select apple_authorization_vault_current()v,account_deletion_private_barrier_current()p,account_deletion_ledger_actor_barrier_current()l",
            )
          ).rows[0],
          { v: true, p: true, l: true },
        );
      },
    );
    await t.test(
      "corrupted retained credentials never report success or fall back to manual revocation",
      async () => {
        await db.exec("begin");
        f.inTransaction(true);
        await db.query(
          "update apple_authorization_vault set ciphertext=decode(repeat('00',32),'hex')where user_id=$1",
          [f.userId],
        );
        await assert.rejects(f.capture(capture), coded);
        await db.exec("rollback");
        f.inTransaction(false);
      },
    );
    await t.test(
      "a stale verified envelope is revalidated without duplicating its credential",
      async () => {
        await db.query(
          "update apple_authorization_vault set verified_at=clock_timestamp()-interval '25 hours'where user_id=$1",
          [f.userId],
        );
        assert.deepEqual(await f.capture(capture), { stored: true });
        assert.equal(count(f, "apple_token"), 2);
        assert.equal(
          (await db.query("select count(*)::int n from apple_authorization_vault")).rows[0].n,
          1,
        );
      },
    );
  },
);

test(
  "Apple capture fails closed on invalid proofs, uncertain identity ownership and live permission changes",
  { timeout: 120000 },
  async (t) => {
    const db = await appleVaultDatabase();
    t.after(() => db.close());
    const f = await appleCaptureFixture(db);
    async function isolated(name, run) {
      await t.test(name, async () => {
        await db.exec("begin");
        f.inTransaction(true);
        try {
          await run();
        } finally {
          await db.exec("rollback");
          f.inTransaction(false);
          f.adminPatch(undefined);
          f.claimsPatch(undefined);
          f.tokenPatch(undefined);
          f.keyPatch(undefined);
          f.onToken(undefined);
          f.afterRpc(undefined);
        }
      });
    }
    await isolated("same email on another Apple subject is not account ownership", async () => {
      f.claimsPatch((c) => ({ ...c, sub: "another-apple-account" }));
      await assert.rejects(f.capture(), coded);
      assert.equal(
        (await db.query("select count(*)::int n from apple_authorization_vault")).rows[0].n,
        0,
      );
    });
    await isolated(
      "untrusted metadata, malformed or cross-account Auth identities cannot establish ownership",
      async () => {
        for (const patch of [
          (u) => ({ ...u, identities: [] }),
          (u) => ({ ...u, identities: u.identities.map((i) => ({ ...i, user_id: randomUUID() })) }),
          (u) => ({ ...u, identities: u.identities.map((i) => ({ ...i, identity_id: i.id })) }),
          (u) => ({
            ...u,
            identities: u.identities.map((i) => ({ ...i, identity_data: { sub: "wrong" } })),
          }),
          (u) => ({ ...u, id: randomUUID() }),
          (u) => ({ ...u, identities: [...u.identities, ...u.identities] }),
        ]) {
          f.adminPatch(patch);
          const prior = count(f, "apple_token");
          await assert.rejects(f.capture(), coded);
          assert.equal(count(f, "apple_token"), prior);
        }
      },
    );
    await isolated(
      "wrong issuer, audience, timestamps and access-token hash fail without a storage write",
      async () => {
        for (const patch of [
          (c) => ({ ...c, iss: "https://account.apple.com" }),
          (c) => ({ ...c, aud: "com.other.app" }),
          (c) => ({ ...c, aud: [f.apple.clientId, "com.other.app"] }),
          (c) => ({ ...c, exp: c.iat - 60 }),
          (c) => ({ ...c, iat: c.iat + 120 }),
          (c) => ({ ...c, at_hash: "wrong" }),
          (c) => ({ ...c, sub: undefined }),
          (c) => ({ ...c, exp: undefined }),
        ]) {
          f.claimsPatch(patch);
          const prior = count(f, "store_verified_apple_authorization");
          await assert.rejects(f.capture(), coded);
          assert.equal(count(f, "store_verified_apple_authorization"), prior);
        }
        f.claimsPatch(undefined);
        const h = randomBytes(16).toString("base64url");
        f.claimsPatch((c) => ({ ...c, at_hash: h }));
        await assert.rejects(f.capture(), coded);
      },
    );
    await isolated(
      "tampered signature, missing signing key and malformed provider response fail without token leakage",
      async () => {
        for (const patch of [
          (d) => ({ ...d, id_token: d.id_token.slice(0, -8) + "AAAAAAAA" }),
          (d) => ({ ...d, token_type: "bearer" }),
          (d) => ({ ...d, refresh_token: "unexpected-rotated-token" }),
          (d) => ({ ...d, expires_in: 0 }),
          (d) => ({ ...d, error: "private_provider_reason" }),
          (d) => ({ ...d, access_token: "private\nsecret" }),
        ]) {
          f.tokenPatch(patch);
          await assert.rejects(f.capture(), coded);
        }
        f.tokenPatch(undefined);
        f.keyPatch((d) => ({ keys: d.keys.map((k) => ({ ...k, kid: "other-key" })) }));
        await assert.rejects(f.capture(), coded);
      },
    );
    await isolated(
      "a link removed during the provider exchange cannot store credentials",
      async () => {
        f.onToken(async () => {
          await db.query("delete from auth.identities where id=$1", [f.identityId]);
        });
        await assert.rejects(f.capture(), coded);
        assert.equal(
          (await db.query("select count(*)::int n from apple_authorization_vault")).rows[0].n,
          0,
        );
      },
    );
    await isolated(
      "logout and a deletion request during refresh both prevent the final store",
      async () => {
        for (const sql of [
          "delete from auth.sessions where id=$1",
          "select mobile_request_deletion($1)",
        ]) {
          await db.exec("savepoint permission_change");
          f.onToken(async () => {
            await db.query(sql, [sql.startsWith("delete") ? f.sessionId : f.userId]);
          });
          await assert.rejects(f.capture(), coded);
          assert.equal(
            (await db.query("select count(*)::int n from apple_authorization_vault")).rows[0].n,
            0,
          );
          await db.exec(
            "rollback to savepoint permission_change;release savepoint permission_change",
          );
        }
      },
    );
    await isolated(
      "cancellation and failed/oversized provider responses cause one attempt and no implicit retry",
      async () => {
        const controller = new AbortController();
        controller.abort("private reason");
        const prior = count(f, "apple_token");
        await assert.rejects(f.capture(f.make(), controller.signal), coded);
        assert.equal(count(f, "apple_token"), prior);
        for (const response of [
          () => new Response("private response", { status: 503 }),
          () => new Response("{}", { headers: { "content-type": "text/html" } }),
          () =>
            new Response(JSON.stringify({ private: "x".repeat(66000) }), {
              headers: { "content-type": "application/json" },
            }),
        ]) {
          const n = count(f, "apple_token");
          f.onToken(response);
          await assert.rejects(f.capture(), coded);
          assert.equal(count(f, "apple_token"), n + 1);
        }
      },
    );
    await isolated(
      "an aborted response body cannot hold capture open even when provider cancellation never acknowledges",
      async () => {
        const controller = new AbortController();
        let cancelled = false,
          timer,
          watchdog;
        f.onToken(
          () =>
            new Response(
              new ReadableStream({
                start() {
                  timer = setTimeout(() => controller.abort("private caller reason"), 10);
                },
                cancel() {
                  cancelled = true;
                  return new Promise(() => {});
                },
              }),
              { headers: { "content-type": "application/json" } },
            ),
        );
        try {
          await assert.rejects(
            Promise.race([
              f.capture(f.make(), controller.signal),
              new Promise((_, reject) => {
                watchdog = setTimeout(() => reject(Error("Capture ignored cancellation")), 1000);
              }),
            ]),
            coded,
          );
          assert(cancelled);
        } finally {
          clearTimeout(timer);
          clearTimeout(watchdog);
        }
      },
    );
    await isolated(
      "a correct at_hash validates and a changed keyring cannot silently reuse undecryptable storage",
      async () => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(f.accessToken),
        );
        f.claimsPatch((c) => ({
          ...c,
          at_hash: Buffer.from(digest).subarray(0, 16).toString("base64url"),
        }));
        assert.deepEqual(await f.capture(), { stored: true });
        const broken = { ...f.vault, keys: { v1: randomBytes(32).toString("hex") } };
        // The HMAC cache key changes with the root. A full provider revalidation may
        // recover storage, but a caller without a valid provider credential cannot
        // call that loss a successful capture or manual revocation.
        f.onToken(() => new Response("invalid_grant", { status: 400 }));
        await assert.rejects(f.capture(f.make({ vault: broken })), coded);
      },
    );
  },
);

test(
  "Apple vault SQL is private and refuses stale schemas, owner changes and silent Auth cascades",
  { timeout: 90000 },
  async (t) => {
    const db = await appleVaultDatabase();
    t.after(() => db.close());
    const f = await appleCaptureFixture(db);
    await f.capture();
    await db.exec(
      "create temp table apple_completion_fixture(user_id uuid,status text);create trigger completion after update on apple_completion_fixture for each row execute function guard_apple_authorization_completion()",
    );
    await db.query("insert into apple_completion_fixture values($1,'requested')", [f.userId]);
    await assert.rejects(
      db.query("update apple_completion_fixture set user_id=null,status='completed'"),
      /Apple credential cleanup is incomplete/,
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        db.query("select * from apple_authorization_vault"),
        /permission denied/,
      );
      await db.exec("reset role");
      if (role !== "service_role") {
        await db.exec("set role " + role);
        await assert.rejects(
          db.query("select apple_authorization_capture_cached($1,$2,$3,$4,'v1')", [
            f.userId,
            f.sessionId,
            f.apple.clientId,
            "00".repeat(32),
          ]),
          /permission denied/,
        );
        await db.exec("reset role");
      }
    }
    await assert.rejects(
      db.query("delete from auth.users where id=$1", [f.userId]),
      /Apple authorizations require revocation/,
    );
    assert.equal(
      (
        await db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
          f.userId,
        ])
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("update apple_authorization_vault set user_id=$1 where user_id=$2", [
        randomUUID(),
        f.userId,
      ]),
      /ownership is immutable/,
    );
    await db.query("delete from auth.identities where id=$1", [f.identityId]);
    assert.equal(
      (
        await db.query("select count(*)::int n from apple_authorization_vault where user_id=$1", [
          f.userId,
        ])
      ).rows[0].n,
      1,
      "Unlinking an identity cannot discard a credential",
    );
    await db.exec("begin;grant update(provider_id) on auth.identities to authenticated");
    assert.equal((await db.query("select apple_authorization_vault_current()v")).rows[0].v, false);
    await db.exec("rollback");
    await db.exec("grant select on apple_authorization_vault to authenticated");
    assert.equal((await db.query("select apple_authorization_vault_current()v")).rows[0].v, false);
    await assert.rejects(f.capture(), coded);
  },
);

test(
  "Apple vault migration rejects member-writable Auth identity ownership",
  { timeout: 90000 },
  async (t) => {
    const db = await appleVaultDatabase({ install: false });
    t.after(() => db.close());
    await db.exec("grant update(provider_id) on auth.identities to authenticated");
    await assert.rejects(db.exec(vaultMigration()), /Auth identities must not be member-writable/);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select to_regclass('public.apple_authorization_vault')r")).rows[0].r,
      null,
    );
  },
);
