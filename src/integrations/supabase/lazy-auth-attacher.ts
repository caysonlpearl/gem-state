import { createMiddleware } from "@tanstack/react-start";
import { loadSupabase } from "./lazy-client";

// Same as the generated auth-attacher.ts, but loads the Supabase client on
// first use so it stays out of every page's initial download. Registered as
// a global `functionMiddleware` in `src/start.ts`.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const supabase = await loadSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
