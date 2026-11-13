import { WebsiteStorefrontLink } from "@/components/storefronts/WebsiteStorefrontLink";
import { AdminBusinessPerformanceLink } from "@/components/dealers/AdminBusinessPerformanceLink";
import {
  SellerReviewFlagView,
  SellerReviewFormView,
} from "@/components/storefronts/SellerReviewViews";
import { SellerStorefrontView } from "@/components/storefronts/SellerStorefrontView";
import type { StorefrontLinkProps } from "@/components/storefronts/storefront-types";
import { trackBusinessEvent } from "@/lib/business-analytics";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { SellerListingGrid } from "@/components/market/SellerListingGrid";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { SELLER_SHARE_IMAGE } from "@/lib/seller-share";
import {
  flagSellerReview,
  getMySellerReview,
  getPublicSeller,
  submitSellerReview,
} from "@/lib/seller.functions";
import { isIndexableStorefront, socialImageMeta } from "@/lib/seo-policy";

const sellerQuery = (slug: string) =>
  queryOptions({ queryKey: ["seller", slug], queryFn: () => getPublicSeller({ data: { slug } }) });

export const Route = createFileRoute("/sellers/$slug")({
  validateSearch: (search: Record<string, unknown>): { review?: true } => ({
    ...(search["review"] ? { review: true as const } : {}),
  }),
  loader: async ({ context, params }) => {
    const seller = await context.queryClient.ensureQueryData(sellerQuery(params.slug));
    if (!seller) throw notFound();
    return { seller };
  },
  component: SellerPage,
  head: ({ loaderData }) => {
    const seller = loaderData?.seller;
    if (!seller) {
      return {
        meta: [
          { title: `Seller profile — Bluebird Marketplace` },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${seller.displayName} — Seller on Bluebird Marketplace`;
    const description =
      seller.activeListingCount > 0
        ? `Shop ${seller.activeListingCount} listing${seller.activeListingCount === 1 ? "" : "s"} from ${seller.displayName} on Bluebird Marketplace, Idaho's local marketplace. Message the seller directly.`
        : `${seller.displayName}'s seller profile on Bluebird Marketplace.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // A storefront is worth indexing once it has something for sale (the
        // sitemap lists the same ones); an empty one stays out of search.
        ...(isIndexableStorefront(seller.activeListingCount)
          ? []
          : [{ name: "robots", content: "noindex, follow" }]),
        // What shows when a seller shares their link on Facebook and elsewhere.
        { property: "og:title", content: `Shop ${seller.displayName}'s listings on Bluebird` },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        ...socialImageMeta(
          brand.urls.siteUrl,
          SELLER_SHARE_IMAGE,
          `${seller.displayName}'s Bluebird storefront`,
        ),
      ],
      links: seller.listings[0]?.thumbnailUrl
        ? [
            {
              rel: "preload",
              as: "image",
              href: seller.listings[0].thumbnailUrl,
              fetchPriority: "high",
            },
          ]
        : [],
    };
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-[760px] px-4 py-14">
      <BluebirdEmptyState
        title="Seller not found"
        description="This seller profile is unavailable or the link is out of date."
      >
        <Link to="/browse" search={{}} className="inline-flex h-10 items-center underline">
          Browse listings
        </Link>
      </BluebirdEmptyState>
    </main>
  ),
});

function SellerPage() {
  const { slug } = Route.useParams();
  const { review: focusReview } = Route.useSearch();
  const { data: seller } = useSuspenseQuery(sellerQuery(slug));
  const { user } = useAuth();
  useEffect(() => {
    if (seller?.slug)
      trackBusinessEvent("business_profile_viewed", null, { seller_slug: seller.slug });
  }, [seller?.slug]);
  return seller ? (
    <SellerStorefrontView
      seller={seller}
      userId={user?.id}
      focusReview={focusReview}
      runtime={{
        Link: WebsiteStorefrontLink,
        Listings: SellerListingGrid,
        ReviewForm,
        ReviewFlagButton,
        AdminLink: AdminBusinessPerformanceLink,
      }}
    />
  ) : null;
}
function ReviewForm({ sellerId, sellerSlug }: { sellerId: string; sellerSlug: string }) {
  const read = useServerFn(getMySellerReview),
    submit = useServerFn(submitSellerReview);
  return (
    <SellerReviewFormView
      sellerId={sellerId}
      sellerSlug={sellerSlug}
      runtime={{
        getReview: () => read({ data: { sellerId } }),
        submitReview: (data) => submit({ data: { ...data, sellerId } }),
      }}
    />
  );
}
function ReviewFlagButton({ reviewId }: { reviewId: string }) {
  const flag = useServerFn(flagSellerReview);
  return <SellerReviewFlagView reviewId={reviewId} onFlag={(data) => flag({ data })} />;
}
