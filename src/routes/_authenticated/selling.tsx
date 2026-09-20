import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, Star } from "@phosphor-icons/react";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getSellerListingInquiries } from "@/lib/classified-inquiry.functions";
import {
  cancelListing,
  getMyListingOffers,
  getMyListings,
  getMyOrders,
  retryListingOfferAuthorizationRelease,
  respondToListingOffer,
  sellNow,
} from "@/lib/market.functions";
import {
  getSellerDashboardSummary,
  getMyMissingListingRequests,
  getSellerSetup,
  relistSellerListing,
} from "@/lib/seller.functions";
import { listingStatusLabels, originLabels, sellerStatusLabels } from "@/lib/market-labels";
import { acceptSecuredListingOffer } from "@/lib/stripe-marketplace.functions";

export const Route = createFileRoute("/_authenticated/selling")({ component: SellingPage });

const SOURCING_ORIGINS = ["sourcing_shopper", "sourcing_ask", "sourcing_quote"] as const;
/** Order states where the buyer has paid (or the sale is settled afterwards). */
const SOLD_STATUSES = [
  "authorized",
  "paid",
  "payment_captured",
  "sourcing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
  "disputed",
  "refunded",
];
/** Sales still needing the seller to ship. */
const SHIP_STATUSES = ["authorized", "paid", "payment_captured", "ready_to_ship"];
/** Checkout started but not paid — never counted as a sale. */
const RESERVED_STATUSES = ["inquiry", "awaiting_payment", "awaiting_authorization"];

type ListingTab = "active" | "pending" | "sold" | "removed";
const listingTabLabels: Record<ListingTab, string> = {
  active: "Active",
  pending: "Awaiting approval",
  sold: "Sold",
  removed: "Removed",
};

function SellingPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchListings = useServerFn(getMyListings);
  const fetchOrders = useServerFn(getMyOrders);
  const cancel = useServerFn(cancelListing);
  const fetchSellerSetup = useServerFn(getSellerSetup);
  const fetchSummary = useServerFn(getSellerDashboardSummary);
  const relist = useServerFn(relistSellerListing);
  const acceptHighestBid = useServerFn(sellNow);
  const fetchListingOffers = useServerFn(getMyListingOffers);
  const respondToOffer = useServerFn(respondToListingOffer);
  const retryAuthorizationRelease = useServerFn(retryListingOfferAuthorizationRelease);
  const acceptSecuredOffer = useServerFn(acceptSecuredListingOffer);
  const fetchMissingRequests = useServerFn(getMyMissingListingRequests);
  const fetchListingInquiries = useServerFn(getSellerListingInquiries);
  const [counterPrices, setCounterPrices] = useState<Record<string, string>>({});
  const [listingTab, setListingTab] = useState<ListingTab>("active");

  useEffect(() => {
    void trackEvent("page_view", { route: "/selling" });
  }, []);

  const sellerSetup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSellerSetup() });
  const profileReady = Boolean(sellerSetup.data?.exists && sellerSetup.data?.termsAccepted);
  const listings = useQuery({
    queryKey: ["my-listings"],
    queryFn: () => fetchListings(),
    enabled: profileReady,
  });
  const orders = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
    enabled: profileReady,
  });
  const summary = useQuery({
    queryKey: ["seller-dashboard-summary"],
    queryFn: () => fetchSummary(),
    enabled: profileReady,
  });
  const listingOffers = useQuery({
    queryKey: ["listing-offers", "seller"],
    queryFn: () => fetchListingOffers({ data: { role: "seller" } }),
    enabled: profileReady,
  });
  const missingRequests = useQuery({
    queryKey: ["my-missing-listing-requests"],
    queryFn: () => fetchMissingRequests(),
    enabled: profileReady,
  });
  const listingInquiries = useQuery({
    queryKey: ["seller-listing-inquiries"],
    queryFn: () => fetchListingInquiries(),
    enabled: profileReady,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancel({ data: { kind: "ask", id } }),
    onSuccess: async () => {
      await trackEvent("ask_cancelled", {});
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Listing taken down.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not cancel."),
  });
  const relistMutation = useMutation({
    mutationFn: (listingId: string) => relist({ data: { listingId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Listing resubmitted for Gem State review.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not relist."),
  });
  const acceptMutation = useMutation({
    mutationFn: (variantId: string) => acceptHighestBid({ data: { variantId } }),
    onSuccess: async ({ orderId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      ]);
      toast.success("Best offer matched. Review the order before shipping.");
      await navigate({ to: "/orders/$orderId", params: { orderId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not accept this offer."),
  });
  const offerMutation = useMutation({
    mutationFn: async (input: { offerId: string; action: "accept" | "counter" | "decline" }) => {
      if (input.action === "accept") {
        return {
          ...(await acceptSecuredOffer({ data: { offerId: input.offerId } })),
          authorizationReleasePending: false,
        };
      }
      return respondToOffer({
        data: {
          ...input,
          counterCents:
            input.action === "counter"
              ? Math.round(
                  Number((counterPrices[input.offerId] ?? "").replace(/[^0-9.]/g, "")) * 100,
                )
              : null,
        },
      });
    },
    onSuccess: async (result) => {
      const { orderId } = result;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing-offers", "seller"] }),
        queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
        queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      ]);
      if (orderId) {
        toast.success("Payment captured. The order is ready for fulfillment.");
        await navigate({ to: "/orders/$orderId", params: { orderId } });
      } else {
        if ("authorizationReleasePending" in result && result.authorizationReleasePending) {
          toast.warning("Offer saved. Release of the buyer's previous card hold is pending.");
        } else {
          toast.success("Offer updated.");
        }
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update this offer."),
  });
  const releaseMutation = useMutation({
    mutationFn: (offerId: string) => retryAuthorizationRelease({ data: { offerId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["listing-offers", "seller"] });
      toast.success("The buyer's card hold was released.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not release the card hold."),
  });

  if (sellerSetup.isLoading) {
    return (
      <main className="mx-auto max-w-[980px] px-4 py-16 sm:px-8">
        <p className="text-[13px] text-muted-foreground">Loading Seller Center…</p>
      </main>
    );
  }
  if (!profileReady) {
    return (
      <main className="mx-auto max-w-[1080px] px-4 py-12 sm:px-8">
        <section className="grid gap-8 border border-border bg-card p-6 sm:p-9 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              Seller center
            </p>
            <h1 className="mt-2 font-editorial text-[46px] font-normal leading-none tracking-[-0.04em]">
              Become a Gem State seller
            </h1>
            <p className="mt-4 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
              Create your public seller profile, add your private return address, connect verified
              payouts and then submit your first exact-item listing for review.
            </p>
            <Link
              to="/seller-setup"
              className="mt-6 inline-flex h-12 items-center gap-2 bg-primary px-5 text-[13px] font-semibold text-primary-foreground"
            >
              Start seller setup <ArrowRight size={16} />
            </Link>
          </div>
          <ol className="space-y-4 border-l border-border pl-6">
            <OnboardingStep number="1" text="Seller profile and private shipping information" />
            <OnboardingStep
              number="2"
              text="Government ID, tax and payout account through Stripe"
            />
            <OnboardingStep number="3" text="Create your first listing with exact-item photos" />
          </ol>
        </section>
      </main>
    );
  }

  const asks = listings.data?.asks ?? [];
  const allSellerOrders = (orders.data ?? []).filter((order) => order.role === "seller");
  const storeOrders = allSellerOrders.filter(
    (order) => !SOURCING_ORIGINS.includes(order.origin as (typeof SOURCING_ORIGINS)[number]),
  );

  /** Sales that actually reached payment or beyond — the only rows that count as a sale. */
  const soldOrders = storeOrders.filter((order) => SOLD_STATUSES.includes(order.status));
  /** In-progress checkouts: show only the newest live reservation per listing. */
  const reservedOrders = (() => {
    const seen = new Set<string>();
    return storeOrders
      .filter((order) => RESERVED_STATUSES.includes(order.status))
      .filter((order) => {
        const key = `${order.productSlug}::${order.variantLabel}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })();
  const salesToShip = soldOrders.filter((order) => SHIP_STATUSES.includes(order.status));

  const activeAsks = asks.filter((ask) => ask.status === "active" && ask.approvedAt);
  const heldRequests = (missingRequests.data ?? []).filter(
    (request) => request.requestStatus === "pending",
  );
  const pendingAsks = asks.filter((ask) => ask.status === "active" && !ask.approvedAt);
  const soldAsks = asks.filter((ask) => ask.status === "matched");
  const removedAsks = asks.filter((ask) => ask.status === "cancelled" || ask.status === "expired");
  const tabCounts: Record<ListingTab, number> = {
    active: activeAsks.length,
    pending: pendingAsks.length + heldRequests.length,
    sold: soldAsks.length,
    removed: removedAsks.length,
  };
  const tabListings =
    listingTab === "active"
      ? activeAsks
      : listingTab === "pending"
        ? pendingAsks
        : listingTab === "sold"
          ? soldAsks
          : removedAsks;

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-10 sm:px-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Seller center
        </p>
        <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
          Seller dashboard
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Listings, buyer inquiries, moderation status and seller tools in one place.
        </p>
      </div>
      <SellerCenterNav storefrontSlug={sellerSetup.data?.slug} />

      <section className="mt-7 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-3">
        <Metric label="Active listings" value={String(activeAsks.length)} />
        <Metric
          label="Awaiting approval"
          value={String(pendingAsks.length + heldRequests.length)}
        />
        <Metric label="Buyer inquiries" value={String(listingInquiries.data?.length ?? 0)} />
      </section>

      <section id="listings" className="mt-9 scroll-mt-28">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-[14px] font-semibold">Your listings</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Edit details, accept offers, take down or relist.
            </p>
          </div>
          <Link
            to="/create-listing"
            className="inline-flex h-9 items-center bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            Create listing
          </Link>
        </div>

        <div
          role="tablist"
          aria-label="Listing status"
          className="mt-3 flex flex-wrap gap-2 border-b border-border pb-3"
        >
          {(Object.keys(listingTabLabels) as ListingTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={listingTab === tab}
              onClick={() => setListingTab(tab)}
              className={`h-9 border px-3 text-[12px] font-medium transition-colors ${
                listingTab === tab
                  ? "border-foreground bg-foreground text-background"
                  : "border-input hover:bg-secondary"
              }`}
            >
              {listingTabLabels[tab]} <span className="numeric opacity-70">{tabCounts[tab]}</span>
            </button>
          ))}
        </div>

        {listings.isLoading ? (
          <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p>
        ) : null}
        {!listings.isLoading &&
        !missingRequests.isLoading &&
        asks.length === 0 &&
        heldRequests.length === 0 ? (
          <div className="border-b border-border py-8">
            <p className="text-[13px] font-semibold">No listings yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Create one listing for the specific item you want to sell.
            </p>
            <Link
              to="/create-listing"
              className="mt-4 inline-flex h-10 items-center gap-2 border border-foreground px-4 text-[12px] font-medium"
            >
              Create your first listing <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}

        {tabListings.length > 0 ? (
          <ul className="divide-y divide-border border-b border-border">
            {tabListings.map((ask) => (
              <li key={ask.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden border border-border bg-secondary/50">
                    {ask.thumbnailUrl ? (
                      <img
                        src={ask.thumbnailUrl}
                        alt={`${ask.productName} listing photo`}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <span className="text-[9px] text-muted-foreground">No photo</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: ask.id }}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {ask.productName}
                    </Link>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {ask.variantLabel} ·{" "}
                      {ask.status === "active" && !ask.approvedAt
                        ? "Awaiting Gem State review"
                        : (listingStatusLabels[ask.status] ?? ask.status)}{" "}
                      · {ask.publicMediaCount ?? 0} photos
                    </p>
                    {ask.status === "active" && ask.approvedAt && ask.highestBidCents != null ? (
                      <p className="numeric mt-1 text-[11.5px] font-medium text-primary">
                        Highest offer {formatUsd(ask.highestBidCents)} · {ask.activeBidCount ?? 0}{" "}
                        total
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="numeric mr-1 text-[13px] font-semibold">
                    {formatUsd(ask.priceCents)}
                  </span>
                  {ask.status === "matched" && ask.matchedOrderId ? (
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: ask.matchedOrderId }}
                      className="inline-flex h-8 items-center border border-foreground px-2.5 text-[11.5px] font-medium hover:bg-secondary"
                    >
                      View sale
                    </Link>
                  ) : null}
                  {ask.status === "active" && ask.approvedAt && ask.highestBidCents != null ? (
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate(ask.variantId)}
                      disabled={acceptMutation.isPending}
                      className="h-8 bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Accept {formatUsd(ask.highestBidCents)}
                    </button>
                  ) : null}
                  {ask.status === "active" ? (
                    <>
                      <Link
                        to="/listings/$listingId/edit"
                        params={{ listingId: ask.id }}
                        className="inline-flex h-8 items-center border border-input px-2.5 text-[11.5px] font-medium hover:bg-secondary"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(ask.id)}
                        disabled={cancelMutation.isPending}
                        className="h-8 border border-input px-2.5 text-[11.5px] font-medium hover:bg-secondary disabled:opacity-60"
                      >
                        Take down
                      </button>
                    </>
                  ) : null}
                  {ask.status === "cancelled" || ask.status === "expired" ? (
                    <button
                      type="button"
                      onClick={() => relistMutation.mutate(ask.id)}
                      disabled={relistMutation.isPending}
                      className="h-8 border border-input px-2.5 text-[11.5px] font-medium hover:bg-secondary disabled:opacity-60"
                    >
                      Relist
                    </button>
                  ) : null}
                  <Link
                    to="/create-listing"
                    search={{ duplicateFrom: ask.id }}
                    className="inline-flex h-8 items-center border border-input px-2.5 text-[11.5px] font-medium hover:bg-secondary"
                  >
                    Duplicate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {listingTab === "pending" && heldRequests.length > 0 ? (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Missing products under review
            </p>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {heldRequests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="text-[13px] font-semibold">{request.productName}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      Product page and exact listing submitted together ·{" "}
                      {request.suggestionStatus.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="numeric text-[13px] font-semibold">
                    {formatUsd(request.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!listings.isLoading &&
        asks.length + heldRequests.length > 0 &&
        tabListings.length === 0 ? (
          <p className="py-7 text-[12.5px] text-muted-foreground">
            {listingTab === "active"
              ? "No live listings right now."
              : listingTab === "pending"
                ? heldRequests.length > 0
                  ? ""
                  : "Nothing waiting on Gem State review."
                : listingTab === "sold"
                  ? "No sold listings yet."
                  : "No removed listings."}
          </p>
        ) : null}
      </section>

      <section id="inquiries" className="mt-10 scroll-mt-28">
        <div className="border-b border-border pb-3">
          <h2 className="text-[14px] font-semibold">Buyer inquiries</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Questions from buyers about your exact listings. Reply directly by email.
          </p>
        </div>
        {listingInquiries.isLoading ? (
          <p className="py-5 text-[12.5px] text-muted-foreground">Loading inquiries…</p>
        ) : null}
        {!listingInquiries.isLoading && (listingInquiries.data ?? []).length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted-foreground">No buyer inquiries yet.</p>
        ) : null}
        {(listingInquiries.data ?? []).length > 0 ? (
          <ul className="divide-y divide-border border-b border-border">
            {(listingInquiries.data ?? []).map((inquiry) => (
              <li key={inquiry.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: inquiry.listingId }}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {inquiry.listingTitle}
                    </Link>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {inquiry.buyerName} · {inquiry.buyerEmail} ·{" "}
                      {new Date(inquiry.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed">
                      {inquiry.message}
                    </p>
                  </div>
                  <a
                    href={`mailto:${inquiry.buyerEmail}?subject=${encodeURIComponent(`Re: ${inquiry.listingTitle}`)}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-full border border-foreground px-3 text-[11.5px] font-medium hover:bg-secondary"
                  >
                    Reply by email
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="offers" className="mt-10 scroll-mt-28">
        <div className="border-b border-border pb-3">
          <h2 className="text-[14px] font-semibold">Offers on your exact listings</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Accept, decline or counter offers made against a specific photographed item.
          </p>
        </div>
        {listingOffers.isLoading ? (
          <p className="py-5 text-[12.5px] text-muted-foreground">Loading offers…</p>
        ) : null}
        {!listingOffers.isLoading &&
        !(listingOffers.data ?? []).some(
          (offer) =>
            ["pending", "countered"].includes(offer.status) ||
            ["capture_pending", "cancel_pending"].includes(offer.paymentStatus ?? ""),
        ) ? (
          <p className="py-6 text-[12.5px] text-muted-foreground">
            No open listing-specific offers.
          </p>
        ) : null}
        <ul className="divide-y divide-border border-b border-border">
          {(listingOffers.data ?? [])
            .filter(
              (offer) =>
                ["pending", "countered"].includes(offer.status) ||
                ["capture_pending", "cancel_pending"].includes(offer.paymentStatus ?? ""),
            )
            .map((offer) => (
              <li key={offer.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: offer.askId }}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {offer.productName}
                    </Link>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {offer.variantLabel} · listed at {formatUsd(offer.listingPriceCents)}
                    </p>
                    <p className="numeric mt-1 text-[13px] font-semibold">
                      Buyer offer {formatUsd(offer.amountCents)}
                      {offer.sellerCounterCents != null
                        ? ` · your counter ${formatUsd(offer.sellerCounterCents)}`
                        : ""}
                    </p>
                    {offer.status === "pending" || offer.paymentStatus === "capture_pending" ? (
                      <dl className="numeric mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <dt>Gem State selling fee</dt>
                        <dd className="text-right">−{formatUsd(offer.sellerFeeCents)}</dd>
                        <dt>You’ll receive</dt>
                        <dd className="text-right font-semibold text-foreground">
                          {formatUsd(offer.sellerPayoutCents)}
                        </dd>
                        <dt>Buyer card</dt>
                        <dd className="text-right">
                          {offer.paymentAuthorized ? "Authorized" : "Not authorized"}
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
                  ) : offer.status === "pending" || offer.paymentStatus === "capture_pending" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={offerMutation.isPending || !offer.paymentAuthorized}
                        onClick={() =>
                          offerMutation.mutate({ offerId: offer.id, action: "accept" })
                        }
                        className="h-9 bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {offer.paymentStatus === "capture_pending" ? "Retry capture" : "Accept"}{" "}
                        {formatUsd(offer.amountCents)}
                      </button>
                      {offer.paymentStatus !== "capture_pending" ? (
                        <>
                          <input
                            aria-label={`Counteroffer for ${offer.productName}`}
                            inputMode="decimal"
                            placeholder="Counter"
                            value={counterPrices[offer.id] ?? ""}
                            onChange={(e) =>
                              setCounterPrices({ ...counterPrices, [offer.id]: e.target.value })
                            }
                            className="numeric h-9 w-[105px] border border-input bg-background px-2.5 text-[12px]"
                          />
                          <button
                            type="button"
                            disabled={
                              offerMutation.isPending || !(counterPrices[offer.id] ?? "").trim()
                            }
                            onClick={() =>
                              offerMutation.mutate({ offerId: offer.id, action: "counter" })
                            }
                            className="h-9 border border-foreground px-3 text-[11.5px] font-medium disabled:opacity-50"
                          >
                            Counter
                          </button>
                          <button
                            type="button"
                            disabled={offerMutation.isPending}
                            onClick={() =>
                              offerMutation.mutate({ offerId: offer.id, action: "decline" })
                            }
                            className="h-9 border border-input px-3 text-[11.5px] font-medium disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <span className="border border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
                      Waiting for buyer
                    </span>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </section>

      <section id="reviews" className="mt-10 scroll-mt-28">
        <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-[14px] font-semibold">Your seller reviews</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Reviews from Gem State buyers and other members.
            </p>
          </div>
          <p className="numeric text-[12px] font-semibold">
            {summary.data?.ratingAverage == null
              ? "New seller"
              : `${summary.data.ratingAverage.toFixed(1)} / 5`}
          </p>
        </div>
        {summary.data?.reviews.length ? (
          <ul className="grid gap-3 py-4 md:grid-cols-2">
            {summary.data.reviews.map((review) => (
              <li key={review.id} className="border border-border bg-card p-4">
                <p
                  className="flex gap-0.5 text-primary"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      size={13}
                      weight={index < review.rating ? "fill" : "regular"}
                    />
                  ))}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed">
                  {review.comment || "No written comment."}
                </p>
                <p className="mt-3 text-[10.5px] text-muted-foreground">
                  {review.reviewerName ?? "Gem State member"} ·{" "}
                  {new Date(review.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-7 text-[12.5px] text-muted-foreground">No reviews yet.</p>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-[16px] font-semibold sm:text-[18px]">{value}</p>
    </div>
  );
}

function OnboardingStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
        {number}
      </span>
      <p className="pt-1 text-[12.5px] leading-relaxed">{text}</p>
    </li>
  );
}
