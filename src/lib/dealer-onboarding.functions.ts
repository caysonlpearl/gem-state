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
  }[];
};
export const getMyDealerInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DealerAccountInventory[]> => {
    const { data, error } = await (context.supabase as any).rpc("my_dealer_inventory");
    if (error) throw Error("Could not load your dealership inventory.");
    return data ?? [];
  });
