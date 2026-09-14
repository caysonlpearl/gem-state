import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LockKey, ShieldCheck, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { estimateSourcingPlatformFeeCents, formatUsd } from "@/config/fees";
import { quoteTotals } from "@/lib/market.functions";
import {
  getCheckoutShippingRates,
  getSourcingShippingRates,
  startSourcingCheckout,
  startCounterofferCheckout,
  startExactListingCheckout,
  startListingOfferCheckout,
  type CheckoutAddress,
  type CheckoutShippingRate,
} from "@/lib/stripe-marketplace.functions";

type Mode = "purchase" | "offer" | "counter" | "sourcing";

/** Extra detail a Park Shopper job needs; unused by listing checkouts. */
export type SourcingCheckoutTarget = {
  variantId: string;
  optionRef: string;
  /** The ceiling the buyer approves for the item itself. */
  maxPurchaseCents: number;
  /** What the platform charges for the item now (the park reference price when known). */
  itemCents: number;
  shopperFeeCents: number;
  shopperName: string;
};

export function ParkVaultCheckoutFlow({
  askId,
  amountCents,
  mode,
  offerId,
  sourcing,
  onClose,
}: {
  askId?: string;
  amountCents: number;
  mode: Mode;
  offerId?: string;
  sourcing?: SourcingCheckoutTarget;
  onClose: () => void;
}) {
  const fetchTotals = useServerFn(quoteTotals);
  const fetchRates = useServerFn(getCheckoutShippingRates);
  const startPurchase = useServerFn(startExactListingCheckout);
  const startOffer = useServerFn(startListingOfferCheckout);
  const startCounter = useServerFn(startCounterofferCheckout);
  const fetchSourcingRates = useServerFn(getSourcingShippingRates);
  const startSourcing = useServerFn(startSourcingCheckout);
  const quoteRates = (nextAddress: CheckoutAddress) =>
    mode === "sourcing" && sourcing
      ? fetchSourcingRates({
          data: {
            variantId: sourcing.variantId,
            optionRef: sourcing.optionRef,
            address: nextAddress,
          },
        })
      : fetchRates({ data: { askId: askId!, address: nextAddress } });
  const [address, setAddress] = useState<CheckoutAddress>({
    recipientName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  });
  const [quote, setQuote] = useState<{ quoteId: string; rates: CheckoutShippingRate[] } | null>(
    null,
  );
  const [selectedRateId, setSelectedRateId] = useState("");

  const totals = useQuery({
    queryKey: ["checkout-fee-preview", amountCents],
    queryFn: () => fetchTotals({ data: { merchandiseCents: amountCents } }),
  });
  const buyerFeeCents =
    mode === "sourcing"
      ? estimateSourcingPlatformFeeCents(amountCents)
      : Number(totals.data?.["buyer_fee_cents"] ?? 0);
  const selectedRate = useMemo(
    () => quote?.rates.find((rate) => rate.id === selectedRateId) ?? null,
    [quote, selectedRateId],
  );

  const missingField = useMemo(() => {
    const checks: Array<[string, string]> = [
      [address.recipientName, "full name"],
      [address.line1, "street address"],
      [address.city, "city"],
      [address.region, "state"],
      [address.postalCode, "ZIP code"],
    ];
    return checks.find(([value]) => value.trim().length === 0)?.[1] ?? null;
  }, [address]);
  const addressComplete = missingField === null;

  const ratesMutation = useMutation({
    mutationFn: () => quoteRates(address),
    onSuccess: (result) => {
      setQuote(result);
      setSelectedRateId(result.rates[0]?.id ?? "");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not load delivery rates."),
  });
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      let checkoutQuote = quote;
      let checkoutRateId = selectedRateId;
      if (!checkoutQuote || !checkoutRateId) {
        checkoutQuote = await quoteRates(address);
        checkoutRateId = checkoutQuote.rates[0]?.id ?? "";
        if (!checkoutRateId) throw new Error("No tracked delivery method is available.");
        setQuote(checkoutQuote);
        setSelectedRateId(checkoutRateId);
      }
      if (mode === "sourcing") {
        if (!sourcing) throw new Error("That Park Shopper is unavailable.");
        return startSourcing({
          data: {
            variantId: sourcing.variantId,
            optionRef: sourcing.optionRef,
            maxPurchaseCents: sourcing.maxPurchaseCents,
            quoteId: checkoutQuote.quoteId,
            rateId: checkoutRateId,
          },
        });
      }
      if (mode === "offer") {
        return startOffer({
          data: {
            askId: askId!,
            amountCents,
            quoteId: checkoutQuote.quoteId,
            rateId: checkoutRateId,
          },
        });
      }
      if (mode === "counter") {
        if (!offerId) throw new Error("That counteroffer is unavailable.");
        return startCounter({
          data: { offerId, quoteId: checkoutQuote.quoteId, rateId: checkoutRateId },
        });
      }
      return startPurchase({
        data: { askId: askId!, quoteId: checkoutQuote.quoteId, rateId: checkoutRateId },
      });
    },
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : `Could not open ${brand.name} Checkout.`,
      ),
  });
  const checkoutError = checkoutMutation.error
    ? checkoutMutation.error instanceof Error
      ? checkoutMutation.error.message
      : `Could not open ${brand.name} Checkout.`
    : null;

  const update = (key: keyof CheckoutAddress, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }));
    setQuote(null);
    setSelectedRateId("");
  };
  const beforeTax = amountCents + buyerFeeCents + (selectedRate?.amountCents ?? 0);
  const actionLabel =
    mode === "offer"
      ? "Authorize and send offer"
      : mode === "counter"
        ? "Accept counter and pay"
        : mode === "sourcing"
          ? "Pay and send this job to your shopper"
          : "Continue to secure checkout";

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-foreground/70 px-3 py-5 backdrop-blur-[2px]">
      <section className="relative mx-auto w-full max-w-[560px] bg-background p-5 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checkout"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"
        >
          <X size={18} />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-primary">
          {brand.name} Checkout
        </p>
        <h3 className="mt-2 pr-10 font-editorial text-[29px] leading-none tracking-[-0.03em]">
          {mode === "offer"
            ? "Secure your offer"
            : mode === "counter"
              ? "Accept the counteroffer"
              : mode === "sourcing"
                ? "Hire your Park Shopper"
                : "Purchase this exact item"}
        </h3>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field
            label="Full name"
            value={address.recipientName}
            onChange={(v) => update("recipientName", v)}
          />
          <Field
            label="Street address"
            value={address.line1}
            onChange={(v) => update("line1", v)}
          />
          <Field
            label="Apartment, suite (optional)"
            value={address.line2 ?? ""}
            onChange={(v) => update("line2", v)}
          />
          <Field label="City" value={address.city} onChange={(v) => update("city", v)} />
          <Field
            label="State"
            value={address.region}
            onChange={(v) => update("region", v)}
            maxLength={2}
          />
          <Field
            label="ZIP code"
            value={address.postalCode}
            onChange={(v) => update("postalCode", v)}
          />
        </div>
        <button
          type="button"
          disabled={ratesMutation.isPending || !addressComplete}
          onClick={() => ratesMutation.mutate()}
          className="mt-4 h-10 w-full border border-foreground px-4 text-[12px] font-semibold hover:bg-foreground hover:text-background disabled:opacity-50"
        >
          {ratesMutation.isPending
            ? "Finding delivery rates…"
            : quote
              ? "Refresh delivery rates"
              : "Compare delivery options"}
        </button>
        {!addressComplete ? (
          <p role="status" className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
            Enter your {missingField} to price tracked delivery.
          </p>
        ) : !quote ? (
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
            Optional. Continue now and {brand.name} will select the lowest tracked delivery option,
            or compare the available services first.
          </p>
        ) : null}

        {quote ? (
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-[11.5px] font-semibold">Delivery method</legend>
            {quote.rates.map((rate) => (
              <label
                key={rate.id}
                className="flex cursor-pointer items-center justify-between gap-3 border border-border p-3 text-[12px] has-[:checked]:border-foreground"
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="shipping-rate"
                    value={rate.id}
                    checked={selectedRateId === rate.id}
                    onChange={() => setSelectedRateId(rate.id)}
                  />
                  <span>
                    <span className="font-medium">
                      {rate.carrier} {rate.service}
                    </span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {rate.estimatedDays
                        ? `About ${rate.estimatedDays} business days`
                        : "Tracked delivery"}
                    </span>
                  </span>
                </span>
                <span className="numeric font-semibold">{formatUsd(rate.amountCents)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <dl className="mt-5 divide-y divide-border border-y border-border text-[12px]">
          {mode === "sourcing" && sourcing ? (
            <>
              <PriceRow label="Item estimate" value={formatUsd(sourcing.itemCents)} />
              <PriceRow
                label={`Earnings for ${sourcing.shopperName}`}
                value={formatUsd(sourcing.shopperFeeCents)}
              />
            </>
          ) : (
            <PriceRow
              label={
                mode === "offer"
                  ? "Your offer"
                  : mode === "counter"
                    ? "Counteroffer"
                    : "Merchandise"
              }
              value={formatUsd(amountCents)}
            />
          )}
          <PriceRow
            label={mode === "sourcing" ? "Sourcing & protection" : "Buyer protection fee"}
            value={totals.isLoading ? "Calculating…" : formatUsd(buyerFeeCents)}
          />
          <PriceRow
            label="Shipping"
            value={selectedRate ? formatUsd(selectedRate.amountCents) : "Selected at checkout"}
          />
          <PriceRow label="Tax" value="Calculated at checkout" />
          <PriceRow label="Total before tax" value={formatUsd(beforeTax)} strong />
        </dl>

        <button
          type="button"
          disabled={
            checkoutMutation.isPending ||
            ratesMutation.isPending ||
            (mode !== "sourcing" && totals.isLoading) ||
            !addressComplete
          }
          onClick={() => checkoutMutation.mutate()}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          <LockKey size={16} weight="fill" />
          {checkoutMutation.isPending ? "Confirming details and opening checkout…" : actionLabel}
        </button>
        {checkoutError ? (
          <p
            role="alert"
            className="mt-3 border border-destructive/30 bg-destructive/5 p-3 text-[11px] leading-relaxed text-destructive"
          >
            {checkoutError}
          </p>
        ) : null}
        <p className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" weight="fill" />
          {mode === "sourcing" && sourcing
            ? `You pay now so ${sourcing.shopperName} can start. If the item costs less in park you are refunded the difference; if it is unavailable you are refunded in full.`
            : mode === "offer"
              ? "Stripe places a temporary authorization on your card. You are charged only if the seller accepts before the authorization expires."
              : `Payment is processed securely by Stripe. ${brand.name} does not release the seller payout until the order is completed.`}
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="text-[11px] font-medium">
      {label}
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full border border-input bg-background px-3 text-[12.5px] outline-none focus:border-foreground"
      />
    </label>
  );
}

function PriceRow({
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
      <dd className={`numeric text-right ${strong ? "font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
