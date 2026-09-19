import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side publishable client for public catalog reads.
 * RLS still applies as `anon`, so only published catalog rows are reachable.
 */
export function publicServerClient() {
  const key = (process.env["GEM_STATE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string;
  const url = (process.env["GEM_STATE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    import.meta.env["VITE_SUPABASE_URL"] ||
    PUBLIC_SUPABASE_URL) as string;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
