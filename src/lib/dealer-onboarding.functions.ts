import { z } from "zod";
/* eslint-disable @typescript-eslint/no-explicit-any -- migration-backed dealer accounts */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dealerOnboardingSchema } from "./dealer-onboarding-contract";

export const getDealerMessageEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !data) throw Error("Administrator access required.");
    const key = process.env["RESEND_API_KEY"],
      from = process.env["RESEND_FROM_EMAIL"] ?? "";
    const address = from.match(/<([^>]+)>/)?.[1] ?? from;
    const domain = address.split("@")[1]?.toLowerCase();
    if (!key || !domain || domain === "resend.dev")
      return {
        configured: false,
        verified: false,
        message: "A verified Bluebird sending address is needed for dealership message emails.",
      };
    try {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok)
        return {
          configured: true,
          verified: false,
          message: "Email is configured; sender verification could not be checked.",
        };
      const body = (await response.json()) as { data?: { name: string; status: string }[] };
      const verified =
        body.data?.some((d) => d.name.toLowerCase() === domain && d.status === "verified") ?? false;
      return {
        configured: true,
        verified,
        message: verified
          ? "Dealership message emails use a verified sending domain."
          : "The sending domain still needs verification.",
      };
    } catch {
      return {
        configured: true,
        verified: false,
        message: "Email is configured; sender verification is temporarily unavailable.",
      };
    }
  });

export const onboardDealerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => dealerOnboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !isAdmin) throw Error("Administrator access required.");
    const { onboardDealer } = await import("./dealer-onboarding.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return onboardDealer(supabaseAdmin, context.userId, data);
  });
export type DealerAccountInventory = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  records: {
    id: string;
    title: string;
    priceCents: number | null;
    status: string;
    vin: string | null;
    stockNumber: string | null;
    dealerVisibility?: "visible" | "hidden" | "sold";
    detailReportOpen?: boolean;
  }[];
};
export const getMyDealerInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DealerAccountInventory[]> => {
    const { data, error } = await (context.supabase as any).rpc("my_dealer_inventory");
    if (error) throw Error("Could not load your dealership inventory.");
    return data ?? [];
  });

/** The recipient comes from the operator's account; clients cannot choose an address. */
export const sendDealerMessageEmailTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !data) throw Error("Administrator access required.");
    const [{ supabaseAdmin }, { sendTemplateEmail }, { sendDealerEmailTest }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./email-templates/send-email"),
      import("./dealer-email-test.server"),
    ]);
    return sendDealerEmailTest(
      supabaseAdmin as any,
      context.userId,
      sendTemplateEmail,
      crypto.randomUUID(),
    );
  });

/** Read-only operator preview; never creates a dealer session or sends an invitation. */
export const getDealerAccountPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ dealerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !allowed) throw Error("Administrator access required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: dealer, error } = await db
      .from("dealer_profiles")
      .select(
        "id,owner_user_id,legal_name,display_name,slug,logo_url,email,phone,website,address_line1,address_line2,city,state,postal_code,description,agreements_accepted_at,price_insights_enabled,valuation_dealer_type",
      )
      .eq("id", data.dealerId)
      .single();
    if (error || !dealer) throw Error("Dealership not found.");
    const { data: sources, error: sourceError } = await db
      .from("dealer_inventory_sources")
      .select("id")
      .eq("dealer_id", dealer.id);
    if (sourceError) throw Error("Could not load dealership inventory.");
    const { data: records, error: recordsError } = sources?.length
      ? await db
          .from("dealer_inventory_records")
          .select(
            "id,source_id,source_record_key,title,price_cents,inventory_status,vin,stock_number",
          )
          .in(
            "source_id",
            sources.map((s: any) => s.id),
          )
          .order("title")
          .limit(5000)
      : { data: [], error: null };
    if (recordsError) throw Error("Could not load dealership inventory.");
    const { data: controls, error: controlError } = await db
      .from("dealer_inventory_controls")
      .select("record_id,vehicle_key,visibility")
      .eq("dealer_id", dealer.id);
    if (controlError) throw Error("Could not load dealership visibility controls.");
    const { data: reports, error: reportError } = await db
      .from("partner_vehicle_reports")
      .select("listing_id")
      .eq("reporter_id", dealer.owner_user_id)
      .in("status", ["open", "under_review"]);
    if (reportError) throw Error("Could not load inventory report status.");

    const { data: owner, error: ownerError } = await db.auth.admin.getUserById(
      dealer.owner_user_id,
    );
    if (ownerError) throw Error("Could not load dealership login status.");
    const { count, error: countError } = await db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealer.id)
      .eq("seller_id", dealer.owner_user_id);
    if (countError) throw Error("Could not load dealership inbox status.");
    return {
      loginEmail: owner.user?.email ?? null,
      activated: Boolean(owner.user?.last_sign_in_at),
      profile: {
        legalName: dealer.legal_name,
        displayName: dealer.display_name,
        slug: dealer.slug,
        phone: dealer.phone ?? "",
        email: dealer.email ?? "",
        website: dealer.website ?? "",
        addressLine1: dealer.address_line1 ?? "",
        addressLine2: dealer.address_line2 ?? "",
        city: dealer.city ?? "",
        state: dealer.state ?? "",
        postalCode: dealer.postal_code ?? "",
        logoUrl: dealer.logo_url ?? "",
        description: dealer.description ?? "",
        acceptAgreements: Boolean(dealer.agreements_accepted_at),
        priceInsightsEnabled: dealer.price_insights_enabled !== false,
        valuationDealerType: dealer.valuation_dealer_type ?? "",
      },
      messageCount: count ?? 0,
      postalCode: dealer.postal_code,
      inventory: {
        id: dealer.id,
        name: dealer.display_name,
        slug: dealer.slug,
        logoUrl: dealer.logo_url,
        email: dealer.email,
        phone: dealer.phone,
        website: dealer.website,
        address: dealer.address_line1,
        city: dealer.city,
        state: dealer.state,
        records: (records ?? []).map((r: any) => ({
          id: r.id,
          title: r.title,
          priceCents: r.price_cents,
          status: r.inventory_status,
          vin: r.vin,
          stockNumber: r.stock_number,
          dealerVisibility:
            (controls ?? []).find(
              (c: any) =>
                c.vehicle_key ===
                (r.vin
                  ? `vin:${r.vin.toUpperCase()}`
                  : `source:${r.source_id}:${r.source_record_key}`),
            )?.visibility ?? "visible",
          detailReportOpen: (reports ?? []).some(
            (report: any) => report.listing_id === `dealerfeed-${r.id}`,
          ),
        })),
      } as DealerAccountInventory,
    };
  });
