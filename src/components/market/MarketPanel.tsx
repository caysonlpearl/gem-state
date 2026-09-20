import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Info, Camera } from "@phosphor-icons/react";

import { feeDefaults, formatUsd } from "@/config/fees";
import { brand } from "@/config/brand";
import type { DemoVariantMarket } from "@/config/demo-market";
import {
  formatHandlingTime,
  formatShippingOrigin,
  getSellerShippingMethod,
} from "@/config/shipping";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getSellerSetup, getActiveListingsForVariant } from "@/lib/seller.functions";
import { ParkVaultCheckoutFlow } from "@/components/market/ParkVaultCheckoutFlow";

import {
  buyNow,
  sellNow,
  placeBid,
  placeAsk,
  getProductMarket,
  getMarketSettings,
  ITEM_CONDITIONS,
  type VariantMarket,
} from "@/lib/market.functions";

const conditionLabels: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

function toCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

export function MarketPanel({
  productId,
  productSlug,
  variantId,
  variantLabel,
  isDemo,
  demoMarket,
  defaultOpenAsk = false,
  onViewMarketData,
  lastSaleCents = null,
}: {
  productId: string;
  productSlug: string;
  variantId: string;
  variantLabel: string;
  isDemo: boolean;
  demoMarket?: DemoVariantMarket | null;
  defaultOpenAsk?: boolean | undefined;
  /** Opens the anonymous market-depth drawer from the buy box footer. */
  onViewMarketData?: (() => void) | undefined;
  lastSaleCents?: number | null;
}) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchMarket = useServerFn(getProductMarket);
  const runBuyNow = useServerFn(buyNow);
  const runSellNow = useServerFn(sellNow);
  const submitBid = useServerFn(placeBid);
  const submitAsk = useServerFn(placeAsk);
  const fetchSettings = useServerFn(getMarketSettings);
  const fetchSellerSetup = useServerFn(getSellerSetup);

  const [openForm, setOpenForm] = useState<"bid" | "ask" | null>(defaultOpenAsk ? "ask" : null);
  const [bidPrice, setBidPrice] = useState("");
  const [askPrice, setAskPrice] = useState("");
  const [condition, setCondition] = useState<string>("new_with_tags");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photoRights, setPhotoRights] = useState(false);
  const [parcel, setParcel] = useState({ length: "", width: "", height: "", weight: "" });

  useEffect(() => {
    if (!defaultOpenAsk) return;
    const id = window.setTimeout(() => {
      document
        .getElementById("create-listing")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(id);
  }, [defaultOpenAsk]);

  const settingsQuery = useQuery({
    queryKey: ["market-settings"],
    queryFn: () => fetchSettings({}),
    staleTime: 5 * 60 * 1000,
  });
  const sellerSetupQuery = useQuery({
    queryKey: ["seller-setup"],
    queryFn: () => fetchSellerSetup(),
    enabled: isSignedIn && openForm === "ask",
  });
  // Fail closed: until settings load, assume checkout is NOT live so no label
  // or message can imply a payment happened.
  const liveCheckout = settingsQuery.data?.liveCheckoutEnabled ?? false;
  const reservationMinutes = settingsQuery.data?.reservationMinutes ?? 2880;
  const reservationLabel =
    reservationMinutes >= 120
      ? `${Math.round(reservationMinutes / 60)} hours`
      : `${reservationMinutes} minutes`;

  const buyLabel = liveCheckout ? "Buy Now" : "Purchase now";
  const sellLabel = liveCheckout ? "Sell Now" : "Accept best offer";

  const marketQuery = useQuery({
    queryKey: ["product-market", productId],
    queryFn: () => fetchMarket({ data: { productId } }),
    enabled: !isDemo,
  });

  const market: VariantMarket | undefined = marketQuery.data?.find(
    (m) => m.variantId === variantId,
  );
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["product-market", productId] });

  // With live checkout on, "Buy Now" must open the real Stripe checkout for the
  // cheapest active listing — the legacy buy_now RPC only reserves an order and
  // leaves the buyer on an order page waiting for a payment that never starts.
  const fetchVariantListings = useServerFn(getActiveListingsForVariant);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [liveCheckoutTarget, setLiveCheckoutTarget] = useState<{
    askId: string;
    amountCents: number;
  } | null>(null);

  const startLiveCheckout = async () => {
    setStartingCheckout(true);
    try {
      const listings = await fetchVariantListings({ data: { variantId } });
      const cheapest = [...listings].sort((a, b) => a.priceCents - b.priceCents)[0];
      if (!cheapest) {
        toast.error("This listing is no longer available. Refresh for current listings.");
        return;
      }
      await trackEvent("buy_now_started", { product_slug: productSlug }, { isDemo });
      setLiveCheckoutTarget({ askId: cheapest.id, amountCents: cheapest.priceCents });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setStartingCheckout(false);
    }
  };

  const buyMutation = useMutation({
    mutationFn: () => runBuyNow({ data: { variantId } }),
    onSuccess: async (result) => {
      await trackEvent("buy_now_started", { product_slug: productSlug }, { isDemo });
      await trackEvent("order_started", { origin: "buy_now" }, { isDemo });
      await invalidate();
      toast.success(
        liveCheckout
          ? "Order created and awaiting payment."
          : "Purchase request recorded. An operator follows up to complete the transaction.",
      );
      await navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Purchase request failed."),
  });

  const sellMutation = useMutation({
    mutationFn: () => runSellNow({ data: { variantId } }),
    onSuccess: async (result) => {
      await trackEvent("sell_now_started", { product_slug: productSlug }, { isDemo });
      await trackEvent("order_started", { origin: "sell_now" }, { isDemo });
      await invalidate();
      toast.success(
        liveCheckout
          ? "Match created and awaiting payment from the buyer."
          : "Sale recorded against the offer. The buyer completes payment at checkout.",
      );
      await navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sale offer failed."),
  });

  const bidMutation = useMutation({
    mutationFn: () => submitBid({ data: { variantId, priceCents: toCents(bidPrice) } }),
    onSuccess: async () => {
      await trackEvent("bid_submitted", { product_slug: productSlug }, { isDemo });
      setBidPrice("");
      setOpenForm(null);
      await invalidate();
      toast.success("Offer submitted.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit your offer."),
  });

  const askMutation = useMutation({
    mutationFn: async () => {
      if (
        !sellerSetupQuery.data?.defaultShippingMethod ||
        !sellerSetupQuery.data.defaultHandlingDays
      ) {
        throw new Error("Complete shipping method and handling time in your seller profile first.");
      }
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Sign in required.");
      if (files.length === 0) throw new Error("Add at least one photo of the item in your hands.");
      if (!photoRights) throw new Error("Confirm you have the right to publish these photos.");

      const evidencePaths: string[] = [];
      const publicMediaPaths: string[] = [];
      for (const file of files.slice(0, 8)) {
        const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const fileId = crypto.randomUUID();
        const evidencePath = `${uid}/${fileId}.${ext}`;
        const publicPath = `${uid}/${fileId}.${ext}`;
        const { error } = await supabase.storage.from("ask-evidence").upload(evidencePath, file, {
          contentType: file.type || "image/jpeg",
        });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
        const publicUpload = await supabase.storage.from("listing-media").upload(publicPath, file, {
          contentType: file.type || "image/jpeg",
        });
        if (publicUpload.error)
          throw new Error(`Public photo upload failed: ${publicUpload.error.message}`);
        evidencePaths.push(evidencePath);
        publicMediaPaths.push(publicPath);
      }
      await trackEvent("ask_evidence_uploaded", { photos: evidencePaths.length }, { isDemo });

      return submitAsk({
        data: {
          variantId,
          priceCents: toCents(askPrice),
          itemCondition: condition,
          evidencePaths,
          publicMediaPaths,
          sellerNote: note,
          parcelLengthIn: parcel.length ? Number(parcel.length) : null,
          parcelWidthIn: parcel.width ? Number(parcel.width) : null,
          parcelHeightIn: parcel.height ? Number(parcel.height) : null,
          parcelWeightLb: parcel.weight ? Number(parcel.weight) : null,
        },
      });
    },
    onSuccess: async () => {
      await trackEvent("ask_submitted", { product_slug: productSlug }, { isDemo });
      setAskPrice("");
      setNote("");
      setFiles([]);
      setPhotoRights(false);
      setParcel({ length: "", width: "", height: "", weight: "" });
      setOpenForm(null);
      await invalidate();
      toast.success("Listing submitted for ParkVault approval. It will appear after review.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create your listing."),
  });

  const lowestAsk = market?.lowestAskCents ?? null;
  const highestBid = market?.highestBidCents ?? null;
  const selectedShippingMethod = getSellerShippingMethod(
    sellerSetupQuery.data?.defaultShippingMethod,
  );
  const shippingReady = Boolean(
    selectedShippingMethod && sellerSetupQuery.data?.defaultHandlingDays,
  );
  const payoutReady = Boolean(
    sellerSetupQuery.data?.stripeDetailsSubmitted && sellerSetupQuery.data?.stripePayoutsEnabled,
  );

  if (isDemo && demoMarket) {
    return (
      <div className="mt-5 overflow-hidden border border-foreground bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-brand-warm/10 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-warm">
            Demo market data
          </p>
          <p className="numeric font-mono text-[10.5px] text-muted-foreground">
            {demoMarket.activeAskCount} listings · {demoMarket.activeBidCount} offers
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            ["Lowest price", formatUsd(demoMarket.lowestAskCents)],
            ["Best offer", formatUsd(demoMarket.highestBidCents)],
            ["Last verified sale", formatUsd(demoMarket.lastSaleCents)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 bg-card px-3 py-3.5">
              <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-muted-foreground sm:text-[9.5px]">
                {label}
              </p>
              <p className="numeric mt-1 text-[15px] font-semibold sm:text-[17px]">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            disabled
            className="h-11 bg-primary text-[12.5px] font-semibold text-primary-foreground opacity-60"
          >
            Buy now · {formatUsd(demoMarket.lowestAskCents)}
          </button>
          <button
            type="button"
            disabled
            className="h-11 border border-foreground text-[12.5px] font-semibold opacity-60"
          >
            Make an offer
          </button>
        </div>
        <p className="border-t border-border px-3 py-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Illustrative preview only. No member placed these orders, no verified transaction
          occurred, and trading remains disabled for this demonstration record.
        </p>
      </div>
    );
  }

  if (isDemo) {
    return (
      <div className="mt-5 overflow-hidden border border-foreground bg-card">
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            ["Lowest price", "No listings"],
            ["Best offer", "No offers"],
            ["Last sale", "No sales"],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-3 py-3.5">
              <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <button
            type="button"
            disabled
            className="h-11 bg-primary text-[12.5px] font-semibold text-primary-foreground opacity-45"
          >
            Buy now
          </button>
          <button
            type="button"
            disabled
            className="h-11 border border-foreground text-[12.5px] font-semibold opacity-45"
          >
            Make an offer
          </button>
        </div>
        <p className="border-t border-border px-3 py-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Trading is disabled for demonstration records.
        </p>
      </div>
    );
  }

  const marketDataRow = (
    <div className="hairline-t grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground">Last sale</p>
        <p
          className={
            lastSaleCents != null
              ? "numeric mt-0.5 truncate text-[13.5px] font-semibold"
              : "mt-0.5 truncate text-[11.5px] text-muted-foreground"
          }
        >
          {lastSaleCents != null ? formatUsd(lastSaleCents) : "None yet"}
        </p>
      </div>
      <div className="min-w-0 border-l border-border pl-3">
        <p
          title="Highest active buyer bid for this variation"
          className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground"
        >
          Highest bid
        </p>
        <p
          className={
            highestBid != null
              ? "numeric mt-0.5 truncate text-[13.5px] font-semibold"
              : "mt-0.5 truncate text-[11.5px] text-muted-foreground"
          }
        >
          {highestBid != null ? formatUsd(highestBid) : "No offers"}
        </p>
      </div>
      {onViewMarketData ? (
        <button
          type="button"
          onClick={onViewMarketData}
          className="shrink-0 text-[12px] font-semibold text-nav-accent underline underline-offset-[3px]"
        >
          Market data
        </button>
      ) : null}
    </div>
  );

  return (
    <div id="create-listing" className="mt-4 scroll-mt-28 border border-foreground bg-card">
      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            {lowestAsk != null ? (
              <p className="numeric text-[27px] font-semibold leading-none">
                {formatUsd(lowestAsk)}
              </p>
            ) : (
              <p className="text-[15px] font-semibold text-muted-foreground">No active listings</p>
            )}
            <p className="mt-1 text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
              Lowest price · in hand
            </p>
          </div>
          <span className="numeric font-mono text-[10.5px] text-muted-foreground">
            {market
              ? `${market.activeAskCount} listings · ${market.activeBidCount} offers`
              : "Loading market…"}
          </span>
        </div>

        <div className="mt-3">
          {isSignedIn ? (
            <button
              type="button"
              disabled={lowestAsk == null || buyMutation.isPending || startingCheckout}
              onClick={() => {
                if (liveCheckout) void startLiveCheckout();
                else buyMutation.mutate();
              }}
              className="h-12 w-full bg-nav-accent text-[14.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
            >
              {buyMutation.isPending || startingCheckout ? "Matching…" : buyLabel}
            </button>
          ) : (
            <Link
              to={brand.urls.auth}
              className="flex h-12 w-full items-center justify-center bg-nav-accent text-[14.5px] font-semibold text-primary-foreground"
            >
              Sign in to buy
            </Link>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1 text-[12px]">
          {isSignedIn ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = openForm === "bid" ? null : "bid";
                  setOpenForm(next);
                  void trackEvent(
                    next ? "bid_started" : "form_abandoned",
                    { product_slug: productSlug, form: "bid" },
                    { isDemo },
                  );
                }}
                className="font-medium underline underline-offset-[3px] hover:text-nav-accent"
              >
                Make an offer
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = openForm === "ask" ? null : "ask";
                  setOpenForm(next);
                  void trackEvent(
                    next ? "ask_started" : "form_abandoned",
                    { product_slug: productSlug, form: "ask" },
                    { isDemo },
                  );
                }}
                className="font-medium underline underline-offset-[3px] hover:text-nav-accent"
              >
                Sell this item
              </button>
              {highestBid != null ? (
                <button
                  type="button"
                  disabled={sellMutation.isPending}
                  onClick={() => sellMutation.mutate()}
                  className="text-muted-foreground underline underline-offset-[3px] hover:text-foreground disabled:opacity-50"
                >
                  {sellMutation.isPending ? "Matching…" : sellLabel}
                </button>
              ) : null}
            </>
          ) : (
            <Link
              to={brand.urls.auth}
              className="font-medium underline underline-offset-[3px] hover:text-nav-accent"
            >
              Sign in to make an offer or sell
            </Link>
          )}
        </div>
      </div>

      {marketDataRow}

      {openForm === "bid" && (
        <form
          className="hairline-t space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            bidMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="bid-price" className="text-[12px] font-medium">
              Your offer for {variantLabel} (USD)
            </label>
            <input
              id="bid-price"
              inputMode="decimal"
              value={bidPrice}
              onChange={(event) => setBidPrice(event.target.value)}
              placeholder="45.00"
              className="numeric mt-1.5 h-10 w-full max-w-[200px] border border-input bg-background px-3 text-sm"
            />
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Your offer is recorded on this variation. If a seller accepts it, you complete payment
            at checkout — totals are always recalculated on the server.
          </p>
          <button
            type="submit"
            disabled={bidMutation.isPending}
            className="inline-flex h-10 items-center bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
          >
            {bidMutation.isPending ? "Submitting…" : "Submit offer"}
          </button>
        </form>
      )}

      {openForm === "ask" && (
        <form
          className="hairline-t space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            askMutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ask-price" className="text-[12px] font-medium">
                Your listing price for {variantLabel} (USD)
              </label>
              <input
                id="ask-price"
                inputMode="decimal"
                value={askPrice}
                onChange={(event) => setAskPrice(event.target.value)}
                placeholder="60.00"
                className="numeric mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ask-condition" className="text-[12px] font-medium">
                Condition
              </label>
              <select
                id="ask-condition"
                value={condition}
                onChange={(event) => setCondition(event.target.value)}
                className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
              >
                {ITEM_CONDITIONS.map((value) => (
                  <option key={value} value={value}>
                    {conditionLabels[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ask-evidence" className="text-[12px] font-medium">
              Required photo evidence — the exact item in your possession
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Camera size={16} className="text-muted-foreground" />
              <input
                id="ask-evidence"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="text-[12.5px]"
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              These photos appear on your individual listing. A private copy is also kept as in-hand
              evidence. Do not upload catalog, eBay or another seller's photos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["length", "Length (in)"],
              ["width", "Width (in)"],
              ["height", "Height (in)"],
              ["weight", "Weight (lb)"],
            ].map(([key, label]) => (
              <label key={key} className="text-[11.5px] text-muted-foreground">
                {label}
                <input
                  inputMode="decimal"
                  value={parcel[key as keyof typeof parcel] ?? ""}
                  onChange={(event) =>
                    setParcel((current) => ({ ...current, [String(key)]: event.target.value }))
                  }
                  className="numeric mt-1 h-9 w-full border border-input bg-background px-2 text-[12.5px] text-foreground"
                  placeholder={key === "weight" ? "1.5" : "10"}
                />
              </label>
            ))}
          </div>

          <div className="border border-border bg-secondary/45 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Shipping shown on this listing
                </p>
                {sellerSetupQuery.isLoading ? (
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    Loading your seller shipping settings…
                  </p>
                ) : shippingReady ? (
                  <div className="mt-1.5 space-y-0.5 text-[11.5px]">
                    <p>
                      Ships from{" "}
                      {formatShippingOrigin(
                        sellerSetupQuery.data?.shipFromCity,
                        sellerSetupQuery.data?.shipFromRegion,
                        sellerSetupQuery.data?.shipFromCountry,
                      )}
                    </p>
                    <p>
                      {selectedShippingMethod?.label} · {selectedShippingMethod?.transitLabel}
                    </p>
                    <p>{formatHandlingTime(sellerSetupQuery.data?.defaultHandlingDays)}</p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11.5px] font-medium text-brand-warm">
                    Choose a shipping method and handling time before submitting this listing.
                  </p>
                )}
              </div>
              <Link
                to="/seller-setup"
                className="text-[11px] font-semibold underline underline-offset-2"
              >
                Edit shipping defaults
              </Link>
            </div>
          </div>

          <div>
            <label htmlFor="ask-note" className="text-[12px] font-medium">
              Seller note (optional)
            </label>
            <textarea
              id="ask-note"
              value={note}
              maxLength={500}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Only in-hand items may be listed. Your compensation is included in your listing price;
            no separate shopper fee is added at checkout. ParkVault reviews every listing before it
            appears to buyers.
          </p>
          {Number.isFinite(toCents(askPrice)) && toCents(askPrice) >= 100 && (
            <p className="border border-border bg-secondary/50 px-3 py-2 text-[11.5px] text-muted-foreground">
              Estimated seller payout:{" "}
              <strong className="numeric text-foreground">
                {formatUsd(
                  toCents(askPrice) -
                    Math.max(
                      Math.round((toCents(askPrice) * feeDefaults.sellerFeeBps) / 10_000),
                      feeDefaults.minimumFeeCents,
                    ),
                )}
              </strong>
              . Final fees are locked by the server when an order is created.
            </p>
          )}
          <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={photoRights}
              onChange={(event) => setPhotoRights(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              I took these photos or have permission to publish them, and I authorize ParkVault to
              display them while this listing is live.
            </span>
          </label>
          <p className="text-[11.5px] text-muted-foreground">
            First listing?{" "}
            <Link
              to="/seller-setup"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Complete seller setup
            </Link>{" "}
            before submitting.
          </p>
          <button
            type="submit"
            disabled={
              askMutation.isPending || sellerSetupQuery.isLoading || !shippingReady || !payoutReady
            }
            className="inline-flex h-10 items-center bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
          >
            {askMutation.isPending ? "Submitting…" : "Submit listing for review"}
          </button>
          {!sellerSetupQuery.isLoading && !payoutReady ? (
            <p className="text-[11.5px] font-medium text-brand-warm">
              Finish Stripe identity and payout verification in seller setup before listing.
            </p>
          ) : null}
        </form>
      )}

      <details className="hairline-t bg-secondary/65 px-4 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
          <Info size={14} className="shrink-0 text-primary" />
          {liveCheckout
            ? `Listings are reserved for ${reservationLabel} after a match.`
            : "How purchases work"}
        </summary>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {liveCheckout ? (
            <>
              {"A match creates an order awaiting payment and reserves the listing for "}
              {reservationLabel}
              {
                ". If payment is not completed in time, the reservation is released automatically and the listing returns to the market."
              }
            </>
          ) : (
            <>
              {`"${buyLabel}" reserves the listing for `}
              {reservationLabel}
              {
                " while the purchase is completed. If it is not completed in time the reservation is released automatically and the listing returns to the market."
              }
            </>
          )}
        </p>
      </details>

      {liveCheckoutTarget ? (
        <ParkVaultCheckoutFlow
          mode="purchase"
          askId={liveCheckoutTarget.askId}
          amountCents={liveCheckoutTarget.amountCents}
          onClose={() => setLiveCheckoutTarget(null)}
        />
      ) : null}
    </div>
  );
}
