/* eslint-disable @typescript-eslint/no-explicit-any -- table added by migration */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClassifiedCard } from "./classifieds.functions";

const listingIdOf = (value: unknown) => {
  const id = String(value ?? "");
  return /^(mashvisor-\d{1,15}|openwebninja-\d{1,20})$/.test(id) ? id : "";
};

export const getPartnerHomeSaved = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string }) => ({ listingId: listingIdOf(input?.listingId) }))
  .handler(async ({ data, context }) => {
    if (!data.listingId) return { saved: false };
    const { data: row } = await (context.supabase as any)
      .from("saved_partner_homes")
      .select("listing_id")
      .eq("user_id", context.userId)
      .eq("listing_id", data.listingId)
      .maybeSingle();
    return { saved: Boolean(row) };
  });

export const setPartnerHomeSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; saved: boolean }) => {
    const listingId = listingIdOf(input?.listingId);
    if (!listingId) throw new Error("This home can't be saved.");
    return { listingId, saved: Boolean(input.saved) };
  })
  .handler(async ({ data, context }) => {
    const table = (context.supabase as any).from("saved_partner_homes");
    if (!data.saved) {
      const { error } = await table
        .delete()
        .eq("user_id", context.userId)
        .eq("listing_id", data.listingId);
      if (error) throw new Error("Could not remove this home. Try again.");
      return { saved: false };
    }
    // Saving from a feed card should not spend a call on the detail endpoint.
    const isOpenWebNinja = data.listingId.startsWith("openwebninja-");
    const id = data.listingId.slice(isOpenWebNinja ? "openwebninja-".length : "mashvisor-".length);
    let snapshot: ClassifiedCard;
    if (isOpenWebNinja) {
      const cached = await (await import("./openwebninja.server")).cachedHome(id);
      if (!cached?.home) throw new Error("This home is no longer listed.");
      snapshot = (await import("./openwebninja-listings.server")).openWebNinjaCard(cached.home);
    } else {
      const cached = await (await import("./mashvisor.server")).cachedHome(id);
      if (!cached?.home) throw new Error("This home is no longer listed.");
      snapshot = (await import("./mashvisor-listings.server")).mashvisorCard(cached.home);
    }
    const { error } = await table.upsert(
      { user_id: context.userId, listing_id: data.listingId, snapshot },
      { onConflict: "user_id,listing_id" },
    );
    if (error) throw new Error("Could not save this home. Try again.");
    return { saved: true };
  });

export const getMySavedPartnerHomes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClassifiedCard[]> => {
    const { data, error } = await (context.supabase as any)
      .from("saved_partner_homes")
      .select("snapshot")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return [];
    return ((data ?? []) as { snapshot: ClassifiedCard }[]).map((row) => row.snapshot);
  });
