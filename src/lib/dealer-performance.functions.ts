import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const input = z.object({
  dealerId: z.string().guid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
});
async function privateResponse() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
}
async function report(dealerId: string, days: number) {
  const [{ supabaseAdmin }, { loadDealerPerformance }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./dealer-performance.server"),
  ]);
  return loadDealerPerformance(supabaseAdmin, dealerId, days);
}

export const getMyDealerPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }) => {
    await privateResponse();
    // This security-definer RPC resolves the signed-in owner or active staff membership.
    // Never authorize analytics by a client-provided slug, name, or email.
    const { data: dealers, error } = await context.supabase.rpc("my_dealer_inventory");
    if (
      error ||
      !Array.isArray(dealers) ||
      !dealers.some(
        (dealer) =>
          dealer && typeof dealer === "object" && "id" in dealer && dealer.id === data.dealerId,
      )
    )
      throw Error("Access to this dealership is required.");
    return report(data.dealerId, data.days);
  });

/** Read-only administrator preview; does not impersonate the dealership. */
export const getDealerPerformancePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }) => {
    await privateResponse();
    const { data: allowed, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || allowed !== true) throw Error("Administrator access required.");
    return report(data.dealerId, data.days);
  });
