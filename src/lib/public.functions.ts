import { createServerFn } from "@tanstack/react-start";
import { publicServerClient } from "./supabase-public.server";

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
    const client = publicServerClient();

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
