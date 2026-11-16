import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { appleVaultDatabase, appleCaptureFixture } from "./apple-authorization-vault-database.mjs";
import { createAccountDeletionAuthorizationWork } from "../../src/lib/account-deletion-authorization.server.ts";
import { createAccountDeletionQueue } from "../../src/lib/account-deletion-queue.server.ts";
import { deletionPhases, runAccountDeletion } from "../../src/lib/account-deletion-worker.ts";
export const authorizationMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261116180000_account_deletion_authorizations.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function authorizationDatabase({ provided } = {}) {
  const db = await appleVaultDatabase({ provided });
  try {
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261114160000_account_deletion_auth_dependencies.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(authorizationMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
export async function authorizationFixture(
  t,
  { provided, kind = "captured", corrupt = false } = {},
) {
  const db = await authorizationDatabase({ provided });
  if (!provided) t.after(() => db.close());
  const owner = await appleCaptureFixture(db);
  if (kind === "captured") await owner.capture();
  if (corrupt)
    await db.query(
      "update apple_authorization_vault set ciphertext=set_byte(ciphertext,0,get_byte(ciphertext,0)#1) where user_id=$1",
      [owner.userId],
    );
  if (kind === "google")
    await db.query("update auth.identities set provider='google'where id=$1", [owner.identityId]);
  const other = await appleCaptureFixture(db);
  await other.capture();
  await db.query("select mobile_request_deletion($1)", [owner.userId]);
  await db.exec("update account_deletion_controls set worker_enabled=true");
  const initial = (
    await db.query(
      "update account_deletion_jobs set phase='authorization'where user_id=$1 returning *",
      [owner.userId],
    )
  ).rows[0];
  const calls = [],
    providerCalls = [];
  let loseAck = false,
    provider,
    afterRpc,
    lastFailure;
  const allowed = [
    "prepare_account_deletion_authorization",
    "check_account_deletion_apple_authorization",
    "acknowledge_account_deletion_apple_authorization",
    "finalize_account_deletion_authorizations",
    "verify_account_deletion_authorizations",
    "claim_account_deletion",
    "advance_account_deletion",
    "retry_account_deletion",
    "account_access_coverage",
    "account_deletion_lease_current",
  ];
  const dbClient = createClient("https://disposable.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const name = new URL(String(input)).pathname.split("/").at(-1),
          args = JSON.parse(init.body ?? "{}");
        assert(
          allowed.includes(name) ||
            /^(purge|retire|inspect|verify)_account_deletion_[a-z_]+$/.test(name),
        );
        calls.push({ name, args });
        let result;
        await db.exec("begin;set local role service_role");
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
          await db.exec("commit");
        } catch (e) {
          await db.exec("rollback");
          lastFailure = { name, message: e.message };
          return new Response(JSON.stringify({ message: e.message }), { status: 400 });
        }
        await afterRpc?.(name, args, result);
        if (name === "acknowledge_account_deletion_apple_authorization" && loseAck) {
          loseAck = false;
          return new Response(
            JSON.stringify({ message: "Synthetic lost private acknowledgement" }),
            { status: 503 },
          );
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const fetcher = async (url, init) => {
    assert.equal(url, "https://appleid.apple.com/auth/revoke");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert(!init.signal.aborted);
    const form = new URLSearchParams(init.body);
    assert.equal(form.get("client_id"), owner.apple.clientId);
    assert.equal(form.get("token_type_hint"), "refresh_token");
    assert.equal(form.get("token"), owner.refreshToken);
    providerCalls.push({ clientId: form.get("client_id"), kind: form.get("token_type_hint") });
    return provider ? provider(init) : new Response(null, { status: 200 });
  };
  const config = { vault: owner.vault, clients: [owner.apple] },
    work = createAccountDeletionAuthorizationWork(dbClient, config, fetcher, () => 1800000000000),
    queue = createAccountDeletionQueue(dbClient);
  const phases = Object.fromEntries(
    deletionPhases.map((p) => [
      p,
      async () => {
        throw Error("Unbound phase must not execute in this provider test");
      },
    ]),
  );
  phases.authorization = work.step;
  return {
    db,
    owner,
    other,
    initial,
    work,
    queue,
    dbClient,
    config,
    fetcher,
    calls,
    providerCalls,
    run: () => runAccountDeletion(queue, phases),
    provider: (fn) => {
      provider = fn;
    },
    afterRpc: (fn) => {
      afterRpc = fn;
    },
    loseAck: () => {
      loseAck = true;
    },
    lastFailure: () => lastFailure,
    resume: () =>
      db.query("update account_deletion_jobs set available_at=clock_timestamp()where id=$1", [
        initial.id,
      ]),
    phase: async (phase) =>
      (
        await db.query(
          "update account_deletion_jobs set phase=$1,status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'where id=$2 returning *",
          [phase, initial.id],
        )
      ).rows[0],
  };
}
