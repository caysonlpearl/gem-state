import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { MOBILE_AUTH_REDIRECT, mobileLinkTarget } from "../../../src/lib/mobile-contract";
import { installIdentifier } from "./identity";
export { mobileLinkTarget };
export const apiOrigin = new URL(import.meta.env.VITE_MOBILE_API_ORIGIN || "https://onbluebird.com")
  .origin;
if (
  !apiOrigin.startsWith("https://") &&
  !(import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1):/.test(apiOrigin))
)
  throw Error("Bluebird requires a secure connection.");
export let auth: SupabaseClient;
export type Bootstrap = {
  policyVersion: string;
  categories: { slug: string; name: string; group: string }[];
  features: { push: boolean; paidUpgrades: false; advertising: boolean };
};
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
  expectedActor?: { userId: string | null; installId: string },
): Promise<T> {
  if (!/^[a-z0-9/?=&%+._:-]+$/i.test(path) || path.startsWith("/") || path.includes(".."))
    throw Error("Invalid app destination.");
  const session = auth ? (await auth.auth.getSession()).data.session : null;
  if (
    expectedActor &&
    ((session?.user.id ?? null) !== expectedActor.userId ||
      installIdentifier() !== expectedActor.installId)
  )
    throw new ApiError("account_changed", "Your account changed. Please try again.", 409);
  const shopping = /^(shopping(?:[/?]|$)|recommendations(?:[?]|$)|similar(?:[?]|$)|activity$)/.test(
    path,
  );
  const response = await fetch(`${apiOrigin}/api/mobile/v1/${path}`, {
    method,
    headers: {
      ...(shopping
        ? { "X-Bluebird-Install": expectedActor?.installId ?? installIdentifier() }
        : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: signal ?? AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      payload?.error?.code ?? "unavailable",
      payload?.error?.message ?? "Bluebird could not complete this request. Try again.",
      response.status,
    );
  return payload.data as T;
}
export async function initialize(): Promise<Bootstrap> {
  const b = await api<Bootstrap & { supabaseUrl: string; supabaseKey: string }>("bootstrap");
  auth = createClient(b.supabaseUrl, b.supabaseKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "bluebird-mobile-auth",
    },
  });
  return b;
}
export async function socialLogin(provider: "google" | "apple") {
  const redirectTo = Capacitor.isNativePlatform()
    ? MOBILE_AUTH_REDIRECT
    : `${location.origin}/#/auth/callback`;
  const { data, error } = await auth.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (data.url) {
    if (Capacitor.isNativePlatform()) await Browser.open({ url: data.url });
    else location.assign(data.url);
  }
}
export async function finishLogin(raw: string): Promise<boolean> {
  const url = new URL(raw);
  const native = mobileLinkTarget(raw) === "/auth/callback";
  const web = !Capacitor.isNativePlatform() && url.origin === location.origin;
  if (!native && !web) return false;
  const code =
    url.searchParams.get("code") ?? new URLSearchParams(url.hash.split("?")[1] ?? "").get("code");
  if (!code) return false;
  const { error } = await auth.auth.exchangeCodeForSession(code);
  if (error) throw error;
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => undefined);
  return true;
}
