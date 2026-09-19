/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase client types lag the applied seller migration until the next linked type generation */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeAccountMatchesCurrentMode } from "./stripe-connect.server";
import { getStripe } from "./stripe-marketplace.server";
import { sendOrderTransfer } from "./stripe-payout.server";
import {
  shapeAddress,
  shapeAssignment,
  shapeEvidence,
  shapePayment,
  shapePayout,
  shapePerformance,
  shapeShipment,
  type MemberPerformance,
  type OrderOperations,
} from "./pilot.server";

/**
 * Phase 7 — manual pilot & trust operations service boundary.
 *
 * Live checkout is still disabled. ParkVault never authorizes, captures or
 * holds funds: an administrator records evidence FROM an external payment
 * provider, and every state change runs through a database function that
 * derives the actor from `auth.uid()` and writes append-only history plus an
 * administrative audit entry. Payouts are delayed and settled outside the
 * product — never called escrow.
 */

export type {
  MemberPerformance,
  OrderOperations,
  PaymentRecord,
  PayoutRecord,
  ShipmentRecord,
  EvidenceRecord,
  DisputeRecord,
  AddressSnapshot,
  AssignmentSummary,
} from "./pilot.server";

export type PilotOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  origin: string;
  currency: string;
  totalCents: number;
  payoutCents: number;
  createdAt: string;
  isDemo: boolean;
};

export type AdminQueues = {
  isAdmin: boolean;
  isModerator: boolean;
  orders: PilotOrderRow[];
  evidenceToReview: {
    id: string;
    orderId: string;
    kind: string;
    receiptAmountCents: number | null;
    createdAt: string;
  }[];
  disputes: { id: string; orderId: string; status: string; reason: string; createdAt: string }[];
  suggestions: { id: string; status: string; proposedName: string; createdAt: string }[];
  flaggedSightings: { id: string; flagCount: number; confirmationCount: number; seenAt: string }[];
  shopperApplications: {
    id: string;
    status: string;
    parkFrequency: string;
    applicantNote: string | null;
    createdAt: string;
  }[];
};

/** Everything the pilot console and the member order page need for one order. */
export const getOrderOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<OrderOperations | null> => {
    const { supabase, userId } = context;
    const { orderId } = data;

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, status, origin, buyer_id, seller_id, is_demo")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return null;

    const [{ data: staff }, { data: funded }, { data: captured }] = await Promise.all([
      supabase.rpc("is_staff", { _user_id: userId }),
      supabase.rpc("order_funding_committed", { _order_id: orderId }),
      supabase.rpc("order_payment_captured", { _order_id: orderId }),
    ]);

    const isStaff = staff === true;
    const isBuyer = order.buyer_id === userId;
    const isSeller = order.seller_id === userId;
    if (!isBuyer && !isSeller && !isStaff) return null;

    const [payments, payout, shipment, evidence, dispute, sale, address, assignment] =
      await Promise.all([
        supabase
          .from("order_payments")
          .select(
            "id, kind, provider, external_reference, amount_cents, currency, provider_status, occurred_at",
          )
          .eq("order_id", orderId)
          .order("occurred_at", { ascending: true }),
        supabase
          .from("order_payouts")
          .select("provider, external_reference, amount_cents, currency, status, occurred_at")
          .eq("order_id", orderId)
          .maybeSingle(),
        (supabase as any)
          .from("order_shipments")
          .select(
            "carrier, tracking_number, status, shipped_at, delivered_at, label_url, tracking_url, service_level, rate_cents, ship_by",
          )
          .eq("order_id", orderId)
          .maybeSingle(),
        supabase
          .from("order_evidence")
          .select("id, kind, receipt_amount_cents, confirmed_at, created_at, uploaded_by")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_disputes")
          .select("id, status, reason, resolution_note, created_at, opened_by")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("verified_sales")
          .select("price_cents, sold_at, is_live")
          .eq("order_id", orderId)
          .maybeSingle(),
        supabase
          .from("order_addresses")
          .select("recipient_name, line1, line2, city, region, postal_code, country")
          .eq("order_id", orderId)
          .maybeSingle(),
        supabase
          .from("sourcing_assignments")
          .select(
            "status, shopper_fee_cents, reference_price_cents, buyer_max_purchase_cents, coverage_label, purchase_deadline, currency",
          )
          .eq("order_id", orderId)
          .maybeSingle(),
      ]);

    // Buyers deliberately cannot read receipt rows. They still deserve the
    // verified purchase amount and confirmation that the item was photographed,
    // so those two facts are derived here with privileged access and nothing
    // else about the receipt is returned.
    let verifiedPurchaseCents: number | null = null;
    let itemPhotoOnFile = false;
    const evidenceRows = evidence.data ?? [];
    if (evidenceRows.length > 0) {
      const receipt = evidenceRows.find((e) => e.kind === "purchase_receipt");
      verifiedPurchaseCents = receipt?.receipt_amount_cents ?? null;
      itemPhotoOnFile = evidenceRows.some((e) => e.kind === "item_photo");
    } else if (isBuyer) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("order_evidence")
        .select("kind, receipt_amount_cents, confirmed_at")
        .eq("order_id", orderId);
      for (const row of rows ?? []) {
        if (row.kind === "purchase_receipt" && row.confirmed_at) {
          verifiedPurchaseCents = row.receipt_amount_cents ?? null;
        }
        if (row.kind === "item_photo") itemPhotoOnFile = true;
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      origin: order.origin,
      role: isBuyer ? "buyer" : isSeller ? "seller" : "staff",
      isStaff,
      fundingCommitted: funded === true,
      paymentCaptured: captured === true,
      payments: (payments.data ?? []).map((r) => shapePayment(r as Record<string, unknown>)),
      payout: shapePayout((payout.data ?? null) as Record<string, unknown> | null),
      shipment: shapeShipment((shipment.data ?? null) as Record<string, unknown> | null),
      evidence: evidenceRows.map((r) =>
        shapeEvidence(r as unknown as Record<string, unknown>, r.uploaded_by === userId || isStaff),
      ),
      verifiedPurchaseCents,
      itemPhotoOnFile,
      dispute: dispute.data
        ? {
            id: dispute.data.id,
            status: dispute.data.status,
            reason: dispute.data.reason,
            resolutionNote: dispute.data.resolution_note,
            createdAt: dispute.data.created_at,
            openedByMe: dispute.data.opened_by === userId,
          }
        : null,
      verifiedSale: sale.data
        ? {
            priceCents: sale.data.price_cents,
            soldAt: sale.data.sold_at,
            isLive: sale.data.is_live === true,
          }
        : null,
      address: shapeAddress((address.data ?? null) as Record<string, unknown> | null),
      assignment: shapeAssignment((assignment.data ?? null) as Record<string, unknown> | null),
    };
  });

/** Short-lived signed URL for one private evidence file. Access is logged. */
export const getEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { evidenceId: string }) => ({ evidenceId: String(input.evidenceId) }))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: path, error } = await context.supabase.rpc("order_evidence_file", {
      _evidence_id: data.evidenceId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("order-evidence")
      .createSignedUrl(path as string, 120);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Could not open this file.");
    return { url: signed.data.signedUrl };
  });

export const recordPurchaseEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      receiptPath: string;
      itemPhotoPath: string;
      receiptAmountCents: number;
    }) => {
      const cents = Math.round(Number(input.receiptAmountCents));
      if (!Number.isFinite(cents) || cents <= 0 || cents > 5_000_000) {
        throw new Error("Enter the actual amount printed on the receipt.");
      }
      if (!input.receiptPath || !input.itemPhotoPath) {
        throw new Error("Attach both the receipt and a photograph of the item.");
      }
      return {
        orderId: String(input.orderId),
        receiptPath: String(input.receiptPath),
        itemPhotoPath: String(input.itemPhotoPath),
        receiptAmountCents: cents,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_purchase_evidence", {
      _order_id: data.orderId,
      _receipt_path: data.receiptPath,
      _item_photo_path: data.itemPhotoPath,
      _receipt_amount_cents: data.receiptAmountCents,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const approveRevisedMax = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; newMaxCents: number }) => {
    const cents = Math.round(Number(input.newMaxCents));
    if (!Number.isFinite(cents) || cents < 100 || cents > 5_000_000) {
      throw new Error("Enter a revised maximum between $1.00 and $50,000.");
    }
    return { orderId: String(input.orderId), newMaxCents: cents };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_revised_max", {
      _order_id: data.orderId,
      _new_max_cents: data.newMaxCents,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setOrderAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      recipientName: string;
      line1: string;
      line2?: string | null;
      city: string;
      region: string;
      postalCode: string;
      country?: string;
    }) => {
      const recipientName = String(input.recipientName ?? "").trim();
      const line1 = String(input.line1 ?? "").trim();
      const city = String(input.city ?? "").trim();
      const region = String(input.region ?? "").trim();
      const postalCode = String(input.postalCode ?? "").trim();
      if (!recipientName || !line1 || !city || !region || !postalCode) {
        throw new Error(
          "Enter a recipient name, address line 1, city, state/region and postal code.",
        );
      }
      return {
        orderId: String(input.orderId),
        recipientName,
        line1,
        line2: input.line2 ? String(input.line2).trim() : null,
        city,
        region,
        postalCode,
        country: (input.country ? String(input.country).trim() : "US").slice(0, 2).toUpperCase(),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("set_order_address", {
      _order_id: data.orderId,
      _recipient_name: data.recipientName,
      _line1: data.line1,
      _line2: data.line2,
      _city: data.city,
      _region: data.region,
      _postal_code: data.postalCode,
      _country: data.country,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const recordShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; carrier: string; trackingNumber: string }) => {
    const carrier = String(input.carrier ?? "").trim();
    const trackingNumber = String(input.trackingNumber ?? "").trim();
    if (carrier.length < 2 || carrier.length > 60) throw new Error("Enter the carrier.");
    if (trackingNumber.length < 4 || trackingNumber.length > 60) {
      throw new Error("Enter the tracking number.");
    }
    return { orderId: String(input.orderId), carrier, trackingNumber };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_shipment", {
      _order_id: data.orderId,
      _carrier: data.carrier,
      _tracking_number: data.trackingNumber,
    });
    if (error) throw new Error(error.message);
    const { emailOrderShipped } = await import("./email-notifications.server");
    await emailOrderShipped(data.orderId, data.carrier, data.trackingNumber);
    return { ok: true as const };
  });

export const confirmDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; proofPath?: string | null }) => ({
    orderId: String(input.orderId),
    proofPath: input.proofPath ? String(input.proofPath) : null,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("confirm_delivery", {
      _order_id: data.orderId,
      ...(data.proofPath ? { _proof_path: data.proofPath } : {}),
    });
    if (error) throw new Error(error.message);
    const { emailDeliveryConfirmed } = await import("./email-notifications.server");
    await emailDeliveryConfirmed(data.orderId);
    return { ok: true as const };
  });

export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; reason: string }) => {
    const reason = String(input.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 2000) {
      throw new Error("Describe the problem in at least 10 characters.");
    }
    return { orderId: String(input.orderId), reason };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("open_dispute", {
      _order_id: data.orderId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const { emailDisputeUpdate } = await import("./email-notifications.server");
    await emailDisputeUpdate(data.orderId, "opened");
    return { ok: true as const };
  });

/** Computed from eligible real orders only — never hand entered. */
export const getMemberPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId?: string }) => ({
    userId: input.userId ? String(input.userId) : null,
  }))
  .handler(async ({ data, context }): Promise<MemberPerformance> => {
    const { data: raw, error } = await context.supabase.rpc("member_performance", {
      _user_id: data.userId ?? context.userId,
    });
    if (error) throw new Error(error.message);
    return shapePerformance(raw);
  });

// ---------------------------------------------------------------------------
// Operator tooling. Every function below is additionally gated in SQL: the
// database refuses the write unless the caller holds the required role.
// ---------------------------------------------------------------------------

export const getAdminQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminQueues> => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isModerator }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
    ]);

    const empty: AdminQueues = {
      isAdmin: isAdmin === true,
      isModerator: isModerator === true,
      orders: [],
      evidenceToReview: [],
      disputes: [],
      suggestions: [],
      flaggedSightings: [],
      shopperApplications: [],
    };
    if (!empty.isAdmin && !empty.isModerator) return empty;

    const [orders, evidence, disputes, suggestions, sightings, applications] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, status, origin, currency, total_cents, payout_cents, created_at, is_demo",
        )
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("order_evidence")
        .select("id, order_id, kind, receipt_amount_cents, created_at")
        .is("confirmed_at", null)
        .order("created_at", { ascending: true })
        .limit(40),
      supabase
        .from("order_disputes")
        .select("id, order_id, status, reason, created_at")
        .in("status", ["open", "under_review"])
        .order("created_at", { ascending: true })
        .limit(40),
      supabase
        .from("product_suggestions")
        .select("id, status, name, created_at")
        .in("status", ["submitted", "in_review"])
        .order("created_at", { ascending: true })
        .limit(40),
      supabase
        .from("sightings")
        .select("id, flag_count, confirmation_count, seen_at")
        .gt("flag_count", 0)
        .order("flag_count", { ascending: false })
        .limit(40),
      supabase
        .from("shopper_applications")
        .select("id, status, park_frequency, applicant_note, created_at")
        .in("status", ["submitted", "in_review"])
        .order("created_at", { ascending: true })
        .limit(40),
    ]);

    return {
      ...empty,
      orders: (orders.data ?? []).map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        origin: o.origin,
        currency: o.currency,
        totalCents: o.total_cents,
        payoutCents: o.payout_cents,
        createdAt: o.created_at,
        isDemo: o.is_demo,
      })),
      evidenceToReview: (evidence.data ?? []).map((e) => ({
        id: e.id,
        orderId: e.order_id,
        kind: e.kind,
        receiptAmountCents: e.receipt_amount_cents,
        createdAt: e.created_at,
      })),
      disputes: (disputes.data ?? []).map((d) => ({
        id: d.id,
        orderId: d.order_id,
        status: d.status,
        reason: d.reason,
        createdAt: d.created_at,
      })),
      suggestions: (suggestions.data ?? []).map((s) => ({
        id: s.id,
        status: s.status,
        proposedName: s.name,
        createdAt: s.created_at,
      })),
      flaggedSightings: (sightings.data ?? []).map((s) => ({
        id: s.id,
        flagCount: s.flag_count,
        confirmationCount: s.confirmation_count,
        seenAt: s.seen_at,
      })),
      shopperApplications: (applications.data ?? []).map((a) => ({
        id: a.id,
        status: a.status,
        parkFrequency: a.park_frequency,
        applicantNote: a.applicant_note,
        createdAt: a.created_at,
      })),
    };
  });

export const adminRecordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      kind: string;
      provider: string;
      externalReference: string;
      amountCents: number;
      currency: string;
      providerStatus: string;
      note?: string | null;
    }) => {
      const kinds = ["authorization", "capture", "payment", "refund"];
      const statuses = ["succeeded", "pending", "failed", "voided"];
      if (!kinds.includes(input.kind)) throw new Error("Choose the kind of payment record.");
      if (!statuses.includes(input.providerStatus)) throw new Error("Choose the provider status.");
      const provider = String(input.provider ?? "").trim();
      const externalReference = String(input.externalReference ?? "").trim();
      if (provider.length < 2) throw new Error("Name the external payment provider.");
      if (externalReference.length < 4) throw new Error("Record the provider's reference.");
      if (/\d{12,}/.test(externalReference)) {
        throw new Error(
          "That looks like a payment instrument number. Record the provider reference only.",
        );
      }
      const cents = Math.round(Number(input.amountCents));
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter the amount.");
      const currency = String(input.currency ?? "USD")
        .toUpperCase()
        .slice(0, 3);
      const note = String(input.note ?? "").trim();
      return {
        orderId: String(input.orderId),
        kind: input.kind,
        provider,
        externalReference,
        amountCents: cents,
        currency,
        providerStatus: input.providerStatus,
        note: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_record_order_payment", {
      _order_id: data.orderId,
      _kind: data.kind as "authorization" | "capture" | "payment" | "refund",
      _provider: data.provider,
      _external_reference: data.externalReference,
      _amount_cents: data.amountCents,
      _currency: data.currency,
      _provider_status: data.providerStatus as "succeeded" | "pending" | "failed" | "voided",
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminAdvanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; toStatus: string; note?: string | null }) => {
    const note = String(input.note ?? "").trim();
    return { orderId: String(input.orderId), toStatus: String(input.toStatus), note: note || null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_advance_order", {
      _order_id: data.orderId,
      _to: data.toStatus as never,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminConfirmEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { evidenceId: string; note?: string | null }) => ({
    evidenceId: String(input.evidenceId),
    note: String(input.note ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_confirm_evidence", {
      _evidence_id: data.evidenceId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getVerifiedSaleEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }): Promise<{ eligible: boolean; reasons: string[] }> => {
    const { data: raw, error } = await context.supabase.rpc("verified_sale_eligibility", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    const value = (raw ?? {}) as { eligible?: boolean; reasons?: string[] };
    return { eligible: value.eligible === true, reasons: value.reasons ?? [] };
  });

export const adminConfirmVerifiedSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; note?: string | null }) => ({
    orderId: String(input.orderId),
    note: String(input.note ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_confirm_verified_sale", {
      _order_id: data.orderId,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    try {
      const { processReviewEmails } = await import("./review-email-worker.server");
      await processReviewEmails(data.orderId);
    } catch {
      // The durable queue remains available for the scheduled retry worker.
      console.error("Review email queued for retry");
    }
    return { ok: true as const };
  });

export const adminRecordPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      provider: string;
      externalReference?: string | null;
      amountCents: number;
      currency: string;
      status: string;
      note?: string | null;
    }) => {
      const statuses = ["pending", "processing", "completed", "failed", "reversed"];
      if (!statuses.includes(input.status)) throw new Error("Choose the payout status.");
      const provider = String(input.provider ?? "").trim();
      if (provider.length < 2) throw new Error("Name the external payout provider.");
      const externalReference = String(input.externalReference ?? "").trim();
      if (/\d{12,}/.test(externalReference)) {
        throw new Error("That looks like an account number. Record the provider reference only.");
      }
      const cents = Math.round(Number(input.amountCents));
      if (!Number.isFinite(cents) || cents < 0) throw new Error("Enter the payout amount.");
      const note = String(input.note ?? "").trim();
      return {
        orderId: String(input.orderId),
        provider,
        externalReference: externalReference || null,
        amountCents: cents,
        currency: String(input.currency ?? "USD")
          .toUpperCase()
          .slice(0, 3),
        status: input.status,
        note: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_record_payout", {
      _order_id: data.orderId,
      _provider: data.provider,
      _external_reference: data.externalReference ?? "",
      _amount_cents: data.amountCents,
      _currency: data.currency,
      _status: data.status as "pending" | "processing" | "completed" | "failed" | "reversed",
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Sends an eligible completed-order payout to the seller's Stripe Connect account. */
export const adminSendStripePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: String(input.orderId) }))
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const { data: adminRole } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Administrator access required.");
    const { data: order, error: orderError } = await client
      .from("orders")
      .select(
        "id,order_number,seller_id,payout_cents,currency,status,origin,is_demo,stripe_charge_id,stripe_checkout_session_id,stripe_payment_intent_id",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderError || !order) throw new Error(orderError?.message ?? "Order not found.");
    if (order.is_demo || order.status !== "completed" || !order.seller_id) {
      throw new Error("Only a real completed order can be paid out.");
    }
    const { data: existing } = await client
      .from("order_payouts")
      .select("status,external_reference")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (existing?.status === "completed") throw new Error("This order is already marked paid out.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    // A sourcing order's orders.seller_id is the shopper who fulfilled it, not
    // a listing seller — its Connect account lives on shopper_service_profiles.
    const isSourcingOrder = ["sourcing_shopper", "sourcing_ask", "sourcing_quote"].includes(
      order.origin,
    );
    const { data: payoutAccount } = await admin
      .from(isSourcingOrder ? "shopper_service_profiles" : "seller_profiles")
      .select("stripe_account_id,stripe_account_mode,stripe_payouts_enabled")
      .eq(isSourcingOrder ? "shopper_id" : "user_id", order.seller_id)
      .maybeSingle();
    if (
      !payoutAccount?.stripe_account_id ||
      !payoutAccount.stripe_payouts_enabled ||
      !stripeAccountMatchesCurrentMode(payoutAccount.stripe_account_mode)
    ) {
      throw new Error(
        isSourcingOrder
          ? "The shopper's Stripe payout account is not ready."
          : "The seller's Stripe payout account is not ready.",
      );
    }
    const secret = process.env["STRIPE_SECRET_KEY"] ?? "";
    if (!secret) throw new Error("Stripe is not configured on this deployment yet.");
    const { data: fundingPayments, error: fundingError } = await admin
      .from("order_payments")
      .select("external_reference")
      .eq("order_id", order.id)
      .eq("provider", "stripe")
      .eq("provider_status", "succeeded")
      .in("kind", ["capture", "payment"]);
    if (fundingError) throw new Error("Could not verify the order's payment records.");
    const transfer = await sendOrderTransfer(getStripe(secret), {
      orderId: order.id,
      orderNumber: order.order_number,
      amountCents: order.payout_cents,
      currency: order.currency,
      destination: payoutAccount.stripe_account_id,
      // Shopper adjustments can span multiple charges.
      sourceCharge: order.origin !== "sourcing_shopper" ? order.stripe_charge_id : undefined,
      live: secret.startsWith("sk_live_") || secret.startsWith("rk_live_"),
      checkoutSessionId: order.stripe_checkout_session_id,
      primaryPaymentIntentId: order.stripe_payment_intent_id,
      paymentIntentIds: (fundingPayments ?? []).map(
        (payment: { external_reference: string }) => payment.external_reference,
      ),
    });
    const { error } = await client.rpc("admin_record_payout", {
      _order_id: data.orderId,
      _provider: "stripe_connect",
      _external_reference: transfer.id,
      _amount_cents: order.payout_cents,
      _currency: order.currency,
      _status: "completed",
      _note: "Transferred to the seller's connected Stripe account",
    });
    if (error)
      throw new Error(
        `Stripe transfer succeeded, but the payout record needs attention: ${error.message}`,
      );
    return { ok: true as const, transferId: transfer.id };
  });

export const adminResolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      disputeId: string;
      status: string;
      orderStatus?: string | null;
      note?: string | null;
    }) => {
      const statuses = ["under_review", "resolved_buyer", "resolved_seller", "withdrawn"];
      if (!statuses.includes(input.status)) throw new Error("Choose the dispute outcome.");
      const orderStatus = String(input.orderStatus ?? "").trim();
      if (orderStatus && !["refunded", "cancelled", "delivered"].includes(orderStatus)) {
        throw new Error("A dispute may only close an order to refunded, cancelled or delivered.");
      }
      if (orderStatus === "refunded" && input.status !== "resolved_buyer") {
        throw new Error("A Stripe refund must resolve the dispute in the buyer's favor.");
      }
      const note = String(input.note ?? "").trim();
      return {
        disputeId: String(input.disputeId),
        status: input.status,
        orderStatus: orderStatus || null,
        note: note || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const isStripeRefund = data.status === "resolved_buyer" && data.orderStatus === "refunded";
    if (isStripeRefund) {
      const client = context.supabase as any;
      const { data: adminRole } = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRole) throw new Error("Administrator access required.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const { data: dispute, error: disputeError } = await admin
        .from("order_disputes")
        .select("id,order_id,status")
        .eq("id", data.disputeId)
        .maybeSingle();
      if (disputeError || !dispute) throw new Error(disputeError?.message ?? "Dispute not found.");
      const { data: order, error: orderError } = await admin
        .from("orders")
        .select("id,order_number,is_demo,stripe_payment_intent_id")
        .eq("id", dispute.order_id)
        .maybeSingle();
      if (orderError || !order) throw new Error(orderError?.message ?? "Order not found.");
      if (order.is_demo) throw new Error("Demo orders do not have Stripe payments to refund.");

      const [{ data: payments, error: paymentError }, { data: payout, error: payoutError }] =
        await Promise.all([
          admin
            .from("order_payments")
            .select("kind,provider,external_reference,provider_status")
            .eq("order_id", order.id),
          admin
            .from("order_payouts")
            .select("provider,external_reference,status")
            .eq("order_id", order.id)
            .maybeSingle(),
        ]);
      if (paymentError) throw new Error(paymentError.message);
      if (payoutError) throw new Error(payoutError.message);

      const stripe = getStripe();
      let payoutReversal: string | null = null;
      if (payout?.status === "completed") {
        if (
          payout.provider !== "stripe_connect" ||
          !String(payout.external_reference ?? "").startsWith("tr_")
        ) {
          throw new Error(
            "This payout was not sent as a ParkVault Stripe transfer. Recover it manually before refunding the buyer.",
          );
        }
        const transferId = String(payout.external_reference);
        const transfer = await stripe.transfers.retrieve(transferId);
        const remaining = Math.max(
          0,
          Number(transfer.amount ?? 0) - Number(transfer.amount_reversed ?? 0),
        );
        if (remaining > 0) {
          const reversal = await stripe.transfers.createReversal(
            transferId,
            {
              amount: remaining,
              metadata: {
                parkvault_order_id: order.id,
                parkvault_dispute_id: data.disputeId,
              },
            },
            { idempotencyKey: `parkvault-dispute-payout-reversal-${data.disputeId}` },
          );
          payoutReversal = reversal.id;
        } else {
          const reversals = await stripe.transfers.listReversals(transferId, { limit: 100 });
          payoutReversal = reversals.data[0]?.id ?? null;
          if (!payoutReversal) {
            throw new Error(
              "Stripe reports the payout as reversed, but no reversal record was found.",
            );
          }
        }
      }

      const paymentIntentIds = new Set<string>();
      if (String(order.stripe_payment_intent_id ?? "").startsWith("pi_")) {
        paymentIntentIds.add(String(order.stripe_payment_intent_id));
      }
      for (const payment of payments ?? []) {
        if (
          payment.provider === "stripe" &&
          payment.provider_status === "succeeded" &&
          ["capture", "payment"].includes(payment.kind) &&
          String(payment.external_reference ?? "").startsWith("pi_")
        ) {
          paymentIntentIds.add(String(payment.external_reference));
        }
      }
      if (paymentIntentIds.size === 0) {
        throw new Error("No captured Stripe payment was found for this order.");
      }

      const refundEvidence = new Map<
        string,
        { refund_id: string; payment_intent: string; amount_cents: number }
      >();
      for (const paymentIntentId of paymentIntentIds) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ["latest_charge"],
        });
        if (intent.status !== "succeeded") {
          throw new Error(
            `Stripe payment ${paymentIntentId} is not captured and cannot be refunded.`,
          );
        }
        const charge =
          typeof intent.latest_charge === "string"
            ? await stripe.charges.retrieve(intent.latest_charge)
            : intent.latest_charge;
        if (!charge) {
          throw new Error(`Stripe charge for ${paymentIntentId} could not be verified.`);
        }
        const refundableCents = Math.max(
          0,
          Number(charge.amount ?? intent.amount_received ?? 0) -
            Number(charge.amount_refunded ?? 0),
        );
        if (refundableCents > 0) {
          await stripe.refunds.create(
            {
              payment_intent: paymentIntentId,
              amount: refundableCents,
              metadata: {
                parkvault_order_id: order.id,
                parkvault_dispute_id: data.disputeId,
              },
            },
            { idempotencyKey: `parkvault-dispute-refund-${data.disputeId}-${paymentIntentId}` },
          );
        }
        const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
        const successful = refunds.data.filter((refund) => refund.status === "succeeded");
        const refundedCents = successful.reduce((sum, refund) => sum + Number(refund.amount), 0);
        if (refundedCents < Number(intent.amount_received ?? intent.amount ?? 0)) {
          throw new Error(`Stripe has not completed the full refund for ${paymentIntentId}.`);
        }
        for (const refund of successful) {
          refundEvidence.set(refund.id, {
            refund_id: refund.id,
            payment_intent: paymentIntentId,
            amount_cents: Number(refund.amount),
          });
        }
      }

      const finalized = await admin.rpc("finalize_dispute_stripe_refund", {
        _dispute_id: data.disputeId,
        _admin_id: context.userId,
        _refunds: [...refundEvidence.values()],
        _payout_reversal: payoutReversal,
        _note: data.note,
      });
      if (finalized.error) {
        throw new Error(
          `Stripe refunded the buyer, but ParkVault could not finish the order record: ${finalized.error.message}`,
        );
      }
      const { emailDisputeUpdate } = await import("./email-notifications.server");
      await emailDisputeUpdate(order.id, "resolved", "resolved buyer — Stripe refund issued").catch(
        (error) => console.error("Stripe refund email failed", error),
      );
      return {
        ok: true as const,
        refundIds: [...refundEvidence.keys()],
        payoutReversal,
      };
    }

    const { error } = await context.supabase.rpc("admin_resolve_dispute", {
      _dispute_id: data.disputeId,
      _status: data.status as "under_review" | "resolved_buyer" | "resolved_seller" | "withdrawn",
      ...(data.orderStatus ? { _order_status: data.orderStatus as never } : {}),
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    const { data: dispute } = await context.supabase
      .from("order_disputes")
      .select("order_id")
      .eq("id", data.disputeId)
      .maybeSingle();
    if (dispute?.order_id) {
      const { emailDisputeUpdate } = await import("./email-notifications.server");
      await emailDisputeUpdate(dispute.order_id, "resolved", data.status.replace(/_/g, " "));
    }
    return { ok: true as const };
  });

export const reviewShopperApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { applicationId: string; approve: boolean; note?: string | null }) => {
    const note = String(input.note ?? "").trim();
    return {
      applicationId: String(input.applicationId),
      approve: Boolean(input.approve),
      note: note || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_shopper_application", {
      _application_id: data.applicationId,
      _approve: data.approve,
      ...(data.note ? { _note: data.note } : {}),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Signed URL to a shopper applicant's private identity document, opened only through this audited channel. */
export const getShopperApplicationDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { applicationId: string }) => ({
    applicationId: String(input.applicationId),
  }))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: path, error } = await context.supabase.rpc("shopper_application_document", {
      _application_id: data.applicationId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("shopper-documents")
      .createSignedUrl(path as string, 120);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Could not open this document.");
    return { url: signed.data.signedUrl };
  });

/**
 * Administrator-only validation summary.
 *
 * Counts are read from `analytics_events` through the caller's own authenticated
 * client, so the admin-only SELECT policy is the access control. Activity is
 * split three ways and never mixed:
 *   real     — non-demo events from members who hold no staff role
 *   demo     — events flagged `is_demo` (demonstration catalog data)
 *   internal — non-demo events produced by an admin or moderator account
 *
 * Rates are `null` whenever the denominator is zero. Nothing is estimated.
 */
export type ValidationBucket = Record<string, number>;

export type ValidationSummary = {
  isAdmin: boolean;
  windowDays: number;
  real: ValidationBucket;
  demo: ValidationBucket;
  internal: ValidationBucket;
  /** Real-activity answers. `null` means there is not enough data to say. */
  questions: { question: string; answer: string | null; detail: string }[];
};

const FUNNEL_EVENTS = [
  "page_view",
  "search_performed",
  "search_no_results",
  "product_viewed",
  "variation_selected",
  "market_option_viewed",
  "bid_started",
  "bid_submitted",
  "ask_started",
  "ask_submitted",
  "buy_now_started",
  "sell_now_started",
  "sourcing_option_viewed",
  "sourcing_option_selected",
  "sourcing_purchase_started",
  "price_confirmation_needed",
  "shopper_application_submitted",
  "shopper_availability_enabled",
  "order_started",
  "payment_evidence_recorded",
  "purchase_evidence_confirmed",
  "shipment_recorded",
  "delivery_confirmed",
  "verified_sale_confirmed",
  "form_abandoned",
] as const;

export const getValidationSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { windowDays?: number }) => ({
    windowDays: Math.min(Math.max(Number(input?.windowDays ?? 30), 1), 180),
  }))
  .handler(async ({ data, context }): Promise<ValidationSummary> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });

    const zero = () => Object.fromEntries(FUNNEL_EVENTS.map((n) => [n, 0])) as ValidationBucket;
    const summary: ValidationSummary = {
      isAdmin: isAdmin === true,
      windowDays: data.windowDays,
      real: zero(),
      demo: zero(),
      internal: zero(),
      questions: [],
    };
    if (!summary.isAdmin) return summary;

    const since = new Date(Date.now() - data.windowDays * 86_400_000).toISOString();
    const [{ data: events }, { data: staff }] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("name, is_demo, user_id, occurred_at")
        .gte("occurred_at", since)
        .limit(50_000),
      supabase.from("user_roles").select("user_id"),
    ]);

    const staffIds = new Set((staff ?? []).map((r) => r.user_id as string));
    for (const e of events ?? []) {
      const name = String(e.name);
      if (!(name in summary.real)) continue;
      const bucket = e.is_demo
        ? summary.demo
        : e.user_id && staffIds.has(e.user_id as string)
          ? summary.internal
          : summary.real;
      bucket[name] = (bucket[name] ?? 0) + 1;
    }

    const r = summary.real;
    const rate = (num: number, den: number) =>
      den > 0 ? `${Math.round((num / den) * 1000) / 10}% (${num} of ${den})` : null;

    summary.questions = [
      {
        question: "Are visitors searching?",
        answer: r["search_performed"]! > 0 ? `${r["search_performed"]} searches` : null,
        detail: "Real searches recorded. Search text is never stored.",
      },
      {
        question: "What share of searches reach a product?",
        answer: rate(r["product_viewed"]!, r["search_performed"]!),
        detail: "Product views against searches. Not a per-session attribution.",
      },
      {
        question: "How often does a search return nothing?",
        answer: rate(r["search_no_results"]!, r["search_performed"]!),
        detail: "Empty result pages against searches — a catalog coverage signal.",
      },
      {
        question: "Are buyers attempting offers or purchases?",
        answer:
          r["bid_started"]! + r["buy_now_started"]! > 0
            ? `${r["bid_submitted"]} offers submitted, ${r["buy_now_started"]} Buy requests started`
            : null,
        detail: "Started against submitted shows where the offer form is abandoned.",
      },
      {
        question: "Are sellers and shoppers supplying options?",
        answer:
          r["ask_submitted"]! + r["shopper_availability_enabled"]! > 0
            ? `${r["ask_submitted"]} listings, ${r["shopper_availability_enabled"]} shopper availability activations`
            : null,
        detail: "Supply side. Sourcing availability expires automatically.",
      },
      {
        question: "Are shoppers completing applications?",
        answer:
          r["shopper_application_submitted"]! > 0
            ? `${r["shopper_application_submitted"]} applications submitted`
            : null,
        detail: "Submitted applications, not approvals.",
      },
      {
        question: "Are users willing to reach the manual payment step?",
        answer: rate(r["payment_evidence_recorded"]!, r["order_started"]!),
        detail:
          "External payment commitment recorded against orders started. Live checkout is disabled, so this measures willingness to proceed manually.",
      },
      {
        question: "Where does abandonment occur?",
        answer:
          r["form_abandoned"]! > 0
            ? `${r["form_abandoned"]} Offer/listing forms closed without submitting`
            : null,
        detail: "Compare with started and submitted counts above.",
      },
      {
        question: "Are sourcing attempts fulfilled?",
        answer: rate(r["verified_sale_confirmed"]!, r["sourcing_purchase_started"]!),
        detail: "Verified sales against sourcing purchases started.",
      },
    ];

    return summary;
  });
