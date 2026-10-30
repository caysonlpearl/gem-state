// One-time seed/diagnostic; uses the same cache-only snapshot builder as production.
// node --env-file=/path/to/server.env scripts/refresh-homepage.mjs
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";
const url = process.env.GEM_STATE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!url || new URL(url).hostname !== "udxxfuticbxwiehoepeg.supabase.co")
  throw new Error("Supply Bluebird's production server environment.");
const key =
  process.env.GEM_STATE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Supply the server storage credential.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch(input, init) {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("authorization") === `Bearer ${key}`)
        headers.delete("authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers, signal: AbortSignal.timeout(15000) });
    },
  },
});
const { data: bucket, error: bucketError } = await client.storage.getBucket("homepage-snapshots");
if (bucketError || !bucket?.public)
  throw new Error(
    `The public homepage cache bucket must exist first (${bucketError?.status ?? "not public"}).`,
  );
// Operator-only recovery of an abandoned refresh, never used by normal traffic.
if (process.argv.includes("--retry")) {
  const { error } = await client.storage
    .from("homepage-snapshots")
    .remove([`leases/${Math.floor(Date.now() / 300000)}.json`]);
  if (error) throw new Error("Could not release the abandoned homepage refresh.");
}
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});
try {
  const module = await vite.ssrLoadModule("/src/lib/homepage-snapshot.server.ts");
  const started = Date.now();
  const result = await module.refreshHomepageSnapshot(true);
  const snapshot = await module.readHomepageSnapshot();
  console.log(
    JSON.stringify({
      ...result,
      durationMs: Date.now() - started,
      generatedAt: snapshot.generatedAt,
      sections: Object.fromEntries(
        Object.entries(snapshot.sections).map(([key, value]) => [
          key,
          { count: value.cards.length, updatedAt: value.updatedAt },
        ]),
      ),
    }),
  );
} finally {
  await vite.close();
}
