let cached: { until: number; enabled: boolean } | undefined;
let pending: Promise<boolean> | undefined;
/** A server-only capability read; no member data or writes. Missing migration
 * and outages fail closed. Cache the read to avoid adding per-request load. */
export function mobileAttachmentsReady(): Promise<boolean> {
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.enabled);
  if (pending) return pending;
  pending = (async () => {
    let enabled = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (
        supabaseAdmin as unknown as {
          rpc: (
            name: string,
          ) => Promise<{ data: { attachments?: boolean } | null; error: unknown }>;
        }
      ).rpc("mobile_messaging_capabilities");
      enabled = !error && data?.attachments === true;
    } catch {
      /* Browsing/text messaging remain usable without attachment readiness. */
    }
    cached = { until: Date.now() + 30000, enabled };
    return enabled;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
