import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getOrder } from "@/lib/market.functions";
import {
  adminAdvanceOrder,
  adminConfirmEvidence,
  adminConfirmVerifiedSale,
  adminRecordPayment,
  adminRecordPayout,
  adminSendStripePayout,
  adminResolveDispute,
  getAdminQueues,
  getEvidenceUrl,
  getOrderOperations,
  getVerifiedSaleEligibility,
} from "@/lib/pilot.functions";
import {
  disputeStatusLabels,
  evidenceKindLabels,
  nextStatusOptions,
  orderStatusLabels,
  originLabels,
  paymentKindLabels,
  paymentStatusLabels,
  payoutStatusLabels,
  shipmentStatusLabels,
} from "@/lib/market-labels";

export const Route = createFileRoute("/_authenticated/admin/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Pilot order console — ParkVault" },
      {
        name: "description",
        content:
          "Operator console for one ParkVault pilot order: external payment evidence, purchase receipts, shipping, verified sale confirmation, payouts and disputes.",
      },
      { property: "og:title", content: "Pilot order console — ParkVault" },
      {
        property: "og:description",
        content:
          "Operator console for one ParkVault pilot order and its external payment evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrderPage,
});

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3 px-4 py-3 text-[12.5px]">{children}</div>
    </section>
  );
}

function AdminOrderPage() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchQueues = useServerFn(getAdminQueues);
  const fetchOrder = useServerFn(getOrder);
  const fetchOps = useServerFn(getOrderOperations);
  const fetchEligibility = useServerFn(getVerifiedSaleEligibility);
  const evidenceUrl = useServerFn(getEvidenceUrl);
  const recordPayment = useServerFn(adminRecordPayment);
  const advance = useServerFn(adminAdvanceOrder);
  const confirmEvidence = useServerFn(adminConfirmEvidence);
  const confirmSale = useServerFn(adminConfirmVerifiedSale);
  const recordPayout = useServerFn(adminRecordPayout);
  const sendStripePayout = useServerFn(adminSendStripePayout);
  const resolveDispute = useServerFn(adminResolveDispute);

  const access = useQuery({ queryKey: ["admin-queues"], queryFn: () => fetchQueues() });
  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder({ data: { orderId } }),
  });
  const ops = useQuery({
    queryKey: ["order-ops", orderId],
    queryFn: () => fetchOps({ data: { orderId } }),
  });
  const eligibility = useQuery({
    queryKey: ["sale-eligibility", orderId],
    queryFn: () => fetchEligibility({ data: { orderId } }),
  });

  useEffect(() => {
    void trackEvent("pilot_console_viewed", { scope: "order" });
  }, []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["order-ops", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["order", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["sale-eligibility", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-queues"] }),
    ]);
  };

  const [kind, setKind] = useState("authorization");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [providerStatus, setProviderStatus] = useState("succeeded");
  const [toStatus, setToStatus] = useState("");
  const [note, setNote] = useState("");
  const [payoutProvider, setPayoutProvider] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("pending");
  const [disputeOutcome, setDisputeOutcome] = useState("under_review");
  const [disputeOrderStatus, setDisputeOrderStatus] = useState("");
  const [refundConfirmationOpen, setRefundConfirmationOpen] = useState(false);

  const paymentMutation = useMutation({
    mutationFn: () =>
      recordPayment({
        data: {
          orderId,
          kind,
          provider,
          externalReference: reference,
          amountCents: Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100),
          currency: order.data?.currency ?? "USD",
          providerStatus,
        },
      }),
    onSuccess: async () => {
      await trackEvent("payment_evidence_recorded", { kind, status: providerStatus });
      setProvider("");
      setReference("");
      setAmount("");
      await refresh();
      toast.success("External payment evidence recorded.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the payment."),
  });

  const advanceMutation = useMutation({
    mutationFn: () => advance({ data: { orderId, toStatus, note: note || null } }),
    onSuccess: async () => {
      await trackEvent("order_status_advanced", { to: toStatus });
      setNote("");
      setToStatus("");
      await refresh();
      toast.success("Order moved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not move the order."),
  });

  const confirmEvidenceMutation = useMutation({
    mutationFn: (evidenceId: string) => confirmEvidence({ data: { evidenceId, note: null } }),
    onSuccess: async () => {
      await trackEvent("purchase_evidence_confirmed", {});
      await refresh();
      toast.success("Evidence confirmed.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not confirm the evidence."),
  });

  const saleMutation = useMutation({
    mutationFn: () => confirmSale({ data: { orderId, note: note || null } }),
    onSuccess: async () => {
      await trackEvent("verified_sale_confirmed", {});
      setNote("");
      await refresh();
      toast.success("Verified sale confirmed and added to market history.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not confirm a verified sale."),
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      recordPayout({
        data: {
          orderId,
          provider: payoutProvider,
          externalReference: payoutReference || null,
          amountCents: order.data?.payoutCents ?? 0,
          currency: order.data?.currency ?? "USD",
          status: payoutStatus,
        },
      }),
    onSuccess: async () => {
      await trackEvent("payout_recorded", { status: payoutStatus });
      await refresh();
      toast.success("Payout record updated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the payout."),
  });
  const stripePayoutMutation = useMutation({
    mutationFn: () => sendStripePayout({ data: { orderId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Stripe payout sent to the seller.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not send the Stripe payout."),
  });

  const disputeMutation = useMutation({
    mutationFn: (disputeId: string) =>
      resolveDispute({
        data: {
          disputeId,
          status: disputeOutcome,
          orderStatus: disputeOrderStatus || null,
          note: note || null,
        },
      }),
    onSuccess: async () => {
      await trackEvent("dispute_resolved", { outcome: disputeOutcome });
      setNote("");
      setRefundConfirmationOpen(false);
      await refresh();
      toast.success("Dispute updated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the dispute."),
  });

  const openFile = async (evidenceId: string) => {
    try {
      const { url } = await evidenceUrl({ data: { evidenceId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open this file.");
    }
  };

  if (access.isLoading || order.isLoading || ops.isLoading) {
    return (
      <p className="mx-auto max-w-[900px] px-4 py-10 text-[13px] text-muted-foreground">Loading…</p>
    );
  }
  if (!access.data?.isAdmin && !access.data?.isModerator) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Operator access required</h1>
      </div>
    );
  }
  const data = ops.data;
  const detail = order.data;
  if (!data || !detail) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <p className="text-[13px] text-muted-foreground">This order could not be loaded.</p>
      </div>
    );
  }

  const isAdmin = access.data.isAdmin;
  const transitions = nextStatusOptions[detail.status] ?? [];

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-10 sm:px-6">
      <Link to="/admin" className="text-[12.5px] text-muted-foreground hover:text-foreground">
        Back to pilot operations
      </Link>

      <div>
        <p className="numeric text-[12px] text-muted-foreground">{detail.orderNumber}</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">{detail.productName}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {detail.variantLabel} · {originLabels[detail.origin] ?? detail.origin} ·{" "}
          {orderStatusLabels[detail.status] ?? detail.status}
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Buyer total {formatUsd(detail.totalCents)} · payout snapshot{" "}
          {formatUsd(detail.payoutCents)} · shopper and fee components are frozen in the immutable
          order snapshot.
        </p>
      </div>

      <Panel title="External payment evidence">
        {data.payments.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing recorded. Either an authorization followed by a capture, or a full payment
            collected before purchase, is acceptable. A deposit alone never funds a park purchase.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
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

        {isAdmin && (
          <form
            className="flex flex-wrap items-end gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              paymentMutation.mutate();
            }}
          >
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Record</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
              >
                {["authorization", "capture", "payment", "refund"].map((k) => (
                  <option key={k} value={k}>
                    {paymentKindLabels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Provider</span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1 h-9 w-32 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Provider reference</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 h-9 w-40 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Amount (USD)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-1 h-9 w-28 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Provider status</span>
              <select
                value={providerStatus}
                onChange={(e) => setProviderStatus(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
              >
                {["succeeded", "pending", "failed", "voided"].map((s) => (
                  <option key={s} value={s}>
                    {paymentStatusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={paymentMutation.isPending}
              className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Record evidence
            </button>
          </form>
        )}
        <p className="text-[11.5px] text-muted-foreground">
          Never record a card number, bank credential or any other payment instrument data — the
          provider's own reference only.
        </p>
      </Panel>

      <Panel title="Purchase evidence">
        {data.evidence.length === 0 ? (
          <p className="text-muted-foreground">
            No receipt or item photograph has been uploaded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.evidence.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span>
                  {evidenceKindLabels[e.kind] ?? e.kind}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {e.receiptAmountCents != null
                      ? `Receipt amount ${formatUsd(e.receiptAmountCents)} · `
                      : ""}
                    {e.confirmedAt ? "Confirmed" : "Awaiting confirmation"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void openFile(e.id)}
                    className="h-8 rounded-md border border-input px-2.5 text-[12px] hover:bg-secondary"
                  >
                    Open securely
                  </button>
                  {!e.confirmedAt && (
                    <button
                      type="button"
                      onClick={() => confirmEvidenceMutation.mutate(e.id)}
                      disabled={confirmEvidenceMutation.isPending}
                      className="h-8 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.assignment && (
          <p className="text-[11.5px] text-muted-foreground">
            Buyer-approved maximum {formatUsd(data.assignment.buyerMaxPurchaseCents)}. A receipt
            above that amount is rejected until the buyer approves a revised maximum.
          </p>
        )}
        <p className="text-[11.5px] text-muted-foreground">
          Every operator view of a receipt or item photograph is written to the evidence access log.
        </p>
      </Panel>

      <Panel title="Shipping">
        {data.shipment ? (
          <p>
            {data.shipment.carrier} · {data.shipment.trackingNumber} ·{" "}
            {shipmentStatusLabels[data.shipment.status] ?? data.shipment.status}
          </p>
        ) : (
          <p className="text-muted-foreground">No shipment recorded.</p>
        )}
        {data.address ? (
          <p className="text-muted-foreground">
            {data.address.recipientName}, {data.address.line1}, {data.address.city},{" "}
            {data.address.region} {data.address.postalCode}, {data.address.country}
          </p>
        ) : (
          <p className="text-[11.5px] text-muted-foreground">
            The buyer's address is held back until the external capture is recorded.
          </p>
        )}
      </Panel>

      {isAdmin && (
        <Panel title="Move the order">
          {transitions.length === 0 ? (
            <p className="text-muted-foreground">
              No further transition is available from this state.
            </p>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                advanceMutation.mutate();
              }}
            >
              <label className="text-[12px]">
                <span className="block text-muted-foreground">Next state</span>
                <select
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value)}
                  className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
                >
                  <option value="">Choose…</option>
                  {transitions.map((s) => (
                    <option key={s} value={s}>
                      {orderStatusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] flex-1">
                <span className="block text-muted-foreground">Operator note (audit logged)</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-surface px-2 text-[13px]"
                />
              </label>
              <button
                type="submit"
                disabled={advanceMutation.isPending || !toStatus}
                className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                Move order
              </button>
            </form>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            Completion is not a manual status change: it happens only through verified sale
            confirmation.
          </p>
        </Panel>
      )}

      {isAdmin && (
        <Panel title="Verified sale">
          {data.verifiedSale ? (
            <p>
              Recorded at {formatUsd(data.verifiedSale.priceCents)} on{" "}
              {new Date(data.verifiedSale.soldAt).toLocaleDateString()}.
            </p>
          ) : (
            <>
              {eligibility.data?.eligible ? (
                <p className="text-muted-foreground">
                  Every condition is met: real order, captured external payment, confirmed evidence,
                  confirmed delivery, inspection period elapsed and no active dispute.
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {(eligibility.data?.reasons ?? ["Checking…"]).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => saleMutation.mutate()}
                disabled={saleMutation.isPending || !eligibility.data?.eligible}
                className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                Confirm verified sale
              </button>
            </>
          )}
        </Panel>
      )}

      {isAdmin && (
        <Panel title="Payout (settled externally)">
          {data.payout && (
            <p>
              {formatUsd(data.payout.amountCents)} ·{" "}
              {payoutStatusLabels[data.payout.status] ?? data.payout.status} ·{" "}
              {data.payout.provider}
            </p>
          )}
          <div className="border border-border bg-surface p-3">
            <p className="text-[12px] font-medium">Connected payout</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              For a completed order funded through Stripe, send the immutable payout amount directly
              to the seller's verified Connect account.
            </p>
            <button
              type="button"
              onClick={() => stripePayoutMutation.mutate()}
              disabled={
                stripePayoutMutation.isPending ||
                detail.status !== "completed" ||
                data.payout?.status === "completed"
              }
              className="mt-2 h-9 bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {stripePayoutMutation.isPending ? "Sending…" : "Send Stripe payout"}
            </button>
            {stripePayoutMutation.isError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {stripePayoutMutation.error instanceof Error
                  ? stripePayoutMutation.error.message
                  : "Could not send the Stripe payout. The payout has not been confirmed."}
              </p>
            )}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              payoutMutation.mutate();
            }}
          >
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Provider</span>
              <input
                value={payoutProvider}
                onChange={(e) => setPayoutProvider(e.target.value)}
                className="mt-1 h-9 w-32 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Provider reference</span>
              <input
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                className="mt-1 h-9 w-40 rounded-md border border-input bg-surface px-2 text-[13px]"
              />
            </label>
            <label className="text-[12px]">
              <span className="block text-muted-foreground">Status</span>
              <select
                value={payoutStatus}
                onChange={(e) => setPayoutStatus(e.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
              >
                {["pending", "processing", "completed", "failed", "reversed"].map((s) => (
                  <option key={s} value={s}>
                    {payoutStatusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={payoutMutation.isPending}
              className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Record payout
            </button>
          </form>
          <p className="text-[11.5px] text-muted-foreground">
            The amount always equals the order's payout snapshot ({formatUsd(detail.payoutCents)}).
            A pending payout is never described as paid, and it cannot be completed before the order
            qualifies as a verified sale.
          </p>
        </Panel>
      )}

      {data.dispute && (
        <Panel title="Dispute">
          <p>{disputeStatusLabels[data.dispute.status] ?? data.dispute.status}</p>
          <p className="text-muted-foreground">{data.dispute.reason}</p>
          {isAdmin && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  disputeOutcome === "resolved_buyer" &&
                  disputeOrderStatus === "refunded" &&
                  !refundConfirmationOpen
                ) {
                  setRefundConfirmationOpen(true);
                  return;
                }
                setRefundConfirmationOpen(false);
                if (data.dispute) disputeMutation.mutate(data.dispute.id);
              }}
            >
              <label className="text-[12px]">
                <span className="block text-muted-foreground">Outcome</span>
                <select
                  value={disputeOutcome}
                  onChange={(e) => {
                    setDisputeOutcome(e.target.value);
                    setRefundConfirmationOpen(false);
                  }}
                  className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
                >
                  {["under_review", "resolved_buyer", "resolved_seller", "withdrawn"].map((s) => (
                    <option key={s} value={s}>
                      {disputeStatusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px]">
                <span className="block text-muted-foreground">Order outcome</span>
                <select
                  value={disputeOrderStatus}
                  onChange={(e) => {
                    setDisputeOrderStatus(e.target.value);
                    setRefundConfirmationOpen(false);
                  }}
                  className="mt-1 h-9 rounded-md border border-input bg-surface px-2 text-[13px]"
                >
                  <option value="">Leave unchanged</option>
                  {["refunded", "cancelled", "delivered"].map((s) => (
                    <option key={s} value={s}>
                      {orderStatusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={disputeMutation.isPending}
                className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {disputeOutcome === "resolved_buyer" && disputeOrderStatus === "refunded"
                  ? refundConfirmationOpen
                    ? "Confirm Stripe refund"
                    : "Refund in Stripe"
                  : "Update dispute"}
              </button>
              {disputeOutcome === "resolved_buyer" && disputeOrderStatus === "refunded" && (
                <div className="w-full space-y-2">
                  <p className="text-[11.5px] text-muted-foreground">
                    Refunds every captured Stripe payment for this order. A completed
                    connected-account payout is reversed first; a pending payout is cancelled.
                  </p>
                  {refundConfirmationOpen && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="min-w-0 flex-1 text-[12px] font-medium">
                        Confirm the full Stripe refund. This cannot be undone from ParkVault.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRefundConfirmationOpen(false)}
                        className="h-8 rounded-md border border-input bg-surface px-3 text-[12px]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </Panel>
      )}

      <Panel title="Order history">
        <ul className="space-y-2">
          {detail.events.map((event) => (
            <li key={event.id}>
              <p className="font-medium">{orderStatusLabels[event.toStatus] ?? event.toStatus}</p>
              {event.note && <p className="text-[12px] text-muted-foreground">{event.note}</p>}
              <p className="numeric text-[11.5px] text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
