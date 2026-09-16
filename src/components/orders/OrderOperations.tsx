import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import {
  approveRevisedMax,
  confirmDelivery,
  getEvidenceUrl,
  getOrderOperations,
  openDispute,
  recordPurchaseEvidence,
  recordShipment,
  setOrderAddress,
  submitOrderReview,
} from "@/lib/pilot.functions";
import { getShippingRates, purchaseShippingLabel, type ShippingRate } from "@/lib/seller.functions";
import {
  disputeStatusLabels,
  evidenceKindLabels,
  paymentKindLabels,
  paymentStatusLabels,
  payoutStatusLabels,
  shipmentStatusLabels,
} from "@/lib/market-labels";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

async function uploadPrivate(file: File, userId: string, prefix: string) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Upload a JPEG, PNG, WebP, HEIC or PDF file.");
  }
  if (file.size > MAX_BYTES) throw new Error("Files must be 8 MB or smaller.");
  const path = `${userId}/${prefix}-${crypto.randomUUID()}`;
  const { error } = await supabase.storage.from("order-evidence").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3 px-4 py-3 text-[12.5px]">{children}</div>
    </section>
  );
}

export function OrderOperations({
  orderId,
  userId,
  showPayout = true,
  showPaymentLedger = true,
  showDispute = true,
  showShipping = true,
  showReview = true,
}: {
  orderId: string;
  userId: string;
  /** Buyers never see seller payout policy or the operator payment ledger. */
  showPayout?: boolean;
  showPaymentLedger?: boolean;
  showDispute?: boolean;
  /** Sellers only see the address and shipping controls once payment is confirmed. */
  showShipping?: boolean;
  /** Hidden when a dedicated review card is rendered elsewhere on the page. */
  showReview?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchOps = useServerFn(getOrderOperations);
  const evidenceUrl = useServerFn(getEvidenceUrl);
  const submitEvidence = useServerFn(recordPurchaseEvidence);
  const approveMax = useServerFn(approveRevisedMax);
  const ship = useServerFn(recordShipment);
  const saveAddress = useServerFn(setOrderAddress);
  const deliver = useServerFn(confirmDelivery);
  const dispute = useServerFn(openDispute);
  const review = useServerFn(submitOrderReview);
  const fetchShippingRates = useServerFn(getShippingRates);
  const buyShippingLabel = useServerFn(purchaseShippingLabel);

  const ops = useQuery({
    queryKey: ["order-ops", orderId],
    queryFn: () => fetchOps({ data: { orderId } }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["order-ops", orderId] });

  const [receipt, setReceipt] = useState<File | null>(null);
  const [itemPhoto, setItemPhoto] = useState<File | null>(null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [revisedMax, setRevisedMax] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [parcel, setParcel] = useState({ length: "10", width: "8", height: "6", weight: "2" });
  const [address, setAddress] = useState({
    recipientName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  });
  const [shippingQuote, setShippingQuote] = useState<{
    quoteId: string;
    rates: ShippingRate[];
  } | null>(null);
  const [selectedRate, setSelectedRate] = useState("");

  const evidenceMutation = useMutation({
    mutationFn: async () => {
      if (!receipt || !itemPhoto)
        throw new Error("Attach both the receipt and an item photograph.");
      const cents = Math.round(Number(receiptAmount.replace(/[^0-9.]/g, "")) * 100);
      const [receiptPath, itemPhotoPath] = await Promise.all([
        uploadPrivate(receipt, userId, "receipt"),
        uploadPrivate(itemPhoto, userId, "item"),
      ]);
      return submitEvidence({
        data: { orderId, receiptPath, itemPhotoPath, receiptAmountCents: cents },
      });
    },
    onSuccess: async () => {
      await trackEvent("purchase_evidence_submitted", {});
      setReceipt(null);
      setItemPhoto(null);
      setReceiptAmount("");
      await refresh();
      toast.success("Purchase evidence submitted for operator review.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit evidence."),
  });

  const shipMutation = useMutation({
    mutationFn: () => ship({ data: { orderId, carrier, trackingNumber: tracking } }),
    onSuccess: async () => {
      await trackEvent("shipment_recorded", {});
      setCarrier("");
      setTracking("");
      await refresh();
      toast.success("Item marked as shipped. The buyer can now track it.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the shipment."),
  });

  const markLabelShipmentMutation = useMutation({
    mutationFn: () => {
      const shipment = ops.data?.shipment;
      if (!shipment?.carrier || !shipment.trackingNumber) {
        throw new Error("The prepaid label is missing carrier or tracking information.");
      }
      return ship({
        data: {
          orderId,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
        },
      });
    },
    onSuccess: async () => {
      await trackEvent("shipment_recorded", {});
      await refresh();
      toast.success("Item marked as shipped. The buyer can now track it.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not mark the item as shipped."),
  });

  const addressMutation = useMutation({
    mutationFn: () => saveAddress({ data: { orderId, ...address } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Shipping address saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save this address."),
  });

  const ratesMutation = useMutation({
    mutationFn: () =>
      fetchShippingRates({
        data: {
          orderId,
          lengthIn: Number(parcel.length),
          widthIn: Number(parcel.width),
          heightIn: Number(parcel.height),
          weightLb: Number(parcel.weight),
        },
      }),
    onSuccess: (result) => {
      setShippingQuote(result);
      setSelectedRate(result.rates[0]?.id ?? "");
      toast.success("Live shipping rates loaded.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not load shipping rates."),
  });

  const labelMutation = useMutation({
    mutationFn: () => {
      if (!shippingQuote || !selectedRate) throw new Error("Choose a shipping rate.");
      return buyShippingLabel({ data: { quoteId: shippingQuote.quoteId, rateId: selectedRate } });
    },
    onSuccess: async ({ labelUrl }) => {
      await refresh();
      window.open(labelUrl, "_blank", "noopener,noreferrer");
      toast.success("Prepaid label created.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the label."),
  });

  const deliverMutation = useMutation({
    mutationFn: () => deliver({ data: { orderId, proofPath: null } }),
    onSuccess: async () => {
      await trackEvent("delivery_confirmed", {});
      await refresh();
      toast.success("Delivery confirmed. ParkVault will complete the order after review.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not confirm delivery."),
  });

  const maxMutation = useMutation({
    mutationFn: () =>
      approveMax({
        data: {
          orderId,
          newMaxCents: Math.round(Number(revisedMax.replace(/[^0-9.]/g, "")) * 100),
        },
      }),
    onSuccess: async () => {
      await trackEvent("revised_max_approved", {});
      setRevisedMax("");
      await refresh();
      toast.success("Revised maximum approved.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not approve a revised maximum."),
  });

  const disputeMutation = useMutation({
    mutationFn: () => dispute({ data: { orderId, reason: disputeReason } }),
    onSuccess: async () => {
      await trackEvent("dispute_opened", {});
      setDisputeReason("");
      await refresh();
      toast.success("A dispute was opened and an operator will review it.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not open a dispute."),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      review({ data: { orderId, rating: Number(rating), comment: comment || null } }),
    onSuccess: async () => {
      await trackEvent("review_submitted", { rating: Number(rating) });
      setComment("");
      await refresh();
      toast.success("Review submitted.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit the review."),
  });

  const openFile = async (evidenceId: string) => {
    try {
      const { url } = await evidenceUrl({ data: { evidenceId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open this file.");
    }
  };

  if (ops.isLoading) {
    return <p className="text-[12.5px] text-muted-foreground">Loading pilot operations…</p>;
  }
  const data = ops.data;
  if (!data) return null;

  const isSeller = data.role === "seller";
  const isBuyer = data.role === "buyer";
  const isSourcing = data.origin.startsWith("sourcing_");

  return (
    <div className="space-y-6">
      {showPaymentLedger && (
        <Section title="Payment">
          {data.payments.length === 0 ? (
            <p className="text-muted-foreground">Payment has not been confirmed yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-4">
                  <span>
                    {paymentKindLabels[p.kind] ?? p.kind} · {p.provider} · ref {p.externalReference}
                    <span className="block text-[11.5px] text-muted-foreground">
                      {paymentStatusLabels[p.providerStatus] ?? p.providerStatus} ·{" "}
                      {new Date(p.occurredAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="numeric font-medium">{formatUsd(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            {data.paymentCaptured
              ? "The buyer's payment was captured securely by Stripe."
              : data.fundingCommitted
                ? "The buyer's full payment obligation is committed. Fulfillment may begin."
                : "Fulfillment cannot begin until the buyer's payment is confirmed."}
          </p>
        </Section>
      )}

      {data.assignment && (
        <Section title="Park-sourced purchase">
          <p>
            Shopper fee {formatUsd(data.assignment.shopperFeeCents)} · reference price{" "}
            {formatUsd(data.assignment.referencePriceCents)} · buyer-approved maximum{" "}
            {formatUsd(data.assignment.buyerMaxPurchaseCents)}
          </p>
          <p className="text-muted-foreground">
            {data.assignment.coverageLabel} · purchase deadline{" "}
            {new Date(data.assignment.purchaseDeadline).toLocaleString()}
          </p>
          {data.verifiedPurchaseCents != null && (
            <p>
              Verified purchase amount:{" "}
              <span className="numeric font-medium">{formatUsd(data.verifiedPurchaseCents)}</span>
              {data.itemPhotoOnFile ? " · item photograph on file" : ""}
            </p>
          )}
          {isBuyer && (
            <form
              className="flex flex-wrap items-end gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                maxMutation.mutate();
              }}
            >
              <label className="text-[12px]">
                <span className="block text-muted-foreground">Approve a revised maximum (USD)</span>
                <input
                  value={revisedMax}
                  onChange={(e) => setRevisedMax(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="mt-1 h-9 w-32 rounded-md border border-input bg-surface px-2 text-[13px]"
                />
              </label>
              <button
                type="submit"
                disabled={maxMutation.isPending || !revisedMax}
                className="h-9 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-50"
              >
                Approve revised maximum
              </button>
            </form>
          )}
        </Section>
      )}

      {isSeller && isSourcing && (
        <Section title="Purchase evidence">
          <p className="text-muted-foreground">
            {isSourcing
              ? "Upload the receipt from your in-park purchase and a photograph of the item. Files are stored privately: you and an authorised operator can open them, and the buyer only ever sees the verified purchase amount and that the item was photographed."
              : "Upload the purchase receipt and a photograph of the item. Files are stored privately: you and an authorised operator can open them, and the buyer only ever sees the verified purchase amount and that the item was photographed."}
          </p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              evidenceMutation.mutate();
            }}
          >
            <label className="block text-[12px]">
              <span className="text-muted-foreground">Receipt (image or PDF)</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-[12px]"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted-foreground">Photograph of the item</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setItemPhoto(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-[12px]"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted-foreground">Actual amount on the receipt (USD)</span>
              <input
                value={receiptAmount}
                onChange={(e) => setReceiptAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1 h-9 w-32 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <button
              type="submit"
              disabled={evidenceMutation.isPending}
              className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {evidenceMutation.isPending ? "Submitting…" : "Submit purchase evidence"}
            </button>
          </form>
        </Section>
      )}

      {data.evidence.length > 0 && (
        <Section title="Evidence on file">
          <ul className="space-y-2">
            {data.evidence.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span>
                  {evidenceKindLabels[e.kind] ?? e.kind}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {e.receiptAmountCents != null ? `${formatUsd(e.receiptAmountCents)} · ` : ""}
                    {e.confirmedAt ? "Confirmed by an operator" : "Awaiting operator confirmation"}
                  </span>
                </span>
                {e.canOpen && (
                  <button
                    type="button"
                    onClick={() => void openFile(e.id)}
                    className="h-8 rounded-md border border-input px-2.5 text-[12px] hover:bg-secondary"
                  >
                    Open securely
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {showShipping && (
        <Section title="Shipping and delivery">
          {data.shipment ? (
            <>
              <p>
                {data.shipment.carrier} · {data.shipment.trackingNumber}
              </p>
              <p className="text-muted-foreground">
                {shipmentStatusLabels[data.shipment.status] ?? data.shipment.status}
                {data.shipment.serviceLevel ? ` · ${data.shipment.serviceLevel}` : ""}
                {data.shipment.rateCents != null ? ` · ${formatUsd(data.shipment.rateCents)}` : ""}
                {data.shipment.shippedAt
                  ? ` · shipped ${new Date(data.shipment.shippedAt).toLocaleString()}`
                  : ""}
                {data.shipment.deliveredAt
                  ? ` · delivered ${new Date(data.shipment.deliveredAt).toLocaleString()}`
                  : ""}
              </p>
              {data.shipment.shipBy ? (
                <p className="text-[11.5px] text-muted-foreground">
                  Ship by {new Date(data.shipment.shipBy).toLocaleString()}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {data.shipment.labelUrl ? (
                  <a
                    href={data.shipment.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center bg-primary px-3 text-[12px] font-medium text-primary-foreground"
                  >
                    Print label
                  </a>
                ) : null}
                {data.shipment.trackingUrl ? (
                  <a
                    href={data.shipment.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center border border-input px-3 text-[12px] font-medium"
                  >
                    Track package
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No shipment recorded yet.</p>
          )}

          {data.address ? (
            <div className="rounded-md border border-border bg-surface p-3">
              <p className="font-medium">{data.address.recipientName}</p>
              <p className="text-muted-foreground">
                {data.address.line1}
                {data.address.line2 ? `, ${data.address.line2}` : ""}, {data.address.city},{" "}
                {data.address.region} {data.address.postalCode}, {data.address.country}
              </p>
            </div>
          ) : isBuyer ? (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <p className="text-muted-foreground">
                Add where this should ship. It's only released to{" "}
                {isSourcing ? "your shopper" : "the seller"} once your payment is recorded as
                captured.
              </p>
              <form
                className="grid grid-cols-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addressMutation.mutate();
                }}
              >
                <label className="col-span-2 text-[12px]">
                  <span className="text-muted-foreground">Recipient name</span>
                  <input
                    value={address.recipientName}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, recipientName: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="col-span-2 text-[12px]">
                  <span className="text-muted-foreground">Address line 1</span>
                  <input
                    value={address.line1}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, line1: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="col-span-2 text-[12px]">
                  <span className="text-muted-foreground">Address line 2 (optional)</span>
                  <input
                    value={address.line2}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, line2: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="text-[12px]">
                  <span className="text-muted-foreground">City</span>
                  <input
                    value={address.city}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, city: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="text-[12px]">
                  <span className="text-muted-foreground">State / region</span>
                  <input
                    value={address.region}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, region: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="text-[12px]">
                  <span className="text-muted-foreground">Postal code</span>
                  <input
                    value={address.postalCode}
                    onChange={(e) =>
                      setAddress((current) => ({ ...current, postalCode: e.target.value }))
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  />
                </label>
                <label className="text-[12px]">
                  <span className="text-muted-foreground">Country</span>
                  <input
                    value={address.country}
                    onChange={(e) =>
                      setAddress((current) => ({
                        ...current,
                        country: e.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={2}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] uppercase"
                  />
                </label>
                <button
                  type="submit"
                  disabled={addressMutation.isPending}
                  className="col-span-2 mt-1 h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {addressMutation.isPending ? "Saving…" : "Save shipping address"}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">
              The buyer's shipping address is released to the fulfilment party only once the
              external payment is recorded as captured.
            </p>
          )}

          {isSeller && data.paymentCaptured && !data.shipment && (
            <div className="space-y-4 border-t border-border pt-3">
              <div>
                <p className="font-medium">Create a prepaid label</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["length", "Length (in)"],
                    ["width", "Width (in)"],
                    ["height", "Height (in)"],
                    ["weight", "Weight (lb)"],
                  ].map(([key, label]) => (
                    <label key={key} className="text-[11px] text-muted-foreground">
                      {label}
                      <input
                        value={parcel[key as keyof typeof parcel] ?? ""}
                        onChange={(e) =>
                          setParcel((current) => ({ ...current, [String(key)]: e.target.value }))
                        }
                        inputMode="decimal"
                        className="numeric mt-1 h-9 w-full border border-input bg-surface px-2 text-foreground"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => ratesMutation.mutate()}
                  disabled={ratesMutation.isPending}
                  className="mt-2 h-9 bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {ratesMutation.isPending ? "Loading rates…" : "Get prepaid rates"}
                </button>
                {shippingQuote ? (
                  <div className="mt-3 space-y-2">
                    {shippingQuote.rates.map((rate) => (
                      <label
                        key={rate.id}
                        className="flex items-center justify-between gap-3 border border-border p-2.5"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="shipping-rate"
                            value={rate.id}
                            checked={selectedRate === rate.id}
                            onChange={() => setSelectedRate(rate.id)}
                          />
                          <span>
                            {rate.carrier} · {rate.service}
                            <span className="block text-[10.5px] text-muted-foreground">
                              {rate.estimatedDays == null
                                ? "Delivery estimate unavailable"
                                : `${rate.estimatedDays} estimated day(s)`}
                            </span>
                          </span>
                        </span>
                        <strong className="numeric">{formatUsd(rate.amountCents)}</strong>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => labelMutation.mutate()}
                      disabled={!selectedRate || labelMutation.isPending}
                      className="h-9 bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {labelMutation.isPending ? "Buying label…" : "Buy selected label"}
                    </button>
                  </div>
                ) : null}
              </div>
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer text-[11.5px] text-muted-foreground">
                  Already bought a label elsewhere?
                </summary>
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    shipMutation.mutate();
                  }}
                >
                  <label className="text-[12px]">
                    <span className="block text-muted-foreground">Carrier</span>
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="mt-1 h-9 w-36 rounded-md border border-input bg-surface px-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12px]">
                    <span className="block text-muted-foreground">Tracking number</span>
                    <input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      className="mt-1 h-9 w-44 rounded-md border border-input bg-surface px-2 text-[13px]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={shipMutation.isPending}
                    className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {shipMutation.isPending ? "Saving…" : "Mark item as shipped"}
                  </button>
                </form>
              </details>
            </div>
          )}

          {isSeller &&
            data.paymentCaptured &&
            data.shipment &&
            ["pending", "label_created"].includes(data.shipment.status) && (
              <div className="border-t border-border pt-3">
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Print the label and hand the package to the carrier. Then mark it shipped so the
                  buyer receives the tracking update.
                </p>
                <button
                  type="button"
                  onClick={() => markLabelShipmentMutation.mutate()}
                  disabled={markLabelShipmentMutation.isPending}
                  className="mt-2 h-9 bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {markLabelShipmentMutation.isPending ? "Saving…" : "Mark item as shipped"}
                </button>
              </div>
            )}

          {isBuyer && data.status === "shipped" && (
            <div className="border-t border-border pt-3">
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Confirm only after the package arrives. If something is wrong, open a dispute
                instead.
              </p>
              <button
                type="button"
                onClick={() => deliverMutation.mutate()}
                disabled={deliverMutation.isPending}
                className="mt-2 h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {deliverMutation.isPending ? "Confirming…" : "Confirm item received"}
              </button>
            </div>
          )}
        </Section>
      )}

      {showPayout && (
        <Section title="Payout">
          {data.payout ? (
            <>
              <p className="numeric font-medium">{formatUsd(data.payout.amountCents)}</p>
              <p className="text-muted-foreground">
                {payoutStatusLabels[data.payout.status] ?? data.payout.status} ·{" "}
                {data.payout.provider}
                {data.payout.externalReference ? ` · ref ${data.payout.externalReference}` : ""}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Seller proceeds remain pending until delivery is confirmed and the review window ends.
              ParkVault then releases the payout to the seller's connected Stripe account.
            </p>
          )}
        </Section>
      )}

      {data.verifiedSale && (
        <Section title="Verified sale">
          <p>
            Recorded at{" "}
            <span className="numeric font-medium">{formatUsd(data.verifiedSale.priceCents)}</span>{" "}
            on {new Date(data.verifiedSale.soldAt).toLocaleDateString()}.{" "}
            {data.verifiedSale.isLive
              ? "This sale counts towards public market history."
              : "This test sale is retained privately and excluded from public market history."}
          </p>
        </Section>
      )}

      {(showDispute || Boolean(data.dispute)) && (
        <Section title="Dispute">
          {data.dispute ? (
            <>
              <p>{disputeStatusLabels[data.dispute.status] ?? data.dispute.status}</p>
              <p className="text-muted-foreground">{data.dispute.reason}</p>
              {data.dispute.resolutionNote && (
                <p className="text-muted-foreground">
                  Operator note: {data.dispute.resolutionNote}
                </p>
              )}
            </>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                disputeMutation.mutate();
              }}
            >
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Describe what went wrong with this order."
                className="w-full rounded-md border border-input bg-surface p-2 text-[12.5px]"
              />
              <button
                type="submit"
                disabled={disputeMutation.isPending || disputeReason.trim().length < 10}
                className="h-9 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-50"
              >
                Open a dispute
              </button>
            </form>
          )}
        </Section>
      )}

      {showReview && (data.canReview || data.myReviewRating != null) && (
        <Section title={isBuyer ? "Review your seller" : "Review your buyer"}>
          {data.myReviewRating != null ? (
            <p className="text-muted-foreground">
              You rated {isBuyer ? "this seller" : "this buyer"} {data.myReviewRating} out of 5.
            </p>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                reviewMutation.mutate();
              }}
            >
              <label className="block text-[12px]">
                <span className="text-muted-foreground">Rating</span>
                <select
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  className="mt-1 h-9 w-24 rounded-md border border-input bg-surface px-2 text-[13px]"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Optional: how did the transaction go?"
                className="w-full rounded-md border border-input bg-surface p-2 text-[12.5px]"
              />
              <button
                type="submit"
                disabled={reviewMutation.isPending}
                className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                Submit review
              </button>
            </form>
          )}
        </Section>
      )}
    </div>
  );
}
