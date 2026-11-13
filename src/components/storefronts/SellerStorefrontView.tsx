import { useEffect, useRef, type ComponentType } from "react";
import { CheckCircle, Star } from "@phosphor-icons/react";
import type { PublicSeller, PublicListing } from "@/lib/seller.functions";
import type { StorefrontLinkProps } from "./storefront-types";
export function SellerStorefrontView({
  seller,
  userId,
  focusReview = false,
  runtime,
}: {
  seller: PublicSeller;
  userId?: string;
  focusReview?: boolean;
  runtime: {
    Link: ComponentType<StorefrontLinkProps>;
    Listings: ComponentType<{ listings: PublicListing[]; showProduct?: boolean }>;
    ReviewForm: ComponentType<{ sellerId: string; sellerSlug: string }>;
    ReviewFlagButton: ComponentType<{ reviewId: string }>;
    AdminLink: ComponentType<{ sellerSlug: string }>;
    pageElement?: "main" | "article";
  };
}) {
  const {
    Link,
    Listings: SellerListingGrid,
    ReviewForm,
    ReviewFlagButton,
    AdminLink: AdminBusinessPerformanceLink,
  } = runtime;
  const Page = runtime.pageElement ?? "main";
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusReview) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusReview]);

  const isOwnProfile = userId === seller.userId;

  return (
    <Page className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
      <section className="border-b border-border pb-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-[22px] font-semibold text-primary-foreground">
            {seller.avatarUrl ? (
              <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              seller.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere] font-editorial text-[38px] font-normal tracking-[-0.035em]">
              {seller.displayName}
              {seller.managedByBluebird && (
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">
                  Managed by Bluebird
                </span>
              )}
              {seller.payoutVerified ? (
                <CheckCircle
                  size={21}
                  weight="fill"
                  className="text-primary"
                  aria-label="Payout identity verified"
                />
              ) : null}
            </h1>
            <AdminBusinessPerformanceLink sellerSlug={seller.slug} />
            <p className="text-[11.5px] text-muted-foreground">
              @{seller.slug} · Member since {new Date(seller.memberSince).getFullYear()}
            </p>
            {seller.bio ? (
              <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
                {seller.bio}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid max-w-[380px] grid-cols-2 gap-px bg-border border border-border">
          <Metric label="Active listings" value={seller.activeListingCount} />
          <Metric
            label="Rating"
            value={seller.ratingAverage == null ? "New" : `${seller.ratingAverage.toFixed(1)} / 5`}
            icon={seller.ratingAverage != null ? <Star size={12} weight="fill" /> : null}
          />
        </div>
      </section>
      <section className="pt-7">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-editorial text-[27px] font-normal">Listings</h2>
          <span className="text-[11.5px] text-muted-foreground">Seller listings</span>
        </div>
        <SellerListingGrid listings={seller.listings} showProduct />
      </section>
      <section className="mt-10 border-t border-border pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Seller reviews</h2>
          <span className="text-[11.5px] text-muted-foreground">{seller.reviewCount} total</span>
        </div>
        <div ref={formRef} className="mt-5 scroll-mt-20">
          {!isOwnProfile ? (
            userId ? (
              <ReviewForm sellerId={seller.userId} sellerSlug={seller.slug} />
            ) : (
              <p className="border border-dashed border-input bg-card p-4 text-[12.5px] text-muted-foreground">
                <Link
                  to="/auth"
                  search={{ redirect: undefined }}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </Link>{" "}
                to leave {seller.displayName} a review.
              </p>
            )
          ) : null}
        </div>
        {seller.reviews.length ? (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {seller.reviews.map((review) => (
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
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10.5px] text-muted-foreground">
                    {review.reviewerName ?? "Bluebird member"} ·{" "}
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                  {userId ? <ReviewFlagButton reviewId={review.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            {seller.reviewCount > 0
              ? "No public reviews to display here."
              : "This seller has not received a review yet."}
          </p>
        )}
      </section>
    </Page>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 flex items-center gap-1 text-[14px] font-semibold">
        {value}
        {icon}
      </p>
    </div>
  );
}
