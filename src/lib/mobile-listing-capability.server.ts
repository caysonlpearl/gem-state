/* eslint-disable @typescript-eslint/no-explicit-any -- service-only capability RPC */
let cached: { until: number; ready: boolean } | undefined;
let pending: Promise<boolean> | undefined;
/** Independent from messaging/posting capabilities; missing migration fails closed. */
export async function mobileListingManagementReady() {
  if (cached && cached.until > Date.now()) return cached.ready;
  if (pending) return pending;
  pending = (async () => {
    let ready = false;
    try {
      const { supabaseAdmin } = await import("../integrations/supabase/client.server");
      const signal = AbortSignal.timeout(3000);
      const r = await (supabaseAdmin as any)
        .rpc("mobile_listing_management_capabilities")
        .abortSignal(signal)
        .retry(false);
      signal.throwIfAborted();
      ready = r.error === null && r.data?.version === 1 && r.data.management === true;
    } catch {
      /* Reads and browsing remain available. */
    }
    cached = { until: Date.now() + 30000, ready };
    return ready;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
