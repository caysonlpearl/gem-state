/* eslint-disable @typescript-eslint/no-explicit-any -- partner table is added by migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClassifiedCard } from "./classifieds.functions";
import { MARKETCHECK_ID } from "./marketcheck-contract";

const listingIdOf = (value: unknown) => {
  const id = String(value ?? "");
  return MARKETCHECK_ID.test(id) ? id : "";
};

export const getPartnerVehicleSaved = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string }) => ({ listingId: listingIdOf(input?.listingId) }))
  .handler(async ({ data, context }) => {
    if (!data.listingId) return { saved: false };
    const { data: row } = await (context.supabase as any)
      .from("saved_partner_vehicles")
      .select("listing_id")
      .eq("user_id", context.userId)
      .eq("listing_id", data.listingId)
      .maybeSingle();
    return { saved: Boolean(row) };
  });

export const setPartnerVehicleSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; saved: boolean }) => {
    const listingId = listingIdOf(input?.listingId);
    if (!listingId) throw new Error("This vehicle can't be saved.");
    return { listingId, saved: Boolean(input.saved) };
  })
  .handler(async ({ data, context }) => {
    const table = (context.supabase as any).from("saved_partner_vehicles");
    if (!data.saved) {
      const { error } = await table
        .delete()
        .eq("user_id", context.userId)
        .eq("listing_id", data.listingId);
      if (error) throw new Error("Could not remove this vehicle. Try again.");
      return { saved: false };
    }
    const { marketCheckDetail } = await import("./marketcheck.server");
    const detail = await marketCheckDetail(data.listingId);
    if (!detail) throw new Error("This vehicle is no longer listed.");
    const { description: _description, seller: _seller, images: _images, ...snapshot } = detail;
    const { error } = await table.upsert(
      { user_id: context.userId, listing_id: data.listingId, snapshot: snapshot as ClassifiedCard },
      { onConflict: "user_id,listing_id" },
    );
    if (error) throw new Error("Could not save this vehicle. Try again.");
    return { saved: true };
  });

export const getMySavedPartnerVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClassifiedCard[]> => {
    const { data, error } = await (context.supabase as any)
      .from("saved_partner_vehicles")
      .select("snapshot")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return [];
    return ((data ?? []) as { snapshot: ClassifiedCard }[]).map((row) => row.snapshot);
  });
