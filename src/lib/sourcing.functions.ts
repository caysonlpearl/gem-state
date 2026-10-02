import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicServerClient } from "./supabase-public.server";

/**
 * Phase 5 — in-park sourcing and approved shoppers.
 *
 * Every write goes through a transactional database function that derives the
 * caller from `auth.uid()`, enforces the shopper role where required, and
 * recalculates the marketplace buyer fee from the effective fee schedule. The
 * client never submits a delivered total or a fee.
 *
 * Identity is never returned across the sourcing boundary: shoppers browse the
 * request board without the buyer's id, and buyers compare quotes by a short
 * opaque reference instead of the shopper's identity.
 */

export const PARK_FREQUENCIES = ["weekly", "monthly", "quarterly", "annually", "rarely"] as const;
export type ParkFrequency = (typeof PARK_FREQUENCIES)[number];

export type ShopperStatus = {
  isShopper: boolean;
  application: {
    id: string;
    status: string;
    parkFrequency: string;
    homeResortId: string | null;
    decisionNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
  } | null;
};

export type SourcingQuote = {
  id: string;
  requestId: string;
  /** Short opaque reference — never the shopper's identity. */
  shopperRef: string;
  merchCostCents: number;
  shopperCompCents: number;
  shippingEstimateCents: number;
  buyerFeeEstimateCents: number;
  deliveredEstimateCents: number;
  currency: string;
  availabilityNote: string | null;
  fulfillmentWindowDays: number;
  expiresAt: string;
  status: string;
  matchedOrderId: string | null;
  createdAt: string;
  /** The quoting shopper's aggregate rating, never their identity. Unset on the shopper's own quote list. */
  shopperAvgRating?: number | null;
  shopperReviewCount?: number | null;
};

export type MySourcingRequest = {
  id: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  status: string;
  maxBudgetCents: number | null;
  currency: string;
  buyerNote: string | null;
  neededBy: string | null;
  quoteCount: number;
  mediaCount: number;
  acceptedQuoteId: string | null;
  matchedOrderId: string | null;
  expiresAt: string;
  createdAt: string;
  quotes: SourcingQuote[];
};

export type BoardRequest = {
  id: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  maxBudgetCents: number | null;
  currency: string;
  buyerNote: string | null;
  neededBy: string | null;
  quoteCount: number;
  mediaCount: number;
  expiresAt: string;
  createdAt: string;
  /** Set when the signed-in shopper already has a live quote on this request. */
  myQuoteId: string | null;
};

export type SourcingOffer = {
  askId: string;
  variantId: string;
  priceCents: number;
  currency: string;
  fulfillmentWindowDays: number;
  createdAt: string;
  /** Display name if the shopper set one, otherwise a stable pseudonym — same as sourcing_options. */
  shopperLabel: string;
  /** Aggregate rating. Null with no reviews yet. */
  avgRating: number | null;
  reviewCount: number;
};

/** A private reference photo, exposed only as a short-lived signed URL. */
export type SourcingMediaItem = {
  mediaId: string;
  url: string;
  caption: string | null;
};

function variantLabel(
  v: { size: string | null; color: string | null; edition: string | null } | null,
) {
  if (!v) return "One variation";
  const parts = [v.size, v.color, v.edition].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "One variation";
}

function ref(id: string) {
  return id.slice(0, 8).toUpperCase();
}

/* ------------------------------------------------------------------ shoppers */

export const getShopperStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShopperStatus> => {
    const { supabase, userId } = context;
    const [{ data: roles, error: roleError }, { data: application, error: appError }] =
      await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("shopper_applications")
          .select(
            "id, status, park_frequency, home_resort_id, decision_note, reviewed_at, created_at",
          )
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
    if (roleError) throw new Error(roleError.message);
    if (appError) throw new Error(appError.message);

    return {
      isShopper: (roles ?? []).some((r) => r.role === "shopper"),
      application: application
        ? {
            id: application.id,
            status: application.status,
            parkFrequency: application.park_frequency,
            homeResortId: application.home_resort_id,
            decisionNote: application.decision_note,
            reviewedAt: application.reviewed_at,
            createdAt: application.created_at,
          }
        : null,
    };
  });

export const applyAsShopper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      parkFrequency: string;
      idDocumentPath: string;
      homeResortId?: string | null;
      applicantNote?: string | null;
    }) => {
      if (!(PARK_FREQUENCIES as readonly string[]).includes(input.parkFrequency)) {
        throw new Error("Choose how often you visit the parks.");
      }
      const path = String(input.idDocumentPath ?? "");
      if (!path) throw new Error("Attach an identity document.");
      const note = (input.applicantNote ?? "").trim();
      if (note.length > 500) throw new Error("Your note is too long.");
      return {
        parkFrequency: input.parkFrequency,
        idDocumentPath: path,
        homeResortId: input.homeResortId || null,
        applicantNote: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("apply_as_shopper", {
      _park_frequency: data.parkFrequency,
      _id_document_path: data.idDocumentPath,
      // The column is nullable in the database; the generated type is narrower.
      _home_resort_id: data.homeResortId as unknown as string,
      ...(data.applicantNote ? { _applicant_note: data.applicantNote } : {}),
    });
    if (error) throw new Error(error.message);
    return { applicationId: id as string };
  });

/* --------------------------------------------------------- sourcing requests */

export const createSourcingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      variantId: string;
      maxBudgetCents?: number | null;
      buyerNote?: string | null;
      neededBy?: string | null;
      targetLocationId?: string | null;
      mediaPaths?: string[];
    }) => {
      const variantId = String(input.variantId ?? "");
      if (!variantId) throw new Error("Choose the variation you need.");
      let budget: number | null = null;
      if (input.maxBudgetCents != null && input.maxBudgetCents !== 0) {
        budget = Math.round(Number(input.maxBudgetCents));
        if (!Number.isFinite(budget) || budget < 100 || budget > 5_000_000) {
          throw new Error("Enter a budget between $1.00 and $50,000.");
        }
      }
      const note = (input.buyerNote ?? "").trim();
      if (note.length > 500) throw new Error("Your note is too long.");
      const media = (input.mediaPaths ?? [])
        .filter((p) => typeof p === "string" && p.length > 0)
        .slice(0, 6);
      const neededBy = (input.neededBy ?? "").trim();
      if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) throw new Error("Enter a valid date.");
      return {
        variantId,
        maxBudgetCents: budget,
        buyerNote: note || null,
        neededBy: neededBy || null,
        targetLocationId: input.targetLocationId || null,
        mediaPaths: media,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_sourcing_request", {
      _variant_id: data.variantId,
      _media_paths: data.mediaPaths,
      ...(data.maxBudgetCents != null ? { _max_budget_cents: data.maxBudgetCents } : {}),
      ...(data.buyerNote ? { _buyer_note: data.buyerNote } : {}),
      ...(data.neededBy ? { _needed_by: data.neededBy } : {}),
      ...(data.targetLocationId ? { _target_location_id: data.targetLocationId } : {}),
    });
    if (error) throw new Error(error.message);
    return { requestId: id as string };
  });

export const cancelSourcingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { requestId: string }) => ({ requestId: String(input.requestId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_sourcing_request", {
      _request_id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Private reference media for one sourcing request, returned as short-lived
 * signed URLs. Authorisation is decided in the database
 * (`sourcing_request_media`): the requester always, any approved shopper while
 * the request is still open, only the accepted shopper once it closes, plus
 * moderators/administrators whose access is written to the admin audit log.
 * The raw storage path never leaves the server.
 */
export const getSourcingRequestMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { requestId: string }) => ({ requestId: String(input.requestId) }))
  .handler(async ({ data, context }): Promise<SourcingMediaItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("sourcing_request_media", {
      _request_id: data.requestId,
      _caller: context.userId,
    });
    if (error) throw new Error(error.message);

    const items: SourcingMediaItem[] = [];
    for (const row of rows ?? []) {
      const signed = await supabaseAdmin.storage
        .from("request-media")
        .createSignedUrl(row.storage_path as string, 120);
      if (signed.error || !signed.data?.signedUrl) continue;
      items.push({
        mediaId: row.media_id as string,
        url: signed.data.signedUrl,
        caption: (row.caption as string | null) ?? null,
      });
    }
    return items;
  });

export const getMySourcingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySourcingRequest[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("sourcing_requests")
      .select(
        "id, variant_id, status, max_budget_cents, currency, buyer_note, needed_by, quote_count, media_count, accepted_quote_id, matched_order_id, expires_at, created_at, products(slug, name), product_variants(size, color, edition)",
      )
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Quotes come back through a sanitized function that never returns the
    // quoting shopper's identity — buyers compare by opaque reference only.
    const { data: quoteRows, error: quoteError } = await supabase.rpc("quotes_for_my_requests");
    if (quoteError) throw new Error(quoteError.message);
    const quotes: SourcingQuote[] = (quoteRows ?? []).map((q) => ({
      id: q.quote_id,
      requestId: q.request_id,
      shopperRef: ref(q.quote_id),
      merchCostCents: q.merch_cost_cents,
      shopperCompCents: q.shopper_comp_cents,
      shippingEstimateCents: q.shipping_estimate_cents,
      buyerFeeEstimateCents: q.buyer_fee_estimate_cents,
      deliveredEstimateCents: q.delivered_estimate_cents,
      currency: q.currency,
      availabilityNote: q.availability_note,
      fulfillmentWindowDays: q.fulfillment_window_days,
      expiresAt: q.expires_at,
      status: q.status,
      matchedOrderId: q.matched_order_id,
      createdAt: q.created_at,
      shopperAvgRating: (q as Record<string, unknown>)["shopper_avg_rating"] as number | null,
      shopperReviewCount: (q as Record<string, unknown>)["shopper_review_count"] as number | null,
    }));

    return (rows ?? []).map((row) => {
      const product = row.products as { slug: string; name: string } | null;
      return {
        id: row.id,
        productSlug: product?.slug ?? "",
        productName: product?.name ?? "Unknown product",
        variantId: row.variant_id,
        variantLabel: variantLabel(
          row.product_variants as {
            size: string | null;
            color: string | null;
            edition: string | null;
          } | null,
        ),
        status: row.status,
        maxBudgetCents: row.max_budget_cents,
        currency: row.currency,
        buyerNote: row.buyer_note,
        neededBy: row.needed_by,
        quoteCount: row.quote_count,
        mediaCount: row.media_count,
        acceptedQuoteId: row.accepted_quote_id,
        matchedOrderId: row.matched_order_id,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        quotes: quotes.filter((q) => q.requestId === row.id),
      };
    });
  });

export const acceptShopperQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { quoteId: string }) => ({ quoteId: String(input.quoteId) }))
  .handler(async ({ data, context }) => {
    const { data: orderId, error } = await context.supabase.rpc("accept_shopper_quote", {
      _quote_id: data.quoteId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });

/* --------------------------------------------------------------- quote board */

export const getSourcingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BoardRequest[]> => {
    // Sanitized board: approved shoppers never receive the buyer's identity.
    const { data: rows, error } = await context.supabase.rpc("sourcing_board");
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => ({
      id: row.request_id,
      productSlug: row.product_slug,
      productName: row.product_name,
      variantId: row.variant_id,
      variantLabel: variantLabel({
        size: row.variant_size,
        color: row.variant_color,
        edition: row.variant_edition,
      }),
      maxBudgetCents: row.max_budget_cents,
      currency: row.currency,
      buyerNote: row.buyer_note,
      neededBy: row.needed_by,
      quoteCount: row.quote_count,
      mediaCount: row.media_count,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      myQuoteId: row.my_quote_id,
    }));
  });

export const submitShopperQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      requestId: string;
      merchCostCents: number;
      shopperCompCents: number;
      shippingEstimateCents: number;
      fulfillmentWindowDays: number;
      availabilityNote?: string | null;
      validForDays?: number;
    }) => {
      const merch = Math.round(Number(input.merchCostCents));
      if (!Number.isFinite(merch) || merch < 100 || merch > 5_000_000) {
        throw new Error("Enter a merchandise cost between $1.00 and $50,000.");
      }
      const comp = Math.round(Number(input.shopperCompCents ?? 0));
      if (!Number.isFinite(comp) || comp < 0 || comp > 500_000) {
        throw new Error("Enter your compensation between $0 and $5,000.");
      }
      const shipping = Math.round(Number(input.shippingEstimateCents ?? 0));
      if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100_000) {
        throw new Error("Enter a shipping estimate between $0 and $1,000.");
      }
      const window = Math.round(Number(input.fulfillmentWindowDays));
      if (!Number.isFinite(window) || window < 1 || window > 60) {
        throw new Error("State a fulfillment window between 1 and 60 days.");
      }
      const valid = Math.round(Number(input.validForDays ?? 7));
      if (!Number.isFinite(valid) || valid < 1 || valid > 30) {
        throw new Error("Quote validity must be between 1 and 30 days.");
      }
      const note = (input.availabilityNote ?? "").trim();
      if (note.length > 500) throw new Error("Availability note is too long.");
      return {
        requestId: String(input.requestId),
        merchCostCents: merch,
        shopperCompCents: comp,
        shippingEstimateCents: shipping,
        fulfillmentWindowDays: window,
        validForDays: valid,
        availabilityNote: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("submit_shopper_quote", {
      _request_id: data.requestId,
      _merch_cost_cents: data.merchCostCents,
      _shopper_comp_cents: data.shopperCompCents,
      _shipping_estimate_cents: data.shippingEstimateCents,
      _fulfillment_window_days: data.fulfillmentWindowDays,
      _valid_for_days: data.validForDays,
      ...(data.availabilityNote ? { _availability_note: data.availabilityNote } : {}),
    });
    if (error) throw new Error(error.message);
    return { quoteId: id as string };
  });

export const withdrawShopperQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { quoteId: string }) => ({ quoteId: String(input.quoteId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("withdraw_shopper_quote", {
      _quote_id: data.quoteId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getMyQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<(SourcingQuote & { productName: string; variantLabel: string })[]> => {
      const { supabase, userId } = context;
      const { data, error } = await supabase
        .from("shopper_quotes")
        .select(
          "id, request_id, merch_cost_cents, shopper_comp_cents, shipping_estimate_cents, buyer_fee_estimate_cents, delivered_estimate_cents, currency, availability_note, fulfillment_window_days, expires_at, status, matched_order_id, created_at, sourcing_requests!shopper_quotes_request_id_fkey(products(name), product_variants(size, color, edition))",
        )
        .eq("shopper_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      return (data ?? []).map((q) => {
        const request = q.sourcing_requests as {
          products: { name: string } | null;
          product_variants: {
            size: string | null;
            color: string | null;
            edition: string | null;
          } | null;
        } | null;
        return {
          id: q.id,
          requestId: q.request_id,
          shopperRef: ref(q.id),
          merchCostCents: q.merch_cost_cents,
          shopperCompCents: q.shopper_comp_cents,
          shippingEstimateCents: q.shipping_estimate_cents,
          buyerFeeEstimateCents: q.buyer_fee_estimate_cents,
          deliveredEstimateCents: q.delivered_estimate_cents,
          currency: q.currency,
          availabilityNote: q.availability_note,
          fulfillmentWindowDays: q.fulfillment_window_days,
          expiresAt: q.expires_at,
          status: q.status,
          matchedOrderId: q.matched_order_id,
          createdAt: q.created_at,
          productName: request?.products?.name ?? "Unknown product",
          variantLabel: variantLabel(request?.product_variants ?? null),
        };
      });
    },
  );

/* ------------------------------------------------------------ sourcing Asks */

/** Public, identity-free list of open sourcing offers for a variation. */
export const getSourcingOffers = createServerFn({ method: "GET" })
  .validator((input: { variantId: string }) => ({
    variantId: String(input.variantId).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<SourcingOffer[]> => {
    const client = publicServerClient();
    const { data: rows, error } = await client
      .from("variant_sourcing_offers")
      .select(
        "ask_id, variant_id, price_cents, currency, fulfillment_window_days, created_at, avg_rating, review_count, shopper_label",
      )
      .eq("variant_id", data.variantId)
      .order("price_cents", { ascending: true })
      .limit(20);
    if (error) {
      console.error("getSourcingOffers failed", error.message);
      throw new Error("Could not load posted sourcing offers.");
    }
    return (rows ?? []).map((r) => ({
      askId: r.ask_id as string,
      variantId: r.variant_id as string,
      priceCents: r.price_cents as number,
      currency: r.currency as string,
      fulfillmentWindowDays: r.fulfillment_window_days as number,
      createdAt: r.created_at as string,
      shopperLabel: r.shopper_label as string,
      avgRating: r.avg_rating as number | null,
      reviewCount: (r.review_count as number | null) ?? 0,
    }));
  });

export const placeSourcingAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      variantId: string;
      priceCents: number;
      fulfillmentWindowDays: number;
      sellerNote?: string | null;
    }) => {
      const priceCents = Math.round(Number(input.priceCents));
      if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 5_000_000) {
        throw new Error("Enter a price between $1.00 and $50,000.");
      }
      const window = Math.round(Number(input.fulfillmentWindowDays));
      if (!Number.isFinite(window) || window < 1 || window > 60) {
        throw new Error("State a fulfillment window between 1 and 60 days.");
      }
      const note = (input.sellerNote ?? "").trim();
      if (note.length > 500) throw new Error("Note is too long.");
      return {
        variantId: String(input.variantId),
        priceCents,
        fulfillmentWindowDays: window,
        sellerNote: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: askId, error } = await context.supabase.rpc("place_sourcing_ask", {
      _variant_id: data.variantId,
      _price_cents: data.priceCents,
      _fulfillment_window_days: data.fulfillmentWindowDays,
      ...(data.sellerNote ? { _seller_note: data.sellerNote } : {}),
    });
    if (error) throw new Error(error.message);
    return { askId: askId as string };
  });

export const requestSourcingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { askId: string }) => ({ askId: String(input.askId) }))
  .handler(async ({ data, context }) => {
    const { data: orderId, error } = await context.supabase.rpc("request_sourcing_ask", {
      _ask_id: data.askId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });
