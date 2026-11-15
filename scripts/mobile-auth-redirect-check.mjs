import { createHash, randomBytes } from "node:crypto";
import { PUBLIC_SUPABASE_URL } from "../src/config/supabase-public.ts";
import { MOBILE_AUTH_REDIRECT } from "../src/lib/mobile-contract.ts";

// Exercise the real redirect policy without signing in, exchanging a code,
// creating a member, sending mail or following the URL to Google. State and
// transient cookies are used only in memory and never included in the report.
async function check() {
  const origin = new URL(PUBLIC_SUPABASE_URL).origin;
  const authorize = new URL("/auth/v1/authorize", origin);
  authorize.search = new URLSearchParams({
    provider: "google",
    redirect_to: MOBILE_AUTH_REDIRECT,
    code_challenge: createHash("sha256").update(randomBytes(32)).digest("base64url"),
    code_challenge_method: "s256",
  }).toString();
  const signal = AbortSignal.timeout(20000);
  const started = await fetch(authorize, { redirect: "manual", signal });
  if (started.status !== 302 || !started.headers.get("location"))
    throw Error("authorize_unavailable");
  const provider = new URL(started.headers.get("location"));
  if (provider.protocol !== "https:" || provider.hostname !== "accounts.google.com")
    throw Error("unexpected_provider");
  const state = provider.searchParams.get("state");
  const callback = new URL(provider.searchParams.get("redirect_uri"));
  if (!state || callback.origin !== origin || callback.pathname !== "/auth/v1/callback")
    throw Error("unexpected_callback");
  callback.search = new URLSearchParams({
    state,
    error: "access_denied",
    error_description: "Synthetic cancelled Bluebird callback check",
  }).toString();
  const cookies = started.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const returned = await fetch(callback, {
    redirect: "manual",
    signal,
    headers: cookies ? { Cookie: cookies } : {},
  });
  if (returned.status !== 302 || !returned.headers.get("location"))
    throw Error("callback_unavailable");
  const target = new URL(returned.headers.get("location"));
  const actual = `${target.protocol}//${target.host}${target.pathname}`;
  const denied =
    new URLSearchParams(target.hash.slice(1)).get("error") === "access_denied" ||
    target.searchParams.get("error") === "access_denied";
  const passed = actual === MOBILE_AUTH_REDIRECT && denied;
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        passed,
        requestedReturn: MOBILE_AUTH_REDIRECT,
        actualReturn: actual,
        syntheticCancellationConfirmed: denied,
        memberSignedIn: false,
        credentialsOrTokensPersisted: false,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
}
try {
  await check();
} catch {
  // Do not print provider URLs, state, cookies or any auth response payload.
  console.error("Bluebird's native sign-in redirect check could not finish.");
  process.exitCode = 1;
}
