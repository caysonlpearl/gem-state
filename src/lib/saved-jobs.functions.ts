/* eslint-disable @typescript-eslint/no-explicit-any -- table added after the generated types */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClassifiedCard } from "./classifieds.functions";

/**
 * Saving partner (Adzuna) jobs. They aren't Bluebird products, so they can't
 * go in the watchlist; they're kept in saved_partner_jobs with a snapshot of
 * the card, taken from the server's own Adzuna cache when the member saves.
 */
const listingIdOf = (value: unknown) => {
  const id = String(value ?? "");
  return /^adzuna-\d{1,20}$/.test(id) ? id : "";
};

export const getPartnerJobSaved = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string }) => ({ listingId: listingIdOf(input?.listingId) }))
  .handler(async ({ data, context }) => {
    if (!data.listingId) return { saved: false };
    const { data: row } = await (context.supabase as any)
      .from("saved_partner_jobs")
      .select("listing_id")
      .eq("user_id", context.userId)
      .eq("listing_id", data.listingId)
      .maybeSingle();
    return { saved: Boolean(row) };
  });

export const setPartnerJobSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string; saved: boolean }) => {
    const listingId = listingIdOf(input?.listingId);
    if (!listingId) throw new Error("This job can't be saved.");
    return { listingId, saved: Boolean(input.saved) };
  })
  .handler(async ({ data, context }) => {
    const table = (context.supabase as any).from("saved_partner_jobs");
    if (!data.saved) {
      const { error } = await table
        .delete()
        .eq("user_id", context.userId)
        .eq("listing_id", data.listingId);
      if (error) throw new Error("Could not remove this job. Try again.");
      return { saved: false };
    }
    const { adzunaDetail } = await import("./adzuna-listings.server");
    const job = await adzunaDetail(data.listingId);
    if (!job) throw new Error("This job is no longer listed.");
    const { description: _d, seller: _s, images: _i, ...card } = job;
    const { error } = await table.upsert(
      { user_id: context.userId, listing_id: data.listingId, snapshot: card },
      { onConflict: "user_id,listing_id" },
    );
    if (error) throw new Error("Could not save this job. Try again.");
    return { saved: true };
  });

export const getMySavedPartnerJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClassifiedCard[]> => {
    const { data, error } = await (context.supabase as any)
      .from("saved_partner_jobs")
      .select("snapshot")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    // Before the table exists (or on any read error) there's simply nothing saved.
    if (error) return [];
    return ((data ?? []) as { snapshot: ClassifiedCard }[]).map((row) => row.snapshot);
  });
