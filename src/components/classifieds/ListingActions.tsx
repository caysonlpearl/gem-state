import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { estimateBuyerTotalCents, formatUsd } from "@/config/fees";
import { useAuth } from "@/hooks/useAuth";
import { buyNow, placeBid, getMarketSettings } from "@/lib/market.functions";
import { ParkVaultCheckoutFlow } from "@/components/market/ParkVaultCheckoutFlow";
import type { ClassifiedDetail } from "@/lib/classifieds.functions";

function toCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

/**
 * Buy / offer controls for one individual classified listing. The listing is
 * the unit of sale, so checkout targets this exact listing id rather than the
 * cheapest listing of a shared catalog product.
 */
export function ListingActions({ listing }: { listing: ClassifiedDetail }) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const fetchSettings = useServerFn(getMarketSettings);
  const runBuyNow = useServerFn(buyNow);
  const submitOffer = useServerFn(placeBid);

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["market-settings"],
    queryFn: () => fetchSettings({}),
    staleTime: 5 * 60 * 1000,
  });
  const liveCheckout = settingsQuery.data?.liveCheckoutEnabled ?? false;

  const buyMutation = useMutation({
    mutationFn: () => runBuyNow({ data: { variantId: listing.variantId } }),
    onSuccess: async (result) => {
      toast.success("Order created.");
      await navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Purchase request failed."),
  });

  const offerMutation = useMutation({
    mutationFn: () =>
      submitOffer({ data: { variantId: listing.variantId, priceCents: toCents(offerPrice) } }),
    onSuccess: () => {
      setOfferPrice("");
      setOfferOpen(false);
      toast.success("Offer sent to the seller.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send your offer."),
  });

  const estimate = estimateBuyerTotalCents(listing.priceCents);

  return (
    <div className="rounded-md border border-foreground bg-card">
      <div className="px-4 pt-4">
        <p className="numeric text-[30px] font-bold leading-none">
          {formatUsd(listing.priceCents)}
        </p>
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          {formatUsd(estimate.totalCents)} estimated total with fees and shipping calculated at
          checkout.
        </p>

        <div className="mt-4 space-y-2">
          {isSignedIn ? (
            <>
              <button
                type="button"
                disabled={buyMutation.isPending}
                onClick={() => {
                  if (liveCheckout) setCheckoutOpen(true);
                  else buyMutation.mutate();
                }}
                className="h-12 w-full rounded-md bg-nav-accent text-[14.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                {buyMutation.isPending ? "Starting…" : "Buy now"}
              </button>
              <button
                type="button"
                onClick={() => setOfferOpen((open) => !open)}
                className="h-11 w-full rounded-md border border-foreground text-[13.5px] font-semibold"
              >
                Make an offer
              </button>
            </>
          ) : (
            <Link
              to={brand.urls.auth}
              className="flex h-12 w-full items-center justify-center rounded-md bg-nav-accent text-[14.5px] font-semibold text-primary-foreground"
            >
              Sign in to buy or make an offer
            </Link>
          )}
        </div>
      </div>

      {offerOpen && isSignedIn && (
        <form
          className="mt-4 space-y-3 border-t border-border px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            offerMutation.mutate();
          }}
        >
          <label htmlFor="offer-price" className="block text-[12px] font-medium">
            Your offer (USD)
          </label>
          <input
            id="offer-price"
            inputMode="decimal"
            value={offerPrice}
            onChange={(event) => setOfferPrice(event.target.value)}
            placeholder="8500"
            className="numeric h-10 w-full max-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
          />
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            The seller can accept or decline. If it is accepted you complete payment at checkout,
            where totals are recalculated on the server.
          </p>
          <button
            type="submit"
            disabled={offerMutation.isPending}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {offerMutation.isPending ? "Sending…" : "Send offer"}
          </button>
        </form>
      )}

      <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        {brand.legal.checkoutNotice}
      </p>

      {checkoutOpen ? (
        <ParkVaultCheckoutFlow
          mode="purchase"
          askId={listing.id}
          amountCents={listing.priceCents}
          onClose={() => setCheckoutOpen(false)}
        />
      ) : null}
    </div>
  );
}
