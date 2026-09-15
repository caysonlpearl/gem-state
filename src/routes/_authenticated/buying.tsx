import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import {
  cancelListing,
  getMyListingOffers,
  getMyListings,
  getMyOrders,
  retryListingOfferAuthorizationRelease,
  respondToListingOffer,
} from "@/lib/market.functions";
import { reconcileMyListingOfferCheckouts } from "@/lib/stripe-marketplace.functions";
import { listingStatusLabels, orderStatusLabels, originLabels } from "@/lib/market-labels";
import { ParkVaultCheckoutFlow } from "@/components/market/ParkVaultCheckoutFlow";

export const Route = createFileRoute("/_authenticated/buying")({
  component: BuyingPage,
});

function BuyingPage() {
  const queryClient = useQueryClient();
  const fetchListings = useServerFn(getMyListings);
  const fetchOrders = useServerFn(getMyOrders);
  const cancel = useServerFn(cancelListing);
  const fetchListingOffers = useServerFn(getMyListingOffers);
  const respondToOffer = useServerFn(respondToListingOffer);
  const retryAuthorizationRelease = useServerFn(retryListingOfferAuthorizationRelease);
  const reconcileOfferCheckouts = useServerFn(reconcileMyListingOfferCheckouts);
  const [counterCheckout, setCounterCheckout] = useState<{
    offerId: string;
    askId: string;
    amountCents: number;
  } | null>(null);

  useEffect(() => {
    void trackEvent("page_view", { route: "/buying" });
  }, []);

  useEffect(() => {
    void reconcileOfferCheckouts().then(() => {
      void queryClient.invalidateQueries({ queryKey: ["listing-offers", "buyer"] });
    }).catch(() => {
      // The webhook remains the primary settlement path; a transient
      // reconciliation failure should not interrupt the buyer page.
    });
  }, [reconcileOfferCheckouts, queryClient]);

  const listings = useQuery({ queryKey: ["my-listings"], queryFn: () => fetchListings() });
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: () => fetchOrders() });
  const exactOffers = useQuery({
    queryKey: ["listing-offers", "buyer"],
    queryFn: () => fetchListingOffers({ data: { role: "buyer" } }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancel({ data: { kind: "bid", id } }),
    onSuccess: async () => {
      await trackEvent("bid_cancelled", {});
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Offer cancelled.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not cancel."),
  });
  const offerMutation = useMutation({
    mutationFn: (input: { offerId: string; action: "withdraw" }) => respondToOffer({ data: input }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing-offers", "buyer"] }),
        queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      ]);
      if (result.authorizationReleasePending) {
        toast.warning("Offer withdrawn. Release of your card hold is pending.");
      } else {
        toast.success("Offer withdrawn.");
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update this offer."),
  });
  const releaseMutation = useMutation({
    mutationFn: (offerId: string) => retryAuthorizationRelease({ data: { offerId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["listing-offers", "buyer"] });
      toast.success("Your card hold was released.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not release the card hold."),
  });

  const bids = listings.data?.bids ?? [];
  const buyerOrders = (orders.data ?? []).filter((o) => o.role === "buyer");

  return (
    <div className="mx-auto max-w-[980px] px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Purchases</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Your offers and orders in one place.</p>

      <section className="mt-8">
        <h2 className="text-[13px] font-semibold tracking-tight">Your offers</h2>
        {listings.isLoading && <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>}
        {!listings.isLoading && bids.length === 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            No active offers yet. Open a listing and make an offer on the exact item you want.
          </p>
        )}
        {bids.length > 0 && (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            {bids.map((bid) => (
              <li
                key={bid.id}
                className="hairline-b flex flex-wrap items-center justify-between gap-3 px-4 py-3 last:border-b-0"
              >
                <div>
                  <Link
                    to="/browse"
                    search={{ q: bid.productName }}
                    className="text-[13px] font-medium hover:underline"
                  >
                    {bid.productName}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">
                    {bid.variantLabel} · {listingStatusLabels[bid.status] ?? bid.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="numeric text-[13px] font-semibold">
                    {formatUsd(bid.priceCents)}
                  </span>
                  {bid.status === "active" && (
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(bid.id)}
                      disabled={cancelMutation.isPending}
                      className="inline-flex h-8 items-center rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[13px] font-semibold tracking-tight">Offers on exact listings</h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          These offers apply only to the photographed seller item you opened.
        </p>
        {exactOffers.isLoading ? (
          <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p>
        ) : null}
        {!exactOffers.isLoading && (exactOffers.data ?? []).length === 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">No exact-listing offers yet.</p>
        ) : null}
        {(exactOffers.data ?? []).length ? (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            {(exactOffers.data ?? []).map((offer) => (
              <li
                key={offer.id}
                className="hairline-b flex flex-wrap items-center justify-between gap-3 px-4 py-3 last:border-b-0"
              >
                <div>
                  {offer.askId ? (
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: offer.askId }}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {offer.productName}
                    </Link>
                  ) : (
                    <Link
                      to="/browse"
                      search={{ q: offer.productName }}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {offer.productName}
                    </Link>
                  )}
                  <p className="text-[12px] text-muted-foreground">
                    {offer.variantLabel} · offered {formatUsd(offer.amountCents)} ·{" "}
                    {offer.status.replace(/_/g, " ")}
                  </p>
                  {offer.sellerCounterCents != null ? (
                    <p className="numeric mt-1 text-[12px] font-semibold text-primary">
                      Seller counter {formatUsd(offer.sellerCounterCents)}
                    </p>
                  ) : null}
                  {offer.status === "pending" ? (
                    <dl className="numeric mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[11px] text-muted-foreground">
                      <dt>Buyer protection</dt>
                      <dd className="text-right">{formatUsd(offer.buyerFeeCents)}</dd>
                      <dt>Shipping</dt>
                      <dd className="text-right">{formatUsd(offer.shippingCents)}</dd>
                      <dt>Authorized total</dt>
                      <dd className="text-right font-semibold text-foreground">
                        {formatUsd(offer.buyerTotalCents)}
                      </dd>
                    </dl>
                  ) : null}
                </div>
                {offer.paymentStatus === "cancel_pending" ? (
                  <button
                    type="button"
                    disabled={releaseMutation.isPending}
                    onClick={() => releaseMutation.mutate(offer.id)}
                    className="h-9 border border-input px-3 text-[11.5px] font-medium disabled:opacity-50"
                  >
                    Retry card-hold release
                  </button>
                ) : offer.status === "countered" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCounterCheckout({
                          offerId: offer.id,
                          askId: offer.askId,
                          amountCents: offer.sellerCounterCents ?? offer.amountCents,
                        })
                      }
                      className="h-9 bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Accept counter
                    </button>
                    <button
                      type="button"
                      disabled={offerMutation.isPending}
                      onClick={() =>
                        offerMutation.mutate({ offerId: offer.id, action: "withdraw" })
                      }
                      className="h-9 border border-input px-3 text-[11.5px] font-medium disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  </div>
                ) : offer.status === "pending" ? (
                  <button
                    type="button"
                    disabled={offerMutation.isPending}
                    onClick={() => offerMutation.mutate({ offerId: offer.id, action: "withdraw" })}
                    className="h-9 border border-input px-3 text-[11.5px] font-medium disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {counterCheckout ? (
        <ParkVaultCheckoutFlow
          askId={counterCheckout.askId}
          amountCents={counterCheckout.amountCents}
          mode="counter"
          offerId={counterCheckout.offerId}
          onClose={() => setCounterCheckout(null)}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="text-[13px] font-semibold tracking-tight">Your orders</h2>
        {orders.isLoading && <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>}
        {!orders.isLoading && buyerOrders.length === 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">No orders yet.</p>
        )}
        {buyerOrders.length > 0 && (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            {buyerOrders.map((order) => (
              <li
                key={order.id}
                className="hairline-b flex flex-wrap items-center justify-between gap-3 px-4 py-3 last:border-b-0"
              >
                <div>
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: order.id }}
                    className="text-[13px] font-medium hover:underline"
                  >
                    {order.productName}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">
                    <span className="numeric">{order.orderNumber}</span> · {order.variantLabel} ·{" "}
                    {originLabels[order.origin] ?? order.origin} ·{" "}
                    {orderStatusLabels[order.status] ?? order.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {["delivered", "completed"].includes(order.status) && (
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: order.id }}
                      className="text-[12px] font-semibold text-primary hover:underline"
                    >
                      Rate your seller
                    </Link>
                  )}
                  <span className="numeric text-[13px] font-semibold">
                    {formatUsd(order.totalCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
