/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase client types lag the applied seller migration until the next linked type generation */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicServerClient } from "./supabase-public.server";

/**
 * Phase 4 marketplace service boundary.
 *
 * Every price, fee and total is recomputed inside the database from the
 * effective `fee_schedules` row. Nothing here trusts a client-supplied amount.
 * Matching runs in transactional SQL functions with row locking, so two buyers
 * can never take the same Ask.
 */

export const ITEM_CONDITIONS = [
  "new_with_tags",
  "new_without_tags",
  "used_excellent",
  "used_good",
] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export type VariantMarket = {
  variantId: string;
  lowestAskCents: number | null;
  activeAskCount: number;
  highestBidCents: number | null;
  activeBidCount: number;
  /** Bids with real payment authorization. Zero during the validation pilot. */
  authorizedBidCount: number;
};

export type MyListing = {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  priceCents: number;
  currency: string;
  status: string;
  approvedAt: string | null;
  expiresAt: string;
  createdAt: string;
  evidenceCount?: number;
  publicMediaCount?: number;
  paymentAuthorized?: boolean;
  matchedOrderId: string | null;
  thumbnailUrl?: string;
  highestBidCents?: number | null;
  activeBidCount?: number;
  authorizedBidCount?: number;
};

export type MyOrder = {
  id: string;
  orderNumber: string;
  role: "buyer" | "seller";
  productSlug: string;
  productName: string;
  variantLabel: string;
  origin: string;
  status: string;
  currency: string;
  merchandiseCents: number;
  buyerFeeCents: number;
  sellerFeeCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  payoutCents: number;
  reservationExpiresAt: string | null;
  paymentAuthorized: boolean;
  paymentStatus: string | null;
  createdAt: string;
};

export type ListingOffer = {
  id: string;
  askId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  listingPriceCents: number;
  amountCents: number;
  sellerCounterCents: number | null;
  currency: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  buyerFeeCents: number;
  sellerFeeCents: number;
  shippingCents: number;
  taxCents: number;
  buyerTotalCents: number;
  sellerPayoutCents: number;
  paymentAuthorized: boolean;
  authorizationExpiresAt: string | null;
  paymentStatus: string | null;
};

export type OrderDetail = MyOrder & {
  imageSrc: string | null;
  imageAlt: string;
  feeSnapshot: Record<string, string | number | boolean | null>;
  events: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
  }[];
};

function label(v: { size: string | null; color: string | null; edition: string | null } | null) {
  if (!v) return "One variation";
  const parts = [v.size, v.color, v.edition].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "One variation";
}

export type MarketSettings = {
  /** When false, no payment is ever taken and buy/sell actions are requests. */
  liveCheckoutEnabled: boolean;
  reservationMinutes: number;
  /**
   * Centralized pilot scope flags, read from the single `market_settings` row.
   * Custom buyer sourcing requests and multi-quote shopper bidding are OUT of
   * the validation MVP: the database refuses those writes while the flags are
   * false, and the UI hides every entry point behind the same flags so the two
   * can never disagree.
   */
  customSourcingRequestsEnabled: boolean;
  shopperQuotesEnabled: boolean;
};

/**
 * Public pilot configuration. Drives the honest action labels: while
 * `liveCheckoutEnabled` is false the UI must never say "Buy Now"/"Sell Now"
 * or imply that payment has happened.
 */
export const getMarketSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketSettings> => {
    const client = publicServerClient();
    const { data, error } = await client
      .from("market_settings")
      .select(
        "live_checkout_enabled, pilot_reservation_minutes, checkout_reservation_minutes, custom_sourcing_requests_enabled, shopper_quotes_enabled",
      )
      .maybeSingle();

    if (error || !data) {
      // Fail closed: assume checkout is NOT live and the dormant flows stay
      // dormant, so copy and entry points stay honest.
      return {
        liveCheckoutEnabled: false,
        reservationMinutes: 2880,
        customSourcingRequestsEnabled: false,
        shopperQuotesEnabled: false,
      };
    }
    return {
      liveCheckoutEnabled: data.live_checkout_enabled,
      reservationMinutes: data.live_checkout_enabled
        ? data.checkout_reservation_minutes
        : data.pilot_reservation_minutes,
      customSourcingRequestsEnabled: data.custom_sourcing_requests_enabled,
      shopperQuotesEnabled: data.shopper_quotes_enabled,
    };
  },
);

/** Public, identity-free market summary for a product's variations. */
export const getProductMarket = createServerFn({ method: "GET" })
  .inputValidator((input: { productId: string }) => ({
    productId: String(input.productId).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<VariantMarket[]> => {
    const client = publicServerClient();
    const { data: rows, error } = await client
      .from("variant_market_summary")
      .select(
        "variant_id, lowest_ask_cents, active_ask_count, highest_bid_cents, active_bid_count, authorized_bid_count",
      )
      .eq("product_id", data.productId);

    if (error) {
      console.error("getProductMarket failed", error.message);
      return [];
    }

    return (rows ?? []).map((r) => ({
      variantId: r.variant_id as string,
      lowestAskCents: r.lowest_ask_cents as number | null,
      activeAskCount: Number(r.active_ask_count ?? 0),
      highestBidCents: r.highest_bid_cents as number | null,
      activeBidCount: Number(r.active_bid_count ?? 0),
      authorizedBidCount: Number(r.authorized_bid_count ?? 0),
    }));
  });

/** Server-side quote preview, computed from the database fee schedule. */
export const quoteTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { merchandiseCents: number }) => {
    const cents = Math.round(Number(input.merchandiseCents));
    if (!Number.isFinite(cents) || cents < 100 || cents > 5_000_000) {
      throw new Error("Amount out of range.");
    }
    return { merchandiseCents: cents };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: totals, error } = await supabaseAdmin.rpc("compute_order_totals", {
      _merchandise_cents: data.merchandiseCents,
      _currency: "USD",
    });
    if (error) throw new Error(error.message);
    return totals as Record<string, number | string | boolean>;
  });

export const placeAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      variantId: string;
      priceCents: number;
      itemCondition: string;
      evidencePaths: string[];
      publicMediaPaths: string[];
      acquiredLocationId?: string | null;
      sellerNote?: string | null;
      parcelLengthIn?: number | null;
      parcelWidthIn?: number | null;
      parcelHeightIn?: number | null;
      parcelWeightLb?: number | null;
    }) => {
      const priceCents = Math.round(Number(input.priceCents));
      if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 5_000_000) {
        throw new Error("Enter a listing price between $1.00 and $50,000.");
      }
      if (!(ITEM_CONDITIONS as readonly string[]).includes(input.itemCondition)) {
        throw new Error("Choose the item condition.");
      }
      const evidencePaths = (input.evidencePaths ?? []).filter(
        (p) => typeof p === "string" && p.length > 0,
      );
      if (evidencePaths.length === 0) {
        throw new Error("At least one photo of the item in your hands is required.");
      }
      const publicMediaPaths = (input.publicMediaPaths ?? []).filter(
        (p) => typeof p === "string" && p.length > 0,
      );
      if (publicMediaPaths.length === 0) {
        throw new Error("At least one buyer-visible listing photo is required.");
      }
      const note = (input.sellerNote ?? "").trim();
      if (note.length > 500) throw new Error("Seller note is too long.");
      const validated: {
        variantId: string;
        priceCents: number;
        itemCondition: string;
        evidencePaths: string[];
        publicMediaPaths: string[];
        acquiredLocationId: string | null;
        sellerNote: string | null;
        parcelLengthIn: number | null;
        parcelWidthIn: number | null;
        parcelHeightIn: number | null;
        parcelWeightLb: number | null;
      } = {
        variantId: String(input.variantId),
        priceCents,
        itemCondition: input.itemCondition,
        evidencePaths: evidencePaths.slice(0, 8),
        publicMediaPaths: publicMediaPaths.slice(0, 8),
        acquiredLocationId: input.acquiredLocationId || null,
        sellerNote: note || null,
        parcelLengthIn: input.parcelLengthIn ?? null,
        parcelWidthIn: input.parcelWidthIn ?? null,
        parcelHeightIn: input.parcelHeightIn ?? null,
        parcelWeightLb: input.parcelWeightLb ?? null,
      };
      return validated;
    },
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: askId, error } = await client.rpc("place_ask_v2", {
      _variant_id: data.variantId,
      _price_cents: data.priceCents,
      _item_condition: data.itemCondition as ItemCondition,
      _evidence_paths: data.evidencePaths,
      _public_media_paths: data.publicMediaPaths,
      _seller_note: data.sellerNote,
      _parcel_length_in: data.parcelLengthIn,
      _parcel_width_in: data.parcelWidthIn,
      _parcel_height_in: data.parcelHeightIn,
      _parcel_weight_lb: data.parcelWeightLb,
    });
    if (error) throw new Error(error.message);
    return { askId: askId as string };
  });

export const placeBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string; priceCents: number }) => {
    const priceCents = Math.round(Number(input.priceCents));
    if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 5_000_000) {
      throw new Error("Enter an offer between $1.00 and $50,000.");
    }
    return { variantId: String(input.variantId), priceCents };
  })
  .handler(async ({ data, context }) => {
    const { data: bidId, error } = await context.supabase.rpc("place_bid", {
      _variant_id: data.variantId,
      _price_cents: data.priceCents,
    });
    if (error) throw new Error(error.message);
    return { bidId: bidId as string };
  });

export const cancelListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "ask" | "bid"; id: string }) => {
    if (input.kind !== "ask" && input.kind !== "bid") throw new Error("Unknown listing type.");
    return { kind: input.kind, id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      data.kind === "ask" ? "cancel_ask" : "cancel_bid",
      {
        [data.kind === "ask" ? "_ask_id" : "_bid_id"]: data.id,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Releases reservations that expired so listings never stay locked. */
async function releaseExpired() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("release_expired_reservations");
  } catch (error) {
    console.warn("reservation release skipped", error);
  }
}

export const buyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId) }))
  .handler(async ({ data, context }) => {
    await releaseExpired();
    const { data: orderId, error } = await context.supabase.rpc("buy_now", {
      _variant_id: data.variantId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });

/** Requests the exact seller item the buyer opened, never a different lowest Ask. */
export const requestExactListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string }) => ({ askId: String(input.askId) }))
  .handler(async ({ data, context }) => {
    await releaseExpired();
    const client = context.supabase as any;
    const { data: orderId, error } = await client.rpc("request_exact_ask", {
      _ask_id: data.askId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });

export const makeListingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { askId: string; amountCents: number }) => {
    const amountCents = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 5_000_000) {
      throw new Error("Enter an offer between $1 and $50,000.");
    }
    return { askId: String(input.askId), amountCents };
  })
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: offerId, error } = await client.rpc("make_listing_offer", {
      _ask_id: data.askId,
      _amount_cents: data.amountCents,
    });
    if (error) throw new Error(error.message);
    const { emailOfferReceived } = await import("./email-notifications.server");
    await emailOfferReceived(offerId as string);
    return { offerId: offerId as string };
  });

export const respondToListingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      offerId: string;
      action: "accept" | "accept_counter" | "counter" | "decline" | "withdraw";
      counterCents?: number | null;
    }) => {
      const actions = ["accept", "accept_counter", "counter", "decline", "withdraw"] as const;
      if (!actions.includes(input.action)) throw new Error("Choose a valid offer action.");
      const counterCents =
        input.counterCents == null ? null : Math.round(Number(input.counterCents));
      if (
        input.action === "counter" &&
        (counterCents == null || !Number.isFinite(counterCents) || counterCents < 100)
      ) {
        throw new Error("Enter a valid counteroffer.");
      }
      return { offerId: String(input.offerId), action: input.action, counterCents };
    },
  )
  .handler(async ({ data, context }) => {
    if (data.action === "accept" || data.action === "accept_counter") {
      throw new Error("Use ParkVault Checkout to complete this offer.");
    }
    const client = context.supabase as any;
    const { applyOfferResponse } = await import("./offer-response.server");
    const result = await applyOfferResponse({
      respond: async () => {
        const { data: orderId, error } = await client.rpc("respond_to_listing_offer", {
          _offer_id: data.offerId,
          _action: data.action,
          ...(data.counterCents != null ? { _counter_cents: data.counterCents } : {}),
        });
        if (error) throw new Error(error.message);
        return (orderId as string | null) ?? null;
      },
      releaseHold: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { releasePendingOfferAuthorization } = await import("./offer-response.server");
        await releasePendingOfferAuthorization(supabaseAdmin as any, data.offerId);
      },
    });
    if (data.action === "counter" || data.action === "decline") {
      const { emailOfferOutcome } = await import("./email-notifications.server");
      await emailOfferOutcome(
        data.offerId,
        data.action === "counter" ? "countered" : "declined",
        data.counterCents,
      );
    }
    return result;
  });

export const retryListingOfferAuthorizationRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { offerId: string }) => ({ offerId: String(input.offerId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: offer, error } = await admin
      .from("listing_offers")
      .select("id,buyer_id,seller_id,stripe_payment_status")
      .eq("id", data.offerId)
      .maybeSingle();
    if (
      error ||
      !offer ||
      (offer.buyer_id !== context.userId && offer.seller_id !== context.userId)
    ) {
      throw new Error("That offer is unavailable.");
    }
    const { releasePendingOfferAuthorization } = await import("./offer-response.server");
    return releasePendingOfferAuthorization(admin, offer.id);
  });

export const getMyListingOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role: "buyer" | "seller" }) => ({
    role: input.role === "seller" ? ("seller" as const) : ("buyer" as const),
  }))
  .handler(async ({ data, context }): Promise<ListingOffer[]> => {
    // Buyers can read their offer but cannot always read the protected Ask
    // after it is reserved or matched. Resolve that relationship on the
    // server while keeping the query scoped to the authenticated participant.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as any;
    const participantColumn = data.role === "seller" ? "seller_id" : "buyer_id";
    // A transient Stripe error must not leave a card hold stuck indefinitely.
    // Re-open of either participant's offer page retries every pending release;
    // the UI also exposes an explicit retry action below.
    const { data: pendingReleases } = await client
      .from("listing_offers")
      .select("id")
      .eq(participantColumn, context.userId)
      .eq("stripe_payment_status", "cancel_pending")
      .limit(20);
    if (pendingReleases?.length) {
      const { releasePendingOfferAuthorization } = await import("./offer-response.server");
      await Promise.allSettled(
        pendingReleases.map((offer: { id: string }) =>
          releasePendingOfferAuthorization(client, offer.id),
        ),
      );
    }
    const { data: rows, error } = await client
      .from("listing_offers")
      .select(
        "id,ask_id,amount_cents,seller_counter_cents,currency,status,expires_at,created_at,buyer_fee_cents,seller_fee_cents,shipping_cents,tax_cents,buyer_total_cents,seller_payout_cents,payment_authorized,authorization_expires_at,stripe_payment_status,asks(price_cents,products(slug,name),product_variants(size,color,edition))",
      )
      .eq(participantColumn, context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const visibleRows = (rows ?? []).filter(
      (row: any) => data.role !== "seller" || row.status !== "pending" || row.payment_authorized,
    );
    return visibleRows.map((row: any) => ({
      id: row.id,
      askId: row.ask_id,
      productSlug: row.asks?.products?.slug ?? "",
      productName: row.asks?.products?.name ?? "Unknown product",
      variantLabel: label(row.asks?.product_variants ?? null),
      listingPriceCents: Number(row.asks?.price_cents ?? 0),
      amountCents: Number(row.amount_cents),
      sellerCounterCents:
        row.seller_counter_cents == null ? null : Number(row.seller_counter_cents),
      currency: row.currency,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      buyerFeeCents: Number(row.buyer_fee_cents ?? 0),
      sellerFeeCents: Number(row.seller_fee_cents ?? 0),
      shippingCents: Number(row.shipping_cents ?? 0),
      taxCents: Number(row.tax_cents ?? 0),
      buyerTotalCents: Number(row.buyer_total_cents ?? 0),
      sellerPayoutCents: Number(row.seller_payout_cents ?? 0),
      paymentAuthorized: Boolean(row.payment_authorized),
      authorizationExpiresAt: row.authorization_expires_at ?? null,
      paymentStatus: row.stripe_payment_status ?? null,
    }));
  });

export const sellNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { variantId: string }) => ({ variantId: String(input.variantId) }))
  .handler(async ({ data, context }) => {
    await releaseExpired();
    const { data: orderId, error } = await context.supabase.rpc("sell_now", {
      _variant_id: data.variantId,
    });
    if (error) throw new Error(error.message);
    return { orderId: orderId as string };
  });

export const getMyListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ asks: MyListing[]; bids: MyListing[] }> => {
    await releaseExpired();
    const { supabase, userId } = context;
    const client = supabase as any;

    const [{ data: asks, error: askError }, { data: bids, error: bidError }] = await Promise.all([
      client
        .from("asks")
        .select(
          "id, variant_id, price_cents, currency, status, approved_at, expires_at, created_at, evidence_count, public_media_count, matched_order_id, products(slug, name), product_variants(size, color, edition), listing_media(storage_path, position)",
        )
        .eq("seller_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("bids")
        .select(
          "id, variant_id, price_cents, currency, status, expires_at, created_at, payment_authorized, matched_order_id, products(slug, name), product_variants(size, color, edition)",
        )
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (askError) throw new Error(askError.message);
    if (bidError) throw new Error(bidError.message);

    const variantIds = [...new Set((asks ?? []).map((row: any) => row.variant_id as string))];
    const { data: summaries } =
      variantIds.length > 0
        ? await client
            .from("variant_market_summary")
            .select("variant_id,highest_bid_cents,active_bid_count,authorized_bid_count")
            .in("variant_id", variantIds)
        : { data: [] };
    const summaryByVariant = new Map((summaries ?? []).map((row: any) => [row.variant_id, row]));

    // Signed thumbnail (first photo) per listing so sellers can recognise each item.
    const firstPathByAsk = new Map<string, string>();
    for (const row of (asks ?? []) as any[]) {
      const media = [...(row.listing_media ?? [])].sort(
        (a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0),
      );
      const path = media[0]?.storage_path as string | undefined;
      if (path) firstPathByAsk.set(row.id as string, path);
    }
    const thumbnailByAsk = new Map<string, string>();
    if (firstPathByAsk.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const paths = [...firstPathByAsk.values()];
      const { data: signed } = await supabaseAdmin.storage
        .from("listing-media")
        .createSignedUrls(paths, 60 * 60);
      const urlByPath = new Map(
        (signed ?? []).map((item: any) => [item.path as string, item.signedUrl as string]),
      );
      for (const [askId, path] of firstPathByAsk) {
        const url = urlByPath.get(path);
        if (url) thumbnailByAsk.set(askId, url);
      }
    }

    const shape = (row: Record<string, unknown>): MyListing => {
      const product = row["products"] as { slug: string; name: string } | null;
      const summary = summaryByVariant.get(row["variant_id"] as string) as any;
      return {
        id: row["id"] as string,
        variantId: row["variant_id"] as string,
        productSlug: product?.slug ?? "",
        productName: product?.name ?? "Unknown product",
        variantLabel: label(
          row["product_variants"] as {
            size: string | null;
            color: string | null;
            edition: string | null;
          } | null,
        ),
        priceCents: row["price_cents"] as number,
        currency: row["currency"] as string,
        status: row["status"] as string,
        approvedAt: (row["approved_at"] as string | null) ?? null,
        expiresAt: row["expires_at"] as string,
        createdAt: row["created_at"] as string,
        matchedOrderId: (row["matched_order_id"] as string | null) ?? null,
        ...(thumbnailByAsk.has(row["id"] as string)
          ? { thumbnailUrl: thumbnailByAsk.get(row["id"] as string)! }
          : {}),
        ...(summary
          ? {
              highestBidCents:
                summary.highest_bid_cents == null ? null : Number(summary.highest_bid_cents),
              activeBidCount: Number(summary.active_bid_count ?? 0),
              authorizedBidCount: Number(summary.authorized_bid_count ?? 0),
            }
          : {}),
        ...(row["evidence_count"] != null
          ? { evidenceCount: row["evidence_count"] as number }
          : {}),
        ...(row["public_media_count"] != null
          ? { publicMediaCount: row["public_media_count"] as number }
          : {}),
        ...(row["payment_authorized"] != null
          ? { paymentAuthorized: row["payment_authorized"] as boolean }
          : {}),
      };
    };

    return {
      asks: (asks ?? []).map((r: unknown) => shape(r as Record<string, unknown>)),
      bids: (bids ?? []).map((r: unknown) => shape(r as Record<string, unknown>)),
    };
  });

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOrder[]> => {
    await releaseExpired();
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, buyer_id, seller_id, origin, status, currency, merchandise_cents, buyer_fee_cents, seller_fee_cents, shipping_cents, tax_cents, total_cents, payout_cents, reservation_expires_at, payment_authorized, stripe_payment_status, created_at, products(slug, name), product_variants(size, color, edition)",
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const product = row.products as { slug: string; name: string } | null;
      return {
        id: row.id,
        orderNumber: row.order_number,
        role: row.buyer_id === userId ? ("buyer" as const) : ("seller" as const),
        productSlug: product?.slug ?? "",
        productName: product?.name ?? "Unknown product",
        variantLabel: label(
          row.product_variants as {
            size: string | null;
            color: string | null;
            edition: string | null;
          } | null,
        ),
        origin: row.origin,
        status: row.status,
        currency: row.currency,
        merchandiseCents: row.merchandise_cents,
        buyerFeeCents: row.buyer_fee_cents,
        sellerFeeCents: row.seller_fee_cents,
        shippingCents: row.shipping_cents,
        taxCents: row.tax_cents,
        totalCents: row.total_cents,
        payoutCents: row.payout_cents,
        reservationExpiresAt: row.reservation_expires_at,
        paymentAuthorized: row.payment_authorized,
        paymentStatus: row.stripe_payment_status,
        createdAt: row.created_at,
      };
    });
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<OrderDetail | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, buyer_id, seller_id, origin, status, currency, merchandise_cents, buyer_fee_cents, seller_fee_cents, shipping_cents, tax_cents, total_cents, payout_cents, reservation_expires_at, payment_authorized, stripe_payment_status, fee_snapshot, created_at, products(id, slug, name), product_variants(size, color, edition)",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const { data: events, error: eventError } = await supabase
      .from("order_events")
      .select("id, from_status, to_status, note, created_at")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: true });
    if (eventError) throw new Error(eventError.message);

    const product = row.products as { id: string; slug: string; name: string } | null;

    const { data: imageRows } = product
      ? await supabase
          .from("product_images")
          .select("storage_path, alt, view_role, position")
          .eq("product_id", product.id)
          .eq("view_role", "gallery")
          .order("position", { ascending: true })
          .limit(1)
      : { data: null };
    const image = (imageRows ?? [])[0] ?? null;

    return {
      id: row.id,
      orderNumber: row.order_number,
      imageSrc: image?.storage_path ?? null,
      imageAlt: image?.alt?.trim() || (product?.name ?? "Purchased item"),
      role: row.buyer_id === userId ? "buyer" : "seller",
      productSlug: product?.slug ?? "",
      productName: product?.name ?? "Unknown product",
      variantLabel: label(
        row.product_variants as {
          size: string | null;
          color: string | null;
          edition: string | null;
        } | null,
      ),
      origin: row.origin,
      status: row.status,
      currency: row.currency,
      merchandiseCents: row.merchandise_cents,
      buyerFeeCents: row.buyer_fee_cents,
      sellerFeeCents: row.seller_fee_cents,
      shippingCents: row.shipping_cents,
      taxCents: row.tax_cents,
      totalCents: row.total_cents,
      payoutCents: row.payout_cents,
      reservationExpiresAt: row.reservation_expires_at,
      paymentAuthorized: row.payment_authorized,
      paymentStatus: row.stripe_payment_status,
      createdAt: row.created_at,
      feeSnapshot: (row.fee_snapshot ?? {}) as Record<string, string | number | boolean | null>,
      events: (events ?? []).map((e) => ({
        id: e.id,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        note: e.note,
        createdAt: e.created_at,
      })),
    };
  });

/**
 * Anonymous market depth for the market-data drawer.
 *
 * Reads three identity-free views. Rows carry price, variation, condition and
 * quantity only — never a member id, note, evidence reference or timestamp that
 * could single out one person's listing. Demonstration rows are excluded by the
 * views themselves.
 */
export type DepthRow = {
  priceCents: number;
  currency: string;
  quantity: number;
  condition: string | null;
};

export type SaleRow = { priceCents: number; currency: string; origin: string; soldAt: string };

export type MarketDepth = { asks: DepthRow[]; bids: DepthRow[]; sales: SaleRow[] };

export const getVariantDepth = createServerFn({ method: "GET" })
  .inputValidator((input: { variantId: string }) => ({
    variantId: String(input.variantId).slice(0, 40),
  }))
  .handler(async ({ data }): Promise<MarketDepth> => {
    const client = publicServerClient();
    const [{ data: askRows }, { data: bidRows }, { data: saleRows }] = await Promise.all([
      client
        .from("variant_ask_depth_public")
        .select("price_cents, currency, item_condition, quantity")
        .eq("variant_id", data.variantId)
        .order("price_cents", { ascending: true }),
      client
        .from("variant_bid_depth_public")
        .select("price_cents, currency, quantity")
        .eq("variant_id", data.variantId)
        .order("price_cents", { ascending: false }),
      client
        .from("variant_verified_sales_public")
        .select("price_cents, currency, origin, sold_at")
        .eq("variant_id", data.variantId)
        .order("sold_at", { ascending: false })
        .limit(25),
    ]);

    return {
      asks: (askRows ?? []).map((r) => ({
        priceCents: Number(r.price_cents),
        currency: String(r.currency),
        quantity: Number(r.quantity ?? 0),
        condition: (r.item_condition as string | null) ?? null,
      })),
      bids: (bidRows ?? []).map((r) => ({
        priceCents: Number(r.price_cents),
        currency: String(r.currency),
        quantity: Number(r.quantity ?? 0),
        condition: null,
      })),
      sales: (saleRows ?? []).map((r) => ({
        priceCents: Number(r.price_cents),
        currency: String(r.currency),
        origin: String(r.origin),
        soldAt: String(r.sold_at),
      })),
    };
  });
