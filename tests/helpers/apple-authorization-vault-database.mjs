import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { ledgerActorDatabase } from "./account-deletion-ledger-actors-database.mjs";
import { createAppleAuthorizationCapture } from "../../src/lib/apple-authorization-capture.server.ts";
export const vaultMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261115170000_apple_authorization_vault.sql",
      import.meta.url,
    ),
    "utf8",
  );
// Minimal required modern Auth schema, not a claim that production metadata was
// inspected. Names/types match Supabase's Identity model; installer checks them.
export async function appleVaultDatabase({ provided, install = true } = {}) {
  const db = await ledgerActorDatabase({ provided });
  try {
    await db.exec(
      `create table auth.identities(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,provider text not null,provider_id text not null,identity_data jsonb,unique(provider,provider_id));`,
    );
    if (install) await db.exec(vaultMigration());
    return db;
  } catch (e) {
    if (!provided) await db.close();
    throw e;
  }
}
export async function appleCaptureFixture(db) {
  const userId = randomUUID(),
    sessionId = randomUUID(),
    identityId = randomUUID(),
    subject = "001.synthetic-apple-subject-" + userId,
    refreshToken = "synthetic-refresh+token&/=",
    accessToken = "synthetic-access-token";
  await db.query("insert into auth.users(id)values($1)", [userId]);
  await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [sessionId, userId]);
  await db.query(
    "insert into auth.identities(id,user_id,provider,provider_id,identity_data)values($1,$2,'apple',$3,$4)",
    [
      identityId,
      userId,
      subject,
      JSON.stringify({
        sub: subject,
        iss: "https://appleid.apple.com",
        email: "same@fixture.invalid",
      }),
    ],
  );
  const signing = await generateKeyPair("ES256", { extractable: true }),
    appleKeys = await generateKeyPair("RS256", { extractable: true });
  const apple = {
    teamId: "TEAMID1234",
    keyId: "KEYID12345",
    clientId: "com.fixture.bluebird",
    privateKeyPem: await exportPKCS8(signing.privateKey),
  };
  const vault = {
    projectUrl: "https://disposable.invalid",
    activeVersion: "v1",
    keys: { v1: randomBytes(32).toString("hex") },
  };
  const jwk = {
    ...(await exportJWK(appleKeys.publicKey)),
    kid: "fixture-apple-key",
    use: "sig",
    alg: "RS256",
  };
  const calls = [],
    requests = [];
  let loseStoreAck = false,
    outerTransaction = false,
    afterRpc,
    onToken,
    adminPatch,
    claimsPatch,
    tokenPatch,
    keyPatch,
    now = 1800000000000;
  const clientForSignal = (signal) =>
    createClient(vault.projectUrl, "synthetic-service-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          assert(!signal.aborted);
          const path = new URL(String(input)).pathname;
          if (path === "/auth/v1/admin/users/" + userId) {
            const rows = (
              await db.query("select * from auth.identities where user_id=$1", [userId])
            ).rows;
            let value = {
              id: userId,
              aud: "authenticated",
              role: "authenticated",
              email: "same@fixture.invalid",
              created_at: new Date(now).toISOString(),
              app_metadata: { provider: "apple", providers: ["apple"] },
              user_metadata: { sub: subject },
              identities: rows.map((r) => ({
                id: r.provider_id,
                identity_id: r.id,
                user_id: r.user_id,
                provider: r.provider,
                identity_data: r.identity_data,
              })),
            };
            value = adminPatch ? await adminPatch(value) : value;
            calls.push({ name: "admin_read" });
            return new Response(JSON.stringify(value), {
              headers: { "content-type": "application/json" },
            });
          }
          const name = path.split("/").at(-1),
            args = JSON.parse(init.body);
          assert(
            ["apple_authorization_capture_cached", "store_verified_apple_authorization"].includes(
              name,
            ),
          );
          requests.push({ name, args });
          calls.push({ name });
          let result;
          await db.exec(outerTransaction ? "savepoint capture_rpc" : "begin");
          await db.exec("set local role service_role");
          try {
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
          } catch (e) {
            await db.exec(
              outerTransaction
                ? "rollback to savepoint capture_rpc;release savepoint capture_rpc"
                : "rollback",
            );
            return new Response(JSON.stringify({ message: e.message }), { status: 400 });
          } finally {
            await db.exec("reset role");
          }
          await db.exec(outerTransaction ? "release savepoint capture_rpc" : "commit");
          await afterRpc?.(name, args, result);
          if (name === "store_verified_apple_authorization" && loseStoreAck) {
            loseStoreAck = false;
            return new Response(JSON.stringify({ message: "Synthetic lost acknowledgement" }), {
              status: 503,
            });
          }
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        },
      },
    });
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert(!init.signal.aborted);
    if (url === "https://appleid.apple.com/auth/keys") {
      calls.push({ name: "apple_keys" });
      return new Response(JSON.stringify(keyPatch ? keyPatch({ keys: [jwk] }) : { keys: [jwk] }), {
        headers: { "content-type": "application/json" },
      });
    }
    assert.equal(url, "https://appleid.apple.com/auth/token");
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
    const form = new URLSearchParams(init.body);
    assert.deepEqual([...form.keys()].sort(), [
      "client_id",
      "client_secret",
      "grant_type",
      "refresh_token",
    ]);
    assert.equal(form.get("client_id"), apple.clientId);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), refreshToken);
    const secret = await jwtVerify(form.get("client_secret"), signing.publicKey, {
      issuer: apple.teamId,
      audience: "https://appleid.apple.com",
      algorithms: ["ES256"],
      currentDate: new Date(now),
    });
    assert.equal(secret.payload.sub, apple.clientId);
    assert.equal(secret.payload.exp - secret.payload.iat, 300);
    calls.push({ name: "apple_token" });
    const response = await onToken?.(init);
    if (response) return response;
    let claims = {
      iss: "https://appleid.apple.com",
      aud: apple.clientId,
      sub: subject,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
      email: "same@fixture.invalid",
    };
    if (claimsPatch) claims = claimsPatch(claims);
    let data = {
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: 3600,
      id_token: await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .sign(appleKeys.privateKey),
    };
    if (tokenPatch) data = tokenPatch(data);
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  const make = (patch = {}) =>
    createAppleAuthorizationCapture(
      { apple, vault, ...patch },
      clientForSignal,
      fetcher,
      () => now,
    );
  return {
    db,
    userId,
    sessionId,
    identityId,
    subject,
    refreshToken,
    accessToken,
    apple,
    vault,
    calls,
    requests,
    make,
    capture: (c = make(), signal = new AbortController().signal) =>
      c.capture({ userId, sessionId }, refreshToken, signal),
    inTransaction: (value) => {
      outerTransaction = value;
    },
    loseStoreAck: () => {
      loseStoreAck = true;
    },
    afterRpc: (hook) => {
      afterRpc = hook;
    },
    onToken: (hook) => {
      onToken = hook;
    },
    adminPatch: (hook) => {
      adminPatch = hook;
    },
    claimsPatch: (hook) => {
      claimsPatch = hook;
    },
    tokenPatch: (hook) => {
      tokenPatch = hook;
    },
    keyPatch: (hook) => {
      keyPatch = hook;
    },
    setNow: (value) => {
      now = value;
    },
  };
}
