import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only member directory: every seller and every approved in-park
 * shopper, with real counts only. No fabricated denominators, no addresses,
 * no documents — operators open the individual records for those.
 */

export type DirectorySeller = {
  userId: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: string | null;
  payoutVerified: boolean;
  activeListings: number;
  completedSales: number;
  createdAt: string;
};

export type DirectoryShopper = {
  userId: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  publicLocation: string | null;
  flatFeeCents: number | null;
  availableNow: boolean;
  completedAssignments: number;
  activeAssignments: number;
  createdAt: string;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin !== true) throw new Error("Administrator access is required.");
}

export const getMemberDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ sellers: DirectorySeller[]; shoppers: DirectoryShopper[] }> => {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const [sellerRows, shopperRows, profileRows, askRows, orderRows, assignmentRows, roleRows] =
        await Promise.all([
          admin
            .from("seller_profiles")
            .select("user_id,slug,status,stripe_payouts_enabled,created_at")
            .order("created_at", { ascending: false }),
          admin
            .from("shopper_service_profiles")
            .select(
              "shopper_id,slug,public_location,avatar_url,flat_fee_cents,available,available_until,created_at",
            ),
          admin.from("profiles").select("id,display_name,avatar_url,created_at"),
          admin.from("asks").select("seller_id,status,is_demo").eq("status", "active"),
          admin.from("orders").select("seller_id,status,is_demo").eq("status", "completed"),
          admin.from("sourcing_assignments").select("shopper_id,status"),
          admin.from("user_roles").select("user_id,role").eq("role", "shopper"),
        ]);

      const profiles = new Map<string, any>(
        (profileRows.data ?? []).map((row: any) => [row.id, row]),
      );
      const count = (rows: any[], key: string, id: string, demoAware = true) =>
        rows.filter((row) => row[key] === id && (!demoAware || row["is_demo"] !== true)).length;

      const sellers: DirectorySeller[] = (sellerRows.data ?? []).map((row: any) => {
        const member = profiles.get(row.user_id);
        return {
          userId: row.user_id,
          slug: row.slug ?? null,
          displayName: member?.display_name || row.slug || "Unnamed member",
          avatarUrl: member?.avatar_url ?? null,
          status: row.status ?? null,
          payoutVerified: row.stripe_payouts_enabled === true,
          activeListings: count(askRows.data ?? [], "seller_id", row.user_id),
          completedSales: count(orderRows.data ?? [], "seller_id", row.user_id),
          createdAt: row.created_at,
        };
      });

      const shopperProfiles = new Map<string, any>(
        (shopperRows.data ?? []).map((row: any) => [row.shopper_id, row]),
      );
      const assignments = assignmentRows.data ?? [];
      const shoppers: DirectoryShopper[] = (roleRows.data ?? []).map((role: any) => {
        const service = shopperProfiles.get(role.user_id);
        const member = profiles.get(role.user_id);
        return {
          userId: role.user_id,
          slug: service?.slug ?? null,
          displayName: member?.display_name || service?.slug || "Unnamed member",
          avatarUrl: service?.avatar_url ?? member?.avatar_url ?? null,
          publicLocation: service?.public_location ?? null,
          flatFeeCents: service?.flat_fee_cents == null ? null : Number(service.flat_fee_cents),
          availableNow: Boolean(
            service?.available &&
            service?.available_until &&
            new Date(service.available_until) > new Date(),
          ),
          completedAssignments: assignments.filter(
            (a: any) => a.shopper_id === role.user_id && a.status === "completed",
          ).length,
          activeAssignments: assignments.filter(
            (a: any) => a.shopper_id === role.user_id && a.status === "assigned",
          ).length,
          createdAt: service?.created_at ?? member?.created_at ?? new Date().toISOString(),
        };
      });

      return {
        sellers,
        shoppers: shoppers.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      };
    },
  );
