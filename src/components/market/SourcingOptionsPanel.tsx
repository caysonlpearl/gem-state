import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getSourcingOptions, type SourcingOption } from "@/lib/shopper.functions";
import {
  ParkVaultCheckoutFlow,
  type SourcingCheckoutTarget,
} from "@/components/market/ParkVaultCheckoutFlow";

function toCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

type LiveRow = { kind: "live"; key: string; option: SourcingOption };

/**
 * "Shoppers available to source" — every way a buyer can have this exact
 * variation sourced by an approved shopper. The choices are calculated from
 * current coverage, capacity and the shopper's service profile. The retired
 * fixed-price request path is deliberately excluded because it created an
 * unpaid order before Stripe Checkout.
 *
 * Nothing here is a stock guarantee, and no shopper contact detail or
 * internal identifier is exposed — only their display name (or a stable
 * pseudonym), fee/price and rating.
 */
export function SourcingOptionsPanel({
  productSlug,
  variantId,
  variantLabel,
  isDemo,
}: {
  productSlug: string;
  variantId: string;
  variantLabel: string;
  isDemo: boolean;
}) {
  const { isSignedIn } = useAuth();
  const fetchOptions = useServerFn(getSourcingOptions);

  const [selected, setSelected] = useState<SourcingOption | null>(null);
  const [checkout, setCheckout] = useState<SourcingCheckoutTarget | null>(null);
  const [maxCost, setMaxCost] = useState("");
  const reported = useRef<string>("");

  const options = useQuery({
    queryKey: ["sourcing-options", variantId],
    queryFn: () => fetchOptions({ data: { variantId } }),
    enabled: !isDemo,
  });
  const liveList = options.data ?? [];
  const isLoading = options.isLoading;
  const isError = options.isError;

  const rows: LiveRow[] = [...liveList]
    .sort((a, b) => a.feeCents - b.feeCents)
    .map((option) => ({ kind: "live", key: option.optionRef, option }));

  useEffect(() => {
    if (isDemo || isLoading || reported.current === variantId) return;
    reported.current = variantId;
    if (rows.length > 0) {
      void trackEvent("sourcing_option_viewed", {
        product_slug: productSlug,
        options: rows.length,
        confidence: liveList[0]?.referenceConfidence ?? "n/a",
      });
      if (liveList.length > 0 && !liveList.some((option) => option.isPriceable)) {
        void trackEvent("price_confirmation_needed", { product_slug: productSlug });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, isLoading, rows.length, productSlug, variantId]);

  /**
   * The buyer pays before the job reaches the shopper: the item estimate, the
   * shopper's service fee, the ParkVault buyer fee and tracked delivery all go
   * through Stripe first.
   */
  const openCheckout = (option: SourcingOption, maxPurchaseCents: number) => {
    if (!Number.isFinite(maxPurchaseCents) || maxPurchaseCents < 100) {
      toast.error("Enter the maximum item cost you approve.");
      return;
    }
    const itemCents =
      option.isPriceable && option.referencePriceCents != null
        ? option.referencePriceCents
        : maxPurchaseCents;
    setCheckout({
      variantId,
      optionRef: option.optionRef,
      maxPurchaseCents,
      itemCents,
      shopperFeeCents: option.feeCents,
      shopperName: option.shopperLabel,
    });
    void trackEvent("sourcing_purchase_started", { product_slug: productSlug });
  };

  if (isDemo) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <h3 className="text-[12.5px] font-semibold tracking-tight">Shoppers available</h3>
        <span className="numeric text-[11.5px] text-muted-foreground">
          {isLoading ? "Loading…" : `${rows.length} shopper${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          You pay up front; the job only reaches a shopper once payment succeeds. Pay less in park
          and the difference is refunded, and if the item can&apos;t be found you&apos;re refunded
          in full. No negotiation or messaging.
        </p>

        {isError && (
          <p className="mt-3 text-[12.5px] font-medium text-destructive">
            Couldn&apos;t load sourcing offers right now — this is a loading problem, not proof
            there are none.{" "}
            <button
              type="button"
              onClick={() => {
                void options.refetch();
              }}
              className="underline underline-offset-2"
            >
              Try again
            </button>
          </p>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <p className="mt-3 text-[12.5px] font-medium text-muted-foreground">
            No shoppers are currently available to source this variation
          </p>
        )}

        {rows.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {rows.map((row) => (
              <LiveOptionRow
                key={row.key}
                option={row.option}
                isSignedIn={isSignedIn}
                productSlug={productSlug}
                selected={selected}
                maxCost={maxCost}
                setMaxCost={setMaxCost}
                onSelect={(option) => {
                  setSelected(option);
                  setMaxCost(
                    option.isPriceable && option.referencePriceCents != null
                      ? (option.referencePriceCents / 100).toFixed(2)
                      : "",
                  );
                  void trackEvent("sourcing_option_selected", { product_slug: productSlug });
                }}
                onCancel={() => setSelected(null)}
                maxCostCents={toCents(maxCost)}
                onStartCheckout={openCheckout}
              />
            ))}
          </ul>
        )}
      </div>

      {checkout ? (
        <ParkVaultCheckoutFlow
          mode="sourcing"
          amountCents={checkout.itemCents + checkout.shopperFeeCents}
          sourcing={checkout}
          onClose={() => setCheckout(null)}
        />
      ) : null}
    </div>
  );
}

function ShopperName({
  label,
  avgRating,
  reviewCount,
  avatarUrl,
  profileSlug,
}: {
  label: string;
  avgRating: number | null;
  reviewCount: number;
  avatarUrl?: string | null;
  profileSlug?: string | null;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || "S";
  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      loading="lazy"
      className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold text-muted-foreground"
    >
      {initial}
    </span>
  );

  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold">
      {profileSlug ? (
        <Link to="/shoppers/$slug" params={{ slug: profileSlug }} aria-label={`${label} profile`}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <span>
        {label}
        {reviewCount > 0 && (
          <span className="numeric ml-2 text-[11.5px] font-normal text-muted-foreground">
            {avgRating?.toFixed(1)}★ ({reviewCount})
          </span>
        )}
      </span>
    </span>
  );
}

function LiveOptionRow({
  option,
  isSignedIn,
  productSlug: _productSlug,
  selected,
  maxCost,
  setMaxCost,
  onSelect,
  onCancel,
  maxCostCents,
  onStartCheckout,
}: {
  option: SourcingOption;
  isSignedIn: boolean;
  productSlug: string;
  selected: SourcingOption | null;
  maxCost: string;
  setMaxCost: (value: string) => void;
  onSelect: (option: SourcingOption) => void;
  onCancel: () => void;
  maxCostCents: number;
  onStartCheckout: (option: SourcingOption, maxPurchaseCents: number) => void;
}) {
  return (
    <li className="rounded-md border border-border px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ShopperName
          label={option.shopperLabel}
          avgRating={option.avgRating}
          reviewCount={option.reviewCount}
          avatarUrl={option.avatarUrl}
          profileSlug={option.profileSlug}
        />

        <span className="numeric text-[12.5px] font-medium">
          {formatUsd(option.feeCents)} shopper earnings
          {option.isLiveNow && (
            <span className="ml-2 rounded-sm bg-nav-accent/10 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-nav-accent">
              Live in the parks now
            </span>
          )}
        </span>
      </div>
      <div className="mt-2">
        {isSignedIn ? (
          <button
            type="button"
            onClick={() => onSelect(option)}
            className="h-8 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
          >
            Select this shopper
          </button>
        ) : (
          <Link
            to={brand.urls.auth}
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-[12.5px] font-medium"
          >
            Sign in to select a shopper
          </Link>
        )}
      </div>

      {selected?.optionRef === option.optionRef && (
        <form
          className="hairline-t mt-3 space-y-2.5 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onStartCheckout(option, maxCostCents);
          }}
        >
          <div>
            <label htmlFor={`max-${option.optionRef}`} className="text-[12px] font-medium">
              Maximum purchase cost you approve (USD)
            </label>
            <input
              id={`max-${option.optionRef}`}
              inputMode="decimal"
              value={maxCost}
              onChange={(event) => setMaxCost(event.target.value)}
              placeholder={option.isPriceable ? undefined : "e.g. 55.00"}
              className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-48"
            />
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              {option.isPriceable
                ? "The shopper may not buy above this amount."
                : "No park price on record — enter what you're willing to pay for the item."}{" "}
              You pay this estimate plus the shopper&apos;s earnings, ParkVault sourcing &amp;
              protection and tracked delivery now, so your shopper can start. Pay less in park and
              the difference is refunded; if the item can&apos;t be found you&apos;re refunded in
              full.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
            >
              Continue to secure checkout
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
