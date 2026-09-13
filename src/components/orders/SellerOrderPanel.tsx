import { Link } from "@tanstack/react-router";
import { Package } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import type { OrderDetail } from "@/lib/market.functions";
import { sellerStatusLabels } from "@/lib/market-labels";

/**
 * Seller-facing header + sale breakdown.
 *
 * Deliberately excludes operator vocabulary (fee-schedule labels, payment
 * authorization state, raw status events) and never shows the buyer's address
 * before payment is confirmed.
 */
export function SellerOrderPanel({
  order,
  headline,
  message,
}: {
  order: OrderDetail;
  headline: string;
  message: string;
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-border bg-primary px-6 py-8 text-center text-primary-foreground">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
          {sellerStatusLabels[order.status] ?? "Your sale"}
        </p>
        <h1 className="mt-2 font-editorial text-[30px] leading-[1.08] tracking-[-0.03em] sm:text-[36px]">
          {headline}
        </h1>
        <p className="mx-auto mt-2 max-w-[440px] text-[12.5px] leading-relaxed opacity-85">
          {message}
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
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="hairline-b px-4 py-3">
          <h2 className="text-[13px] font-semibold tracking-tight">Your sale</h2>
        </div>
        <dl className="divide-y divide-border px-4 py-1 text-[12.5px]">
          <SaleRow label="Item" value={formatUsd(order.merchandiseCents)} />
          <SaleRow label="Seller fee" value={`-${formatUsd(order.sellerFeeCents)}`} />
          <SaleRow label="Shipping" value={formatUsd(order.shippingCents)} />
          <SaleRow label="Your payout" value={formatUsd(order.payoutCents)} strong />
        </dl>
      </section>
    </div>
  );
}

function SaleRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`numeric ${strong ? "font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
