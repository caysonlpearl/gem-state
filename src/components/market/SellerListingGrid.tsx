import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle, Images, X } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import {
  formatHandlingTime,
  formatShippingOrigin,
  getSellerShippingMethod,
} from "@/config/shipping";
import type { PublicListing } from "@/lib/seller.functions";
import { useAuth } from "@/hooks/useAuth";
import { ParkVaultCheckoutFlow } from "@/components/market/ParkVaultCheckoutFlow";

const conditions: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used · excellent",
  used_good: "Used · good",
};

export function SellerListingGrid({
  listings,
  showProduct = false,
}: {
  listings: PublicListing[];
  showProduct?: boolean;
}) {
  const [selected, setSelected] = useState<PublicListing | null>(null);

  if (listings.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">No active seller listings yet.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
        {listings.map((listing) => (
          <article key={listing.id} className="group min-w-0">
            <button
              type="button"
              onClick={() => setSelected(listing)}
              className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={`View listing from ${listing.sellerDisplayName}`}
            >
              <span className="relative block aspect-square overflow-hidden bg-secondary/50">
                {listing.imageUrls[0] ? (
                  <img
                    src={listing.imageUrls[0]}
                    alt={listing.productName ?? "Seller listing"}
                    className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-[1.025]"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-[11px] text-muted-foreground">
                    Photo unavailable
                  </span>
                )}
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-background/95 px-2 py-1 text-[9.5px] font-medium shadow-sm">
                  <Images size={12} /> {listing.imageUrls.length}
                </span>
              </span>
              <span className="mt-2.5 block">
                {showProduct && listing.productName ? (
                  <span className="line-clamp-2 block text-[12.5px] font-semibold leading-snug">
                    {listing.productName}
                  </span>
                ) : null}
                {showProduct && listing.variantLabel ? (
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                    {listing.variantLabel}
                  </span>
                ) : null}
                <span className="mt-1 block text-[10.5px] text-muted-foreground">
                  {conditions[listing.condition] ?? listing.condition}
                </span>
                <span className="mt-1 line-clamp-1 block text-[10px] text-muted-foreground">
                  Ships from{" "}
                  {formatShippingOrigin(
                    listing.shipFromCity,
                    listing.shipFromRegion,
                    listing.shipFromCountry,
                  )}
                </span>
                <span className="numeric mt-1 block text-[16px] font-semibold">
                  {formatUsd(listing.priceCents)}
                </span>
                <span className="mt-1 block text-[10px] font-medium text-primary opacity-80 group-hover:opacity-100">
                  View photos and details
                </span>
              </span>
            </button>
            <Link
              to="/sellers/$slug"
              params={{ slug: listing.sellerSlug }}
              className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {listing.sellerDisplayName}
              {listing.payoutVerified ? (
                <CheckCircle
                  size={12}
                  weight="fill"
                  className="text-primary"
                  aria-label="Payout identity verified"
                />
              ) : null}
              {listing.sellerRating != null ? ` · ${listing.sellerRating.toFixed(1)}★` : ""}
            </Link>
          </article>
        ))}
      </div>
      {selected ? (
        <ListingDetailModal listing={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}

function ListingDetailModal({ listing, onClose }: { listing: PublicListing; onClose: () => void }) {
  const { isSignedIn } = useAuth();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showOffer, setShowOffer] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [checkout, setCheckout] = useState<{
    mode: "purchase" | "offer";
    amountCents: number;
  } | null>(null);
  const imageUrls = listing.imageUrls;
  const shippingMethod = getSellerShippingMethod(listing.shippingMethod);

  useEffect(() => {
    setPhotoIndex(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [listing.id, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/70 px-3 py-5 backdrop-blur-[2px] sm:px-6 sm:py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`listing-title-${listing.id}`}
        className="relative mx-auto grid min-h-[min(760px,calc(100vh-40px))] w-full max-w-[1120px] overflow-hidden bg-background shadow-2xl lg:grid-cols-[1.35fr_0.65fr]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close listing details"
          className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-background/95 shadow-sm transition-colors hover:bg-secondary"
        >
          <X size={19} />
        </button>

        <div className="flex min-h-[420px] flex-col bg-secondary/45 p-4 sm:p-6">
          <div className="grid flex-1 place-items-center overflow-hidden">
            {imageUrls[photoIndex] ? (
              <img
                src={imageUrls[photoIndex]}
                alt={`${listing.productName ?? "Seller listing"} photo ${photoIndex + 1}`}
                className="max-h-[620px] w-full object-contain"
              />
            ) : (
              <div className="text-[12px] text-muted-foreground">Photo unavailable</div>
            )}
          </div>
          {imageUrls.length > 1 ? (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Listing photos">
              {imageUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPhotoIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={photoIndex === index}
                  className={`h-20 w-20 shrink-0 overflow-hidden border bg-background p-1.5 ${
                    photoIndex === index ? "border-foreground" : "border-border"
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col p-5 sm:p-7 lg:pt-16">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Exact-item listing
          </p>
          <h2
            id={`listing-title-${listing.id}`}
            className="mt-2 font-editorial text-[30px] font-normal leading-[1.05] tracking-[-0.03em]"
          >
            {listing.productName ?? "Seller listing"}
          </h2>
          {listing.variantLabel ? (
            <p className="mt-2 text-[12px] text-muted-foreground">{listing.variantLabel}</p>
          ) : null}
          <p className="numeric mt-6 text-[30px] font-semibold">{formatUsd(listing.priceCents)}</p>

          <section className="mt-5 border border-foreground bg-card p-3">
            {isSignedIn ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCheckout({ mode: "purchase", amountCents: listing.priceCents })
                    }
                    className="h-11 bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
                  >
                    Purchase now · {formatUsd(listing.priceCents)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOffer((current) => !current)}
                    className="h-11 border border-foreground px-3 text-[12px] font-semibold hover:bg-foreground hover:text-background"
                  >
                    Make an offer
                  </button>
                </div>
                {showOffer ? (
                  <form
                    className="mt-3 border-t border-border pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const amountCents = Math.round(
                        Number(offerPrice.replace(/[^0-9.]/g, "")) * 100,
                      );
                      if (Number.isFinite(amountCents) && amountCents >= 100) {
                        setCheckout({ mode: "offer", amountCents });
                      }
                    }}
                  >
                    <label className="text-[11.5px] font-medium" htmlFor={`offer-${listing.id}`}>
                      Your offer (USD)
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id={`offer-${listing.id}`}
                        inputMode="decimal"
                        placeholder={((listing.priceCents / 100) * 0.9).toFixed(2)}
                        value={offerPrice}
                        onChange={(event) => setOfferPrice(event.target.value)}
                        className="numeric h-10 min-w-0 flex-1 border border-input bg-background px-3 text-[13px] outline-none focus:border-foreground"
                      />
                      <button
                        type="submit"
                        className="h-10 bg-foreground px-4 text-[12px] font-semibold text-background"
                      >
                        Review offer
                      </button>
                    </div>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                      Review delivery, fees and the total before securely authorizing your offer.
                    </p>
                  </form>
                ) : null}
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  Secure checkout includes buyer protection, tracked delivery and tax calculation.
                </p>
              </>
            ) : (
              <Link
                to={brand.urls.auth}
                className="flex h-11 items-center justify-center bg-primary px-4 text-[12px] font-semibold text-primary-foreground"
              >
                Sign in to buy or make an offer
              </Link>
            )}
          </section>

          <dl className="mt-6 divide-y divide-border border-y border-border text-[12px]">
            <DetailRow
              label="Condition"
              value={conditions[listing.condition] ?? listing.condition}
            />
            <DetailRow
              label="Photos"
              value={`${imageUrls.length} exact-item photo${imageUrls.length === 1 ? "" : "s"}`}
            />
            <DetailRow label="Listed" value={new Date(listing.createdAt).toLocaleDateString()} />
            <DetailRow
              label="Ships from"
              value={formatShippingOrigin(
                listing.shipFromCity,
                listing.shipFromRegion,
                listing.shipFromCountry,
              )}
            />
            <DetailRow label="Handling" value={formatHandlingTime(listing.handlingTimeDays)} />
            <DetailRow label="Shipping method" value={shippingMethod?.label ?? "Not provided"} />
            <DetailRow
              label="Estimated transit"
              value={shippingMethod?.transitLabel ?? "Not provided"}
            />
          </dl>

          <section className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Seller notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
              {listing.note || "The seller did not add additional notes."}
            </p>
          </section>

          <section className="mt-6 border-t border-border pt-5">
            <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              Seller
            </p>
            <Link
              to="/sellers/$slug"
              params={{ slug: listing.sellerSlug }}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline"
            >
              {listing.sellerDisplayName}
              {listing.payoutVerified ? (
                <CheckCircle size={15} weight="fill" className="text-primary" />
              ) : null}
              {listing.sellerRating != null ? ` · ${listing.sellerRating.toFixed(1)}★` : ""}
            </Link>
          </section>

          {listing.productSlug ? (
            <Link
              to="/products/$slug"
              params={{ slug: listing.productSlug }}
              className="mt-auto inline-flex h-11 items-center justify-center border border-foreground px-4 text-[12.5px] font-semibold"
            >
              View canonical product page
            </Link>
          ) : null}
        </div>
      </section>
      {checkout ? (
        <ParkVaultCheckoutFlow
          askId={listing.id}
          amountCents={checkout.amountCents}
          mode={checkout.mode}
          onClose={() => setCheckout(null)}
        />
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
