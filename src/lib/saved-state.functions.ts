/* eslint-disable @typescript-eslint/no-explicit-any -- partner tables lag generated types */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withCatalogReadDeadline } from "./catalog-read-deadline";
import { savedStateRequest, type SavedStateResult } from "./saved-state-contract";

/** Private card state: authenticated RLS client and caller-owned rows only. */
export const getSavedListingStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(savedStateRequest)
  .handler(async ({ data, context }): Promise<SavedStateResult> => {
    // A queued client batch may outlive an account switch. Never put the next
    // account's state into a previous account's query cache.
    if (context.userId !== data.viewerId) throw new Error("Saved-listing account changed.");
    const db = context.supabase as any;
    const states: SavedStateResult = Object.fromEntries(data.ids.map((id) => [id, false]));
    if (data.kind !== "products") {
      const tables = {
        jobs: "saved_partner_jobs",
        homes: "saved_partner_homes",
        vehicles: "saved_partner_vehicles",
      };
      const { data: rows, error } = await withCatalogReadDeadline<any>(
        db
          .from(tables[data.kind])
          .select("listing_id")
          .eq("user_id", context.userId)
          .in("listing_id", data.ids),
      );
      if (error) throw new Error("Saved listings could not be read.");
      for (const row of rows ?? []) if (row.listing_id in states) states[row.listing_id] = true;
      return states;
    }
    // Preserve the existing product-heart rule: the earliest variation is the
    // one toggled by setProductWatchState, not an arbitrary watched variation.
    const { data: products, error: productError } = await withCatalogReadDeadline<any>(
      db
        .from("products")
        .select("id,product_variants(id)")
        .in("id", data.ids)
        .order("created_at", { ascending: true, referencedTable: "product_variants" })
        .limit(1, { referencedTable: "product_variants" }),
    );
    if (productError) throw new Error("Saved listings could not be read.");
    const firstByProduct = new Map<string, string>(
      (products ?? []).flatMap((p: any) =>
        p.product_variants?.[0]?.id ? [[p.id, p.product_variants[0].id]] : [],
      ),
    );
    if (!firstByProduct.size) return states;
    const { data: watched, error } = await withCatalogReadDeadline<any>(
      db
        .from("watchlist")
        .select("variant_id")
        .eq("user_id", context.userId)
        .in("variant_id", [...firstByProduct.values()]),
    );
    if (error) throw new Error("Saved listings could not be read.");
    const saved = new Set((watched ?? []).map((r: any) => r.variant_id));
    for (const [product, variant] of firstByProduct) states[product] = saved.has(variant);
    return states;
  });
