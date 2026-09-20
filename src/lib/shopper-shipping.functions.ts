/* eslint-disable @typescript-eslint/no-explicit-any -- shipping quote rows are migration-backed runtime data */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const shippingSchema = z.object({
  ship_from_name: z.string().trim().min(1).max(120),
  ship_from_phone: z.string().trim().min(1).max(30),
  ship_from_line1: z.string().trim().min(1).max(120),
  ship_from_line2: z.string().trim().max(120),
  ship_from_city: z.string().trim().min(1).max(80),
  ship_from_region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  ship_from_postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/),
  ship_from_country: z.literal("US"),
  default_shipping_method: z.enum([
    "usps_ground_advantage",
    "usps_priority_mail",
    "ups_ground",
    "fedex_ground",
  ]),
  default_handling_days: z.number().int().min(1).max(5),
});
export type ShopperShipping = z.infer<typeof shippingSchema>;
export const getShopperShipping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("seller_profiles")
      .select(
        "ship_from_name,ship_from_phone,ship_from_line1,ship_from_line2,ship_from_city,ship_from_region,ship_from_postal_code,ship_from_country,default_shipping_method,default_handling_days",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load your shipping setup.");
    return data;
  });
export const saveShopperShipping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ShopperShipping) => shippingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("save_shopper_shipping", {
      _shipping: data,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
