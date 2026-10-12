import type { supabase as BrowserSupabaseClient } from "./client";

// The Supabase library is ~56 KB compressed. Code that runs on every page
// (sign-in state, analytics, attaching the auth token to server calls) loads
// it through here so it arrives after the first paint instead of before it.
let pending: Promise<typeof BrowserSupabaseClient> | null = null;

export function loadSupabase() {
  pending ??= import("./client").then((module) => module.supabase);
  return pending;
}
