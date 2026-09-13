import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getShopperStatus, placeSourcingAsk } from "@/lib/sourcing.functions";

function toCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

/**
 * Shopper-facing: post a fixed-price sourcing offer on one exact variation.
 * The offer itself is listed to buyers in `SourcingOptionsPanel`'s merged
 * "Shoppers available to source" list, alongside live-availability shoppers —
 * this component only handles posting, not display, so there is one buyer-
 * facing list instead of two.
 */
export function SourcingPanel({
  productSlug,
  variantId,
  isDemo,
  retailPriceCents = null,
}: {
  productSlug: string;
  variantId: string;
  variantLabel: string;
  isDemo: boolean;
  /** Prefills the merchandise price field when a retail reference is known. */
  retailPriceCents?: number | null;
}) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getShopperStatus);
  const submitOffer = useServerFn(placeSourcingAsk);

  const [showOfferForm, setShowOfferForm] = useState(false);
  const [merchCost, setMerchCost] = useState(() =>
    retailPriceCents ? (retailPriceCents / 100).toFixed(2) : "",
  );
  const [offerFee, setOfferFee] = useState("");
  const [offerWindow, setOfferWindow] = useState("7");
  const [offerNote, setOfferNote] = useState("");

  const shopper = useQuery({
    queryKey: ["shopper-status"],
    queryFn: () => fetchStatus(),
    enabled: isSignedIn && !isDemo,
  });

  const offerMutation = useMutation({
    mutationFn: () =>
      submitOffer({
        data: {
          variantId,
          priceCents: toCents(merchCost) + toCents(offerFee),
          fulfillmentWindowDays: Number(offerWindow),
          sellerNote: offerNote || null,
        },
      }),
    onSuccess: async () => {
      await trackEvent("sourcing_ask_submitted", { product_slug: productSlug });
      setShowOfferForm(false);
      setOfferFee("");
      setOfferNote("");
      await queryClient.invalidateQueries({ queryKey: ["sourcing-offers", variantId] });
      toast.success(
        "Sourcing offer posted — it now appears in Shoppers available to source above.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not post the offer."),
  });

  const isShopper = shopper.data?.isShopper ?? false;

  if (isDemo || !isSignedIn || !isShopper) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold tracking-tight">Post a sourcing offer</h2>
        <button
          type="button"
          onClick={() => setShowOfferForm((value) => !value)}
          className="inline-flex h-8 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
        >
          {showOfferForm ? "Close" : "Post an offer"}
        </button>
      </div>

      {showOfferForm && (
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            offerMutation.mutate();
          }}
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            A one-off fixed price for this exact variation, regardless of your live availability.
            Requesting it matches automatically — there is no negotiation or messaging.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="offer-merch" className="text-[12px] font-medium">
                Merchandise price (USD)
              </label>
              <input
                id="offer-merch"
                inputMode="decimal"
                value={merchCost}
                onChange={(event) => setMerchCost(event.target.value)}
                placeholder="55.00"
                className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="offer-fee" className="text-[12px] font-medium">
                Your fee (USD)
              </label>
              <input
                id="offer-fee"
                inputMode="decimal"
                value={offerFee}
                onChange={(event) => setOfferFee(event.target.value)}
                placeholder="10.00"
                className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="offer-window" className="text-[12px] font-medium">
                Fulfillment window (days)
              </label>
              <input
                id="offer-window"
                inputMode="numeric"
                value={offerWindow}
                onChange={(event) => setOfferWindow(event.target.value)}
                className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
          {(toCents(merchCost) > 0 || toCents(offerFee) > 0) && (
            <p className="numeric text-[12.5px] font-medium">
              Buyer sees: {formatUsd(toCents(merchCost) + toCents(offerFee))}
            </p>
          )}
          <div>
            <label htmlFor="offer-note" className="text-[12px] font-medium">
              Note for buyers (optional)
            </label>
            <textarea
              id="offer-note"
              value={offerNote}
              onChange={(event) => setOfferNote(event.target.value.slice(0, 500))}
              rows={2}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Enter what you expect to pay for the item and your own fee separately — ParkVault adds
            them together for the buyer.
          </p>
          <button
            type="submit"
            disabled={offerMutation.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
          >
            {offerMutation.isPending ? "Posting…" : "Post sourcing offer"}
          </button>
        </form>
      )}
    </div>
  );
}
