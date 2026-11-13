import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setDealerInventoryVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        recordId: z.string().guid(),
        visibility: z.enum(["visible", "hidden", "sold"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // The database resolves dealership ownership from this record. A client
    // cannot choose a dealer ID or submit feed prices, photos, or status.
    const { data: result, error } = await (context.supabase as any).rpc(
      "set_dealer_inventory_visibility",
      { _record_id: data.recordId, _visibility: data.visibility, _reason: data.reason || null },
    );
    if (error) throw Error(error.message);
    return result as { recordId: string; visibility: "visible" | "hidden" | "sold" };
  });
export const reportDealerInventoryDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ recordId: z.string().guid(), details: z.string().trim().min(5).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("report_dealer_inventory_details", {
      _record_id: data.recordId,
      _details: data.details,
    });
    if (error) throw Error(error.message);
    return { reported: true };
  });
