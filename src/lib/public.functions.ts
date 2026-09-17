import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PlatformNotice = {
  id: string;
  slug: string;
  heading: string;
  body: string;
};

/**
 * Public, unauthenticated read used by the server-rendered home route.
 * Uses the publishable key behind a narrow `TO anon` SELECT policy that only
 * exposes published notices.
 */
export const getPublishedNotices = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformNotice[]> => {
    const key = (process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]) as string;
    const url = (process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"]) as string;

    const client = createClient<Database>(url, key, {
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

    const { data, error } = await client
      .from("platform_notices")
      .select("id, slug, heading, body")
      .eq("published", true)
      .order("position", { ascending: true });

    if (error) {
      console.error("getPublishedNotices failed", error.message);
      return [];
    }
    return data ?? [];
  },
);
