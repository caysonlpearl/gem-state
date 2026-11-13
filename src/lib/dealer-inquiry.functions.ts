import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dealerInquirySchema,
  DEALER_INQUIRY_STATUSES,
  type DealerInquiry,
} from "./dealer-inquiry-contract";

export const submitDealerInquiry = createServerFn({ method: "POST" })
  .validator((value: unknown) => dealerInquirySchema.parse(value))
  .handler(async ({ data }) => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const request = getRequest();
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin)
      throw new Error("Please submit from Bluebird.");
    const { acceptDealerInquiry, digestDealerValue, processDealerInquiryNotifications } =
      await import("./dealer-inquiry.server");
    const salt =
      process.env["GEM_STATE_SUPABASE_SERVICE_ROLE_KEY"] ||
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      "";
    // Trust Cloudflare's visitor address only; never accept a forwarded-for chain.
    const address = request.headers.get("cf-connecting-ip") || data.email.toLowerCase();
    const abuseKey = await digestDealerValue(`${salt}:${address}`);
    const result = await acceptDealerInquiry(data, abuseKey);
    // Provider requests have a seven-second timeout. Awaiting keeps the attempt
    // alive on hosts that stop request work as soon as the response is returned.
    await processDealerInquiryNotifications(result.eventId).catch(() => null);
    return result;
  });
async function admin(context: { supabase: unknown; userId: string }) {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  const client = context.supabase as import("@supabase/supabase-js").SupabaseClient;
  const { data, error } = await client.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Administrator access required.");
  return client;
}
export const getDealerInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await admin(context);
    const { data, error } = await client
      .from("dealer_inquiries")
      .select(
        "id,created_at,dealership_name,website,name,email,phone,provider,inventory_count,notes,status,attribution,notification_status,notification_attempts,notification_sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Could not load dealership inquiries.");
    return {
      inquiries: (data ?? []) as DealerInquiry[],
      emailEnabled: process.env["DEALER_INQUIRY_EMAIL_ENABLED"] === "true",
    };
  });
export const updateDealerInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) =>
    z.object({ id: z.string().guid(), status: z.enum(DEALER_INQUIRY_STATUSES) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    const client = await admin(context);
    const { data: rows, error } = await client
      .from("dealer_inquiries")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id");
    if (error || !rows?.length) throw new Error("Could not update this inquiry.");
    return { ok: true };
  });
