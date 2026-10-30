// Run with Node 22 --experimental-strip-types --env-file=<server env file>.
// This invokes the same DB-budgeted refresh used by the production scheduler.
import { createClient } from "@supabase/supabase-js";
import { setDefaultResultOrder } from "node:dns";
import { MERCHANDISE_SCOPES, MERCHANDISE_PAGE_SIZE } from "../src/lib/avantlink-contract.ts";
import { refreshMerchandisePage } from "../src/lib/avantlink.server.ts";

const url = process.env.GEM_STATE_SUPABASE_URL || process.env.SUPABASE_URL;
setDefaultResultOrder("ipv4first");
const key =
  process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== "udxxfuticbxwiehoepeg.supabase.co" || !key) {
  throw new Error(
    "Supply Bluebird's production server environment. No other project will be changed.",
  );
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_")) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers, signal: AbortSignal.timeout(30000) });
    },
  },
});
for (const scope of MERCHANDISE_SCOPES) {
  for (let page = 0; page < 10000 / MERCHANDISE_PAGE_SIZE; page++) {
    const result = await refreshMerchandisePage(scope, db);
    console.log(JSON.stringify(result));
    if (result.error) process.exitCode = 1;
    if (result.complete || result.skipped || result.error) break;
  }
}
const { data, error, count } = await db
  .from("avantlink_merchandise")
  .select("category_slug", { count: "exact" })
  .eq("active", true)
  .range(0, 999);
if (error) throw new Error("Could not verify the saved inventory.");
console.log(
  JSON.stringify({
    activeProducts: count,
    sampleCategoryCounts: (data ?? []).reduce(
      (acc, row) => ({ ...acc, [row.category_slug]: (acc[row.category_slug] ?? 0) + 1 }),
      {},
    ),
  }),
);
