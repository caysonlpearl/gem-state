import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw Error("Administrator access required.");
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
export const getBusinessPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    return (await import("./business-performance.server")).loadBusinessPerformance(
      admin,
      data.days,
    );
  });
export const saveBusinessSalesAssumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        businessKey: z.string().min(1).max(300),
        conversionPercent: z.number().finite().min(0).max(100).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    const { data: business, error: lookupError } = await (admin as any)
      .from("business_performance_entities")
      .select("business_key")
      .eq("business_key", data.businessKey)
      .maybeSingle();
    if (lookupError || !business) throw Error("Business not found.");
    const { error } = await (admin as any).from("business_sales_assumptions").upsert({
      business_key: data.businessKey,
      conversion_percent: data.conversionPercent,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw Error("Sales assumption could not be saved.");
    return { ok: true };
  });

/** Admin-only resolution of registered business sellers; no public registry dump. */
export const getBusinessSellerKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context);
    const { data: rows, error } = await (admin as any)
      .from("business_performance_entities")
      .select("business_key")
      .eq("metadata->>sellerSlug", data.slug)
      .limit(2);
    if (error) throw Error("Business link could not be loaded.");
    return { businessKey: rows?.length === 1 ? (rows[0].business_key as string) : null };
  });
