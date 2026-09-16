import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle, Package, Receipt, Truck } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import type { OrderDetail } from "@/lib/market.functions";
import { getOrderOperations } from "@/lib/pilot.functions";

/**
 * Buyer-facing receipt.
 *
 * Deliberately excludes operator vocabulary (fee-schedule labels, payment
 * authorization state, payout policy, raw status events). Every claim here is
 * one the order record actually supports.
 */
export function BuyerOrderReceipt({ order }: { order: OrderDetail }) {
  const fetchOps = useServerFn(getOrderOperations);
  const [showFees, setShowFees] = useState(false);
  const ops = useQuery({
    queryKey: ["order-ops", order.id],
    queryFn: () => fetchOps({ data: { orderId: order.id } }),
  });

  const shipment = ops.data?.shipment ?? null;
  const address = ops.data?.address ?? null;
  const feesAndShipping = order.buyerFeeCents + order.shippingCents + order.taxCents;
  const shipped = Boolean(shipment?.shippedAt);
  const delivered = order.status === "delivered" || order.status === "completed";
  const isSourcing = order.origin === "sourcing_shopper";
  const shopperEarningsCents = isSourcing ? Number(order.feeSnapshot["shopper_fee_cents"] ?? 0) : 0;
  const itemCents = Math.max(0, order.merchandiseCents - shopperEarningsCents);

  return (
    <div className="space-y-5">
      <section className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 overflow-hidden rounded-xl border border-border bg-primary px-6 py-9 text-center text-primary-foreground duration-500">
        <CheckCircle size={44} weight="fill" className="mx-auto opacity-95" />
        <h1 className="mt-3 font-editorial text-[34px] leading-[1.05] tracking-[-0.03em] sm:text-[42px]">
          Order confirmed
        </h1>
        <p className="mt-2 text-[13px] opacity-85">
          Thank you — your payment went through and the seller has been notified.
        </p>
        <p className="numeric mt-4 inline-block rounded-full bg-primary-foreground/12 px-3 py-1 text-[11.5px] tracking-[0.08em]">
          {order.orderNumber}
        </p>
      </section>

      <section className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
          {order.imageSrc ? (
            <img
              src={order.imageSrc}
              alt={order.imageAlt}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <Package size={26} className="text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <Link
            to="/products/$slug"
            params={{ slug: order.productSlug }}
            className="text-[15px] font-semibold leading-snug tracking-tight hover:underline"
          >
            {order.productName}
          </Link>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{order.variantLabel}</p>
          <p className="numeric mt-1 text-[13.5px] font-semibold">
            {formatUsd(order.merchandiseCents)}
          </p>
        </div>
      </section>

      <Card icon={<Truck size={16} />} title={delivered ? "Delivered" : "Arriving"}>
        {shipment?.trackingNumber ? (
          <>
            <p className="font-medium">
              {shipment.carrier} · {shipment.trackingNumber}
            </p>
            {shipment.trackingUrl ? (
              <a
                href={shipment.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex h-9 items-center border border-foreground px-3 text-[12px] font-semibold hover:bg-foreground hover:text-background"
              >
                Track package
              </a>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            Tracking appears here as soon as the seller ships your item.
          </p>
        )}
        {address ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Shipping to {address.recipientName} · {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.region}{" "}
            {address.postalCode}
          </p>
        ) : null}
      </Card>

      <Card icon={<Receipt size={16} />} title="What you paid">
        <dl className="divide-y divide-border">
          <PayRow label="Item" value={formatUsd(isSourcing ? itemCents : order.merchandiseCents)} />
          {isSourcing ? (
            <>
              <PayRow label="Park Shopper earnings" value={formatUsd(shopperEarningsCents)} />
              <PayRow
                label="ParkVault sourcing & protection"
                value={formatUsd(order.buyerFeeCents)}
              />
              <PayRow label="Shipping" value={formatUsd(order.shippingCents)} />
              <PayRow label="Tax" value={formatUsd(order.taxCents)} />
            </>
          ) : (
            <PayRow label="Buyer protection & shipping" value={formatUsd(feesAndShipping)} />
          )}
          <PayRow label="Total" value={formatUsd(order.totalCents)} strong />
        </dl>
        {!isSourcing && (
          <button
            type="button"
            onClick={() => setShowFees((open) => !open)}
            className="mt-2 text-[11.5px] text-muted-foreground underline hover:text-foreground"
            aria-expanded={showFees}
          >
            {showFees ? "Hide fee details" : "Fee details"}
          </button>
        )}
        {!isSourcing && showFees ? (
          <dl className="mt-2 divide-y divide-border border-t border-border">
            <PayRow label="Buyer protection fee" value={formatUsd(order.buyerFeeCents)} />
            <PayRow label="Shipping" value={formatUsd(order.shippingCents)} />
            <PayRow label="Tax" value={formatUsd(order.taxCents)} />
          </dl>
        ) : null}
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Paid securely by card through Stripe.
        </p>
      </Card>

      <Card title="What happens next">
        <ol className="space-y-2.5">
          <Step index={1} done label="Payment confirmed" />
          <Step
            index={2}
            done={shipped}
            label={
              isSourcing
                ? "Your Park Shopper ships the purchased item"
                : "Seller ships the exact photographed item"
            }
          />
          <Step index={3} done={delivered} label="You confirm the item arrived" />
        </ol>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/buying"
          className="inline-flex h-11 items-center bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground"
        >
          View my purchases
        </Link>
        <Link
          to="/browse"
          className="inline-flex h-11 items-center border border-foreground px-5 text-[12.5px] font-semibold hover:bg-foreground hover:text-background"
        >
          Keep browsing
        </Link>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="hairline-b flex items-center gap-2 px-4 py-3">
        {icon ? <span className="text-primary">{icon}</span> : null}
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="px-4 py-3 text-[12.5px] leading-relaxed">{children}</div>
    </section>
  );
}

function PayRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`numeric ${strong ? "font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function Step({ index, label, done }: { index: number; label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
        }`}
        aria-hidden
      >
        {done ? "✓" : index}
      </span>
      <span className={done ? "font-medium" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
