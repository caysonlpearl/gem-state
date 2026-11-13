type Capabilities = { attachments: boolean; posting: boolean; savedSearches: boolean };
let cached: { until: number; enabled: Capabilities } | undefined;
let pending: Promise<Capabilities> | undefined;
/** A server-only capability read; no member data or writes. Missing migration
 * and outages fail closed. Cache the read to avoid adding per-request load. */
function capabilities(): Promise<Capabilities> {
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.enabled);
  if (pending) return pending;
  pending = (async () => {
    let enabled: Capabilities = { attachments: false, posting: false, savedSearches: false };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (
        supabaseAdmin as unknown as {
          rpc: (name: string) => Promise<{
            data: { attachments?: boolean; posting?: boolean; savedSearches?: boolean } | null;
            error: unknown;
          }>;
        }
      ).rpc("mobile_messaging_capabilities");
      enabled = {
        attachments: !error && data?.attachments === true,
        posting: !error && data?.posting === true,
        savedSearches: !error && data?.savedSearches === true,
      };
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

export async function mobileAttachmentsReady() {
  return (await capabilities()).attachments;
}
export async function mobilePostingReady() {
  return (await capabilities()).posting;
}

export async function mobileSavedSearchesReady() {
  return (await capabilities()).savedSearches;
}
