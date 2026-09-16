import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";

import { formatUsd } from "@/config/fees";
import { getOrder, type OrderDetail } from "@/lib/market.functions";
import {
  confirmOrderCheckout,
  confirmSourcingBalanceCheckout,
  startSourcingBalanceCheckout,
  startSourcingTipCheckout,
} from "@/lib/stripe-marketplace.functions";
import { getSourcingProgress } from "@/lib/shopper.functions";
import { BuyerOrderReceipt } from "@/components/orders/BuyerOrderReceipt";
import { SellerOrderPanel } from "@/components/orders/SellerOrderPanel";
import { OrderOperations } from "@/components/orders/OrderOperations";
import { OrderReviewCard } from "@/components/orders/OrderReviewCard";
import { useAuth } from "@/hooks/useAuth";

const PAID_STATUSES = new Set([
  "paid",
  "payment_captured",
  "sourcing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
  "disputed",
]);
const CLOSED_STATUSES = new Set(["cancelled", "refunded"]);

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderPage,
  head: () => ({
    meta: [
      { title: "Your ParkVault order" },
      {
        name: "description",
        content:
          "Your ParkVault order confirmation: what you paid, when it ships, and how to track it.",
      },
      { property: "og:title", content: "Your ParkVault order" },
      {
        property: "og:description",
        content: "Order confirmation and delivery status for your ParkVault purchase.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchOrder = useServerFn(getOrder);
  const confirmCheckout = useServerFn(confirmOrderCheckout);
  const { data, isLoading, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder({ data: { orderId } }),
  });

  const isBuyer = data?.role === "buyer";
  const isPaid = Boolean(data && (data.paymentAuthorized || PAID_STATUSES.has(data.status)));
  const isClosed = Boolean(data && CLOSED_STATUSES.has(data.status));
  const isSourcing = data?.origin === "sourcing_shopper";
  // Jobs created before ParkVault charged up front never had a checkout session.
  const isLegacySourcingRequest = Boolean(isSourcing && !data?.paymentStatus);
  const needsConfirmation = Boolean(
    isBuyer &&
    data &&
    !isPaid &&
    !isClosed &&
    !isLegacySourcingRequest &&
    data.paymentStatus === "checkout_open",
  );

  // Stripe's webhook is the primary settlement signal. When the buyer returns
  // from Checkout we also verify their session directly, so a delayed webhook
  // never leaves a paid buyer staring at "awaiting payment".
  const confirmation = useQuery({
    queryKey: ["order-checkout-confirm", orderId],
    queryFn: () => confirmCheckout({ data: { orderId } }),
    enabled: needsConfirmation,
    refetchInterval: (query) => (query.state.data?.state === "pending" ? 4000 : false),
  });

  useEffect(() => {
    if (confirmation.data?.state === "paid") {
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-ops", orderId] });
    }
  }, [confirmation.data?.state, orderId, queryClient]);

  // Identifiers, role and status only — never addresses or other typed content.
  useEffect(() => {
    if (!data) return;
    void trackEvent("order_viewed", { role: data.role, origin: data.origin, status: data.status });
  }, [data]);

  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 sm:px-6">
      <Link to="/buying" className="text-[12.5px] text-muted-foreground hover:text-foreground">
        Back to your orders
      </Link>

      {isLoading && <p className="mt-6 text-[13px] text-muted-foreground">Loading order…</p>}
      {error && (
        <p className="mt-6 text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Could not load this order."}
        </p>
      )}
      {data === null && !isLoading && (
        <p className="mt-6 text-[13px] text-muted-foreground">
          This order does not exist, or you are not a party to it.
        </p>
      )}

      {data && isBuyer && (
        <div className="mt-4">
          {isPaid ? (
            <>
              <BuyerOrderReceipt order={data} />
              {isSourcing && (
                <div className="mt-6">
                  <SourcingProgressCard orderId={orderId} />
                </div>
              )}
              {["delivered", "completed"].includes(data.status) && (
                <div className="mt-6 space-y-6">
                  {isSourcing && <ShopperTipCard orderId={orderId} />}
                  <OrderReviewCard orderId={orderId} role="buyer" />
                </div>
              )}
              {["shipped", "delivered", "completed", "disputed"].includes(data.status) && user && (
                <div className="mt-6">
                  <OrderOperations
                    orderId={orderId}
                    userId={user.id}
                    showPayout={false}
                    showPaymentLedger={false}
                    showReview={false}
                    showDispute={["shipped", "delivered", "disputed"].includes(data.status)}
                  />
                </div>
              )}
            </>
          ) : isClosed ? (
            <ClosedOrder order={data} />
          ) : isLegacySourcingRequest ? (
            <SourcingRequestReceipt order={data} />
          ) : (
            <PendingOrder order={data} />
          )}
        </div>
      )}

      {data && !isBuyer && (
        <div className="mt-4">
          {isClosed ? (
            <SellerClosedOrder order={data} />
          ) : isPaid ? (
            <div className="space-y-6">
              <SellerOrderPanel
                order={data}
                headline={
                  data.status === "shipped" || data.status === "delivered"
                    ? "On its way to the buyer"
                    : isSourcing
                      ? "Paid job — shop and ship"
                      : "Sold — ship this item"
                }
                message={
                  data.status === "shipped" || data.status === "delivered"
                    ? "Tracking is shared with the buyer. Your payout is released after delivery and the review window."
                    : isSourcing
                      ? "The buyer has already paid. Record your purchase on your Park Shopper dashboard, then ship from here."
                      : "The buyer's payment is confirmed. Ship the exact photographed item, then record your shipment below."
                }
              />
              {["delivered", "completed"].includes(data.status) && (
                <OrderReviewCard orderId={orderId} role="seller" />
              )}
              {user && (
                <OrderOperations
                  orderId={orderId}
                  userId={user.id}
                  showPaymentLedger={false}
                  showReview={false}
                  showDispute={["shipped", "delivered", "disputed"].includes(data.status)}
                />
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <SellerOrderPanel
                order={data}
                headline="Item reserved"
                message="The buyer is completing checkout. Nothing to do yet — if their reservation expires, your listing returns to the market automatically."
              />
              <Link
                to="/selling"
                className="inline-flex h-11 items-center border border-foreground px-5 text-[12.5px] font-semibold hover:bg-foreground hover:text-background"
              >
                Selling dashboard
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourcingRequestReceipt({ order }: { order: OrderDetail }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="bg-primary px-5 py-8 text-center text-primary-foreground sm:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Request received</p>
        <h1 className="mt-2 font-editorial text-[32px] leading-tight sm:text-[38px]">
          Sourcing request confirmed
        </h1>
        <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed opacity-90">
          Your Park Shopper has been notified and will check whether the item is available. You
          haven&apos;t been charged.
        </p>
      </div>

      <div className="px-5 py-6 sm:px-8">
        <div className="flex items-start justify-between gap-5 border-b border-border pb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              Requested item
            </p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">{order.productName}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{order.variantLabel}</p>
          </div>
          <p className="numeric shrink-0 text-[11.5px] text-muted-foreground">
            {order.orderNumber}
          </p>
        </div>

        <div className="py-5">
          <h2 className="text-[13px] font-semibold">What happens next</h2>
          <ol className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">1. The shopper checks availability.</strong> The
              item is not guaranteed until they find and confirm it.
            </li>
            <li>
              <strong className="text-foreground">2. You receive an update.</strong> If the shopper
              finds it, you&apos;ll be notified with the next step before payment is due.
            </li>
            <li>
              <strong className="text-foreground">3. The item is shipped to you.</strong> Tracking
              appears here after the shopper completes the purchase.
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
          <Link
            to="/buying"
            className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground"
          >
            View my purchases
          </Link>
          <Link
            to="/products/$slug"
            params={{ slug: order.productSlug }}
            className="inline-flex h-11 items-center border border-foreground px-5 text-[12.5px] font-semibold hover:bg-foreground hover:text-background"
          >
            Back to product
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * How a paid Park Shopper job is going: whether the shopper is in park yet,
 * what they actually paid, and any approved balance or automatic refund.
 */
function SourcingProgressCard({ orderId }: { orderId: string }) {
  const fetchProgress = useServerFn(getSourcingProgress);
  const startBalance = useServerFn(startSourcingBalanceCheckout);
  const confirmBalance = useServerFn(confirmSourcingBalanceCheckout);
  const queryClient = useQueryClient();
  const [returningFromBalance, setReturningFromBalance] = useState(false);
  const progress = useQuery({
    queryKey: ["sourcing-progress", orderId],
    queryFn: () => fetchProgress({ data: { orderId } }),
  });
  useEffect(() => {
    setReturningFromBalance(
      new URLSearchParams(window.location.search).get("checkout") === "balance-paid",
    );
  }, []);
  const balanceConfirmation = useQuery({
    queryKey: ["sourcing-balance-confirm", orderId],
    queryFn: () => confirmBalance({ data: { orderId } }),
    enabled: returningFromBalance,
    refetchInterval: (query) => (query.state.data?.state === "pending" ? 4000 : false),
  });
  useEffect(() => {
    if (balanceConfirmation.data?.state !== "paid") return;
    void queryClient.invalidateQueries({ queryKey: ["sourcing-progress", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["order-ops", orderId] });
  }, [balanceConfirmation.data?.state, orderId, queryClient]);
  const balanceMutation = useMutation({
    mutationFn: () => startBalance({ data: { orderId } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open checkout."),
  });

  if (progress.isLoading || !progress.data) return null;
  const job = progress.data;
  const step = job.purchaseConfirmedAt
    ? "Your shopper bought it"
    : job.shoppingStartedAt
      ? "Your shopper is in park looking for it"
      : "Your shopper has the job";

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-[13px] font-semibold tracking-tight">Park Shopper progress</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{step}.</p>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Maximum you approved</dt>
          <dd className="numeric font-medium">{formatUsd(job.buyerMaxPurchaseCents)}</dd>
        </div>
        {job.actualCostCents != null && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Price paid in park</dt>
            <dd className="numeric font-medium">{formatUsd(job.actualCostCents)}</dd>
          </div>
        )}
        {job.refundDueCents > 0 && !job.refundCompletedAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Refund processing</dt>
            <dd className="numeric font-medium">{formatUsd(job.refundDueCents)}</dd>
          </div>
        )}
        {job.refundCompletedAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Receipt adjustment refunded</dt>
            <dd className="font-medium">Issued</dd>
          </div>
        )}
      </dl>
      {job.balanceDueCents > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[12.5px] leading-relaxed">
            The item cost {formatUsd(job.balanceDueCents)} more than the estimate, inside the
            maximum you approved. Pay the difference and your shopper ships right away.
          </p>
          <button
            type="button"
            disabled={balanceMutation.isPending}
            onClick={() => balanceMutation.mutate()}
            className="mt-3 inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {balanceMutation.isPending
              ? "Opening checkout…"
              : `Pay ${formatUsd(job.balanceDueCents)} balance`}
          </button>
        </div>
      )}
    </section>
  );
}

function ShopperTipCard({ orderId }: { orderId: string }) {
  const fetchProgress = useServerFn(getSourcingProgress);
  const startTip = useServerFn(startSourcingTipCheckout);
  const [custom, setCustom] = useState("");
  const progress = useQuery({
    queryKey: ["sourcing-progress", orderId],
    queryFn: () => fetchProgress({ data: { orderId } }),
  });
  const tipMutation = useMutation({
    mutationFn: (amountCents: number) => startTip({ data: { orderId, amountCents } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open tip checkout."),
  });
  const sendCustom = () => {
    const cents = Math.round(Number(custom.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents < 100 || cents > 50_000) {
      toast.error("Choose a tip between $1 and $500.");
      return;
    }
    tipMutation.mutate(cents);
  };
  if (progress.isLoading || !progress.data) return null;
  if (progress.data.tipCents > 0) {
    return (
      <section className="rounded-xl border border-border bg-card px-5 py-5">
        <h2 className="text-[13px] font-semibold">Thank you for tipping your Park Shopper</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Your {formatUsd(progress.data.tipCents)} tip was transferred entirely to your shopper.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-[13px] font-semibold">Tip your Park Shopper</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Optional. 100% of your tip goes to the shopper who found and shipped your item.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[500, 1000, 1500].map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={tipMutation.isPending}
            onClick={() => tipMutation.mutate(amount)}
            className="h-10 border border-foreground px-4 text-[12px] font-semibold hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            {formatUsd(amount)}
          </button>
        ))}
        <div className="flex">
          <input
            aria-label="Custom tip"
            inputMode="decimal"
            placeholder="Other amount"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="numeric h-10 w-32 border border-input bg-background px-3 text-[12px]"
          />
          <button
            type="button"
            disabled={tipMutation.isPending}
            onClick={sendCustom}
            className="h-10 bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  );
}

function PendingOrder({ order }: { order: OrderDetail }) {
  // An order with no Stripe payment status never reached checkout, so there is
  // nothing to confirm — say so instead of spinning on "confirming payment".
  if (!order.paymentStatus) {
    return (
      <section className="rounded-xl border border-border bg-card px-5 py-8 text-center">
        <h1 className="font-editorial text-[27px] leading-tight tracking-[-0.03em]">
          Payment was never started
        </h1>
        <p className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-muted-foreground">
          No card was charged for this order. The reservation releases on its own and the item
          returns to the market — open the product again to check out.
        </p>
        <p className="numeric mt-4 text-[11.5px] text-muted-foreground">{order.orderNumber}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            to="/products/$slug"
            params={{ slug: order.productSlug }}
            className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground"
          >
            Back to the product
          </Link>
          <Link
            to="/buying"
            className="inline-flex h-11 items-center border border-foreground px-5 text-[12.5px] font-semibold hover:bg-foreground hover:text-background"
          >
            My purchases
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-8 text-center">
      <h1 className="font-editorial text-[27px] leading-tight tracking-[-0.03em]">
        Confirming your payment…
      </h1>
      <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-relaxed text-muted-foreground">
        We're checking with Stripe. This page updates itself the moment your payment settles — you
        do not need to pay again.
      </p>
      <p className="numeric mt-4 text-[11.5px] text-muted-foreground">{order.orderNumber}</p>
      <p className="mt-4 text-[12px] font-medium">{order.productName}</p>
      <p className="numeric text-[12px] text-muted-foreground">{formatUsd(order.totalCents)}</p>
    </section>
  );
}

function ClosedOrder({ order }: { order: OrderDetail }) {
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-8 text-center">
      <h1 className="font-editorial text-[27px] leading-tight tracking-[-0.03em]">
        {order.status === "refunded" ? "This order was refunded" : "This order did not complete"}
      </h1>
      <p className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-muted-foreground">
        {order.status === "refunded"
          ? "Your refund was issued to your original payment method. Nothing further is needed."
          : "No payment was taken, and the item is back on the market. You can buy it again if it is still listed."}
      </p>
      <p className="numeric mt-4 text-[11.5px] text-muted-foreground">{order.orderNumber}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          to="/products/$slug"
          params={{ slug: order.productSlug }}
          className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground"
        >
          View the product
        </Link>
        <Link
          to="/buying"
          className="inline-flex h-11 items-center border border-foreground px-5 text-[12.5px] font-semibold hover:bg-foreground hover:text-background"
        >
          My purchases
        </Link>
      </div>
    </section>
  );
}

function SellerClosedOrder({ order }: { order: OrderDetail }) {
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-8 text-center">
      <h1 className="font-editorial text-[27px] leading-tight tracking-[-0.03em]">
        {order.status === "refunded" ? "This sale was refunded" : "This sale did not complete"}
      </h1>
      <p className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed text-muted-foreground">
        {order.status === "refunded"
          ? "The buyer was refunded. Nothing further is needed from you."
          : "The buyer's reservation expired, so no payment was taken and your listing is active again."}
      </p>
      <p className="numeric mt-4 text-[11.5px] text-muted-foreground">{order.orderNumber}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          to="/selling"
          className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground"
        >
          Selling dashboard
        </Link>
      </div>
    </section>
  );
}
