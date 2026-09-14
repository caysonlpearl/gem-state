import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicServerClient } from "./supabase-public.server";

/**
 * Phase 6 — community & signals.
 *
 * Three read-only public signals (sightings, price history, market summary) and
 * three authenticated member actions (report a sighting, respond to one, follow
 * a variation). Every signal is identity-free on the read path: the public
 * sighting feed is served by a definer view that never selects `reporter_id`,
 * and price history is a per-variation aggregate.
 *
 * Nothing here is simulated. When there is no data, the caller receives an
 * empty list and the UI says so plainly.
 */

export const SIGHTING_AVAILABILITY = ["in_stock", "limited", "sold_out"] as const;
export type SightingAvailability = (typeof SIGHTING_AVAILABILITY)[number];

export const availabilityLabels: Record<string, string> = {
  in_stock: "On the shelf",
  limited: "Only a few left",
  sold_out: "Sold out at this location",
};

export type Sighting = {
  id: string;
  variantId: string;
  locationName: string;
  locationArea: string | null;
  locationGranularity: string;
  parkName: string;
  resortName: string;
  resortCode: string;
  seenAt: string;
  availability: string;
  priceCents: number | null;
  note: string | null;
  confirmationCount: number;
};

export type PricePoint = {
  capturedOn: string;
  lowestAskCents: number | null;
  highestBidCents: number | null;
  lowestSourcingAskCents: number | null;
  lastSaleCents: number | null;
};

export type WatchedVariant = {
  variantId: string;
  /** Classified listings use one private product/variant adapter per item. */
  listingId: string | null;
  productSlug: string;
  productName: string;
  variantLabel: string;
  createdAt: string;
  lowestAskCents: number | null;
  highestBidCents: number | null;
  activeAskCount: number;
  activeBidCount: number;
  sightingCount: number;
};

function variantLabel(v: { size: string | null; color: string | null; edition: string | null } | null) {
  if (!v) return "One variation";
  const parts = [v.size, v.color, v.edition].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "One variation";
}

/* ------------------------------------------------------------------ sightings */

/** Public, identity-free sighting feed for one variation. */
export const getVariantSightings = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId).slice(0, 40) }))
  .handler(async ({ data }): Promise<Sighting[]> => {
    const client = publicServerClient();
    const { data: rows, error } = await client
      .from("variant_sightings_public")
      .select(
        "sighting_id, variant_id, location_name, location_area, location_granularity, park_name, resort_name, resort_code, seen_at, availability, price_cents, note, confirmation_count",
      )
      .eq("variant_id", data.variantId)
      .order("seen_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("getVariantSightings failed", error.message);
      return [];
    }

    return (rows ?? []).map((r) => ({
      id: r.sighting_id as string,
      variantId: r.variant_id as string,
      locationName: r.location_name as string,
      locationArea: (r.location_area as string | null) ?? null,
      locationGranularity: r.location_granularity as string,
      parkName: r.park_name as string,
      resortName: r.resort_name as string,
      resortCode: r.resort_code as string,
      seenAt: r.seen_at as string,
      availability: r.availability as string,
      priceCents: (r.price_cents as number | null) ?? null,
      note: (r.note as string | null) ?? null,
      confirmationCount: Number(r.confirmation_count ?? 0),
    }));
  });

export const reportSighting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      variantId: string;
      locationId: string;
      availability: SightingAvailability;
      priceCents: number | null;
      note: string | null;
      seenAt: string | null;
    }) => {
      if (!SIGHTING_AVAILABILITY.includes(input.availability)) {
        throw new Error("Choose what you saw on the shelf.");
      }
      let priceCents: number | null = null;
      if (input.priceCents != null) {
        priceCents = Math.round(Number(input.priceCents));
        if (!Number.isFinite(priceCents) || priceCents <= 0 || priceCents > 500_000) {
          throw new Error("Observed price must be between $0.01 and $5,000.");
        }
      }
      return {
        variantId: String(input.variantId).slice(0, 40),
        locationId: String(input.locationId).slice(0, 40),
        availability: input.availability,
        priceCents,
        note: input.note ? String(input.note).slice(0, 280) : null,
        seenAt: input.seenAt ? new Date(input.seenAt).toISOString() : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("report_sighting", {
      _variant_id: data.variantId,
      _location_id: data.locationId,
      _availability: data.availability,
      ...(data.priceCents != null ? { _price_cents: data.priceCents } : {}),
      ...(data.note ? { _note: data.note } : {}),
      ...(data.seenAt ? { _seen_at: data.seenAt } : {}),
    });
    if (error) throw new Error(error.message);
    return { sightingId: id as string };
  });

export const respondToSighting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sightingId: string; kind: "confirm" | "flag" }) => {
    if (input.kind !== "confirm" && input.kind !== "flag") throw new Error("Unsupported response.");
    return { sightingId: String(input.sightingId).slice(0, 40), kind: input.kind };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("respond_to_sighting", {
      _sighting_id: data.sightingId,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------- price history */

/** Public daily aggregate history. Empty until the first capture runs. */
export const getPriceHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId).slice(0, 40) }))
  .handler(async ({ data }): Promise<PricePoint[]> => {
    const client = publicServerClient();
    const { data: rows, error } = await client
      .from("price_snapshots")
      .select(
        "captured_on, lowest_ask_cents, highest_bid_cents, lowest_sourcing_ask_cents, last_sale_cents",
      )
      .eq("variant_id", data.variantId)
      .order("captured_on", { ascending: true })
      .limit(90);

    if (error) {
      console.error("getPriceHistory failed", error.message);
      return [];
    }

    return (rows ?? []).map((r) => ({
      capturedOn: r.captured_on as string,
      lowestAskCents: (r.lowest_ask_cents as number | null) ?? null,
      highestBidCents: (r.highest_bid_cents as number | null) ?? null,
      lowestSourcingAskCents: (r.lowest_sourcing_ask_cents as number | null) ?? null,
      lastSaleCents: (r.last_sale_cents as number | null) ?? null,
    }));
  });

/* ------------------------------------------------------------------ watchers */

/** Public, identity-free watcher count for one variation. */
export const getVariantWatcherCount = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({
    variantId: String(input.variantId).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<{ watcherCount: number }> => {
    const client = publicServerClient();
    const { data: row, error } = await client
      .from("variant_watch_counts")
      .select("watcher_count")
      .eq("variant_id", data.variantId)
      .maybeSingle();
    if (error) {
      console.error("getVariantWatcherCount failed", error.message);
      return { watcherCount: 0 };
    }
    return { watcherCount: Number(row?.watcher_count ?? 0) };
  });

/* ------------------------------------------------------------------ watchlist */



export const getWatchState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId).slice(0, 40) }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", context.userId)
      .eq("variant_id", data.variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { watching: Boolean(row) };
  });

export const setWatchState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string; watching: boolean }) => ({
    variantId: String(input.variantId).slice(0, 40),
    watching: Boolean(input.watching),
  }))
  .handler(async ({ data, context }) => {
    if (data.watching) {
      const { error } = await context.supabase
        .from("watchlist")
        .upsert(
          { user_id: context.userId, variant_id: data.variantId },
          { onConflict: "user_id,variant_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("watchlist")
        .delete()
        .eq("user_id", context.userId)
        .eq("variant_id", data.variantId);
      if (error) throw new Error(error.message);
    }
    return { watching: data.watching };
  });

export const getMyWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WatchedVariant[]> => {
    const { data: rows, error } = await context.supabase
      .from("watchlist")
      .select(
        "variant_id, created_at, product_variants!inner(id, size, color, edition, products!inner(slug, name))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const variantIds = (rows ?? []).map((r) => r.variant_id as string);
    if (variantIds.length === 0) return [];

    const client = publicServerClient();
    const [{ data: markets }, { data: sightings }, { data: classifiedListings }] = await Promise.all([
      client
        .from("variant_market_summary")
        .select("variant_id, lowest_ask_cents, highest_bid_cents, active_ask_count, active_bid_count")
        .in("variant_id", variantIds),
      client.from("variant_sightings_public").select("variant_id").in("variant_id", variantIds),
      client
        .from("asks")
        .select("id,variant_id,products!inner(status)")
        .in("variant_id", variantIds)
        .eq("status", "active")
        .eq("is_demo", false)
        .not("approved_at", "is", null)
        .gt("expires_at", new Date().toISOString())
        .eq("products.status", "published")
        .limit(100),
    ]);

    const marketByVariant = new Map(
      (markets ?? []).map((m) => [m.variant_id as string, m]),
    );
    const sightingCounts = new Map<string, number>();
    for (const s of sightings ?? []) {
      const key = s.variant_id as string;
      sightingCounts.set(key, (sightingCounts.get(key) ?? 0) + 1);
    }
    const listingByVariant = new Map(
      (classifiedListings ?? []).map((row) => [row.variant_id as string, row.id as string]),
    );

    return (rows ?? []).map((r) => {
      const variant = r.product_variants as unknown as {
        size: string | null;
        color: string | null;
        edition: string | null;
        products: { slug: string; name: string };
      };
      const market = marketByVariant.get(r.variant_id as string);
      return {
        variantId: r.variant_id as string,
        listingId: listingByVariant.get(r.variant_id as string) ?? null,
        productSlug: variant.products.slug,
        productName: variant.products.name,
        variantLabel: variantLabel(variant),
        createdAt: r.created_at as string,
        lowestAskCents: (market?.lowest_ask_cents as number | null) ?? null,
        highestBidCents: (market?.highest_bid_cents as number | null) ?? null,
        activeAskCount: Number(market?.active_ask_count ?? 0),
        activeBidCount: Number(market?.active_bid_count ?? 0),
        sightingCount: sightingCounts.get(r.variant_id as string) ?? 0,
      };
    });
  });

/* --------------------------------------------------------- product suggestion */

export type MySuggestion = {
  id: string;
  name: string;
  status: string;
  reviewerNote: string | null;
  createdAt: string;
};

export const submitProductSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      brandText: string | null;
      collectionText: string | null;
      resortCodes: string[];
      releaseNotes: string | null;
      proposedVariations: string | null;
    }) => {
      const name = String(input.name ?? "").trim();
      if (name.length < 3 || name.length > 160) {
        throw new Error("Give the product a name between 3 and 160 characters.");
      }
      const resortCodes = (input.resortCodes ?? []).map((c) => String(c).slice(0, 8).toUpperCase());
      if (resortCodes.length === 0) throw new Error("Choose at least one resort.");
      return {
        name,
        brandText: input.brandText ? String(input.brandText).slice(0, 120) : null,
        collectionText: input.collectionText ? String(input.collectionText).slice(0, 120) : null,
        resortCodes,
        releaseNotes: input.releaseNotes ? String(input.releaseNotes).slice(0, 600) : null,
        proposedVariations: input.proposedVariations
          ? String(input.proposedVariations).slice(0, 600)
          : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("submit_product_suggestion", {
      _name: data.name,
      _resort_codes: data.resortCodes,
      ...(data.brandText ? { _brand_text: data.brandText } : {}),
      ...(data.collectionText ? { _collection_text: data.collectionText } : {}),
      ...(data.releaseNotes ? { _release_notes: data.releaseNotes } : {}),
      ...(data.proposedVariations ? { _proposed_variations: data.proposedVariations } : {}),
    });
    if (error) throw new Error(error.message);
    return { suggestionId: id as string };
  });

export const getMySuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySuggestion[]> => {
    const { data: rows, error } = await context.supabase
      .from("product_suggestions")
      .select("id, name, status, reviewer_note, created_at")
      .eq("submitted_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      status: r.status as string,
      reviewerNote: (r.reviewer_note as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });

/* ------------------------------------------------- product-level quick watch */

/**
 * Convenience wrappers so a product card can offer a one-tap watchlist heart.
 * The watchlist itself stays variation-level; these resolve the product's first
 * variation so the member does not have to open the product page first.
 */

async function firstVariantId(
  client: { from: (t: string) => any },
  productId: string,
): Promise<string | null> {
  const { data } = await client
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export const getProductWatchState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => ({
    productId: String(input.productId).slice(0, 40),
  }))
  .handler(async ({ data, context }) => {
    const variantId = await firstVariantId(context.supabase, data.productId);
    if (!variantId) return { watching: false, watchable: false };
    const { data: row, error } = await context.supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", context.userId)
      .eq("variant_id", variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { watching: Boolean(row), watchable: true };
  });

export const setProductWatchState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; watching: boolean }) => ({
    productId: String(input.productId).slice(0, 40),
    watching: Boolean(input.watching),
  }))
  .handler(async ({ data, context }) => {
    const variantId = await firstVariantId(context.supabase, data.productId);
    if (!variantId) throw new Error("This product has no variation to follow yet.");
    if (data.watching) {
      const { error } = await context.supabase
        .from("watchlist")
        .upsert(
          { user_id: context.userId, variant_id: variantId },
          { onConflict: "user_id,variant_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("watchlist")
        .delete()
        .eq("user_id", context.userId)
        .eq("variant_id", variantId);
      if (error) throw new Error(error.message);
    }
    return { watching: data.watching, variantId };
  });
