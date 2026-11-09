import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DealerInquiryInput,
  DealerInquiry,
  DealerInquiryAcknowledgement,
} from "./dealer-inquiry-contract.ts";

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("../integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
export async function digestDealerValue(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function acceptDealerInquiry(
  input: DealerInquiryInput,
  abuseKey: string,
  client?: SupabaseClient,
): Promise<DealerInquiryAcknowledgement> {
  const store = client ?? (await db());
  const { requestKey, companyFax: _honeypot, ...payload } = input;
  const fingerprint = await digestDealerValue(JSON.stringify(payload));
  const { data, error } = await store.rpc("accept_dealer_inquiry", {
    _key: requestKey,
    _fingerprint: fingerprint,
    _abuse_key: abuseKey,
    _payload: payload,
  });
  if (error || !data?.id)
    throw new Error(
      error?.message?.includes("Please wait")
        ? "Please wait before submitting another request."
        : "We could not save your request. Please try again.",
    );
  return { ok: true, interest: "dealership", eventId: data.id, created: data.created === true };
}
export async function processDealerInquiryNotifications(
  id?: string,
  dependencies?: { client: SupabaseClient; send: (lead: DealerInquiry) => Promise<void> },
) {
  // Email is opt-in only after the owner approves a verified sending domain.
  if (!dependencies && process.env["DEALER_INQUIRY_EMAIL_ENABLED"] !== "true")
    return { sent: 0, attempted: 0, paused: true };
  const store = dependencies?.client ?? (await db());
  const { data, error } = await store.rpc("claim_dealer_inquiry_notifications", {
    _id: id ?? null,
  });
  if (error) throw new Error("Dealer notification queue unavailable");
  let sent = 0;
  for (const lead of (data ?? []) as (DealerInquiry & { notification_token: string })[]) {
    let delivered = false;
    try {
      if (dependencies) await dependencies.send(lead);
      else {
        const { sendTemplateEmail } = await import("./email-templates/send-email");
        const result = await sendTemplateEmail(
          "dealer-inquiry",
          "bluebirdmarketplaceid@gmail.com",
          { templateData: lead, replyTo: lead.email, idempotencyKey: `dealer-inquiry/${lead.id}` },
        );
        if (!result.sent) throw new Error("Notification not sent");
      }
      delivered = true;
    } catch {
      /* Keep the lead; retry without logging contact data or provider bodies. */
    }
    const { error: updateError } = await store
      .from("dealer_inquiries")
      .update({
        notification_status: delivered
          ? "sent"
          : lead.notification_attempts >= 8
            ? "failed"
            : "pending",
        notification_sent_at: delivered ? new Date().toISOString() : null,
        notification_next_at: new Date(
          Date.now() + Math.min(120, 2 ** lead.notification_attempts) * 60_000,
        ).toISOString(),
      })
      .eq("id", lead.id)
      .eq("notification_token", lead.notification_token);
    if (!updateError && delivered) sent++;
  }
  return { sent, attempted: (data ?? []).length };
}
