import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ComponentProps } from "react";
import { DealerContactPanelView } from "../../../src/components/classifieds/DealerContactPanelView";
import type { ListingCard as WebsiteListingCard } from "../../../src/components/classifieds/ListingCard";
import { DealerStorefrontHeaderView } from "../../../src/components/dealers/DealerStorefrontHeaderView";
import { BluebirdEmptyState } from "../../../src/components/layout/BluebirdEmptyState";
import { DealerStorefrontView } from "../../../src/components/storefronts/DealerStorefrontView";
import { SellerListingGridView } from "../../../src/components/storefronts/SellerListingGridView";
import {
  SellerReviewFlagView,
  SellerReviewFormView,
} from "../../../src/components/storefronts/SellerReviewViews";
import { SellerStorefrontView } from "../../../src/components/storefronts/SellerStorefrontView";
import type { StorefrontLinkProps } from "../../../src/components/storefronts/storefront-types";
import type { PublicDealerProfile } from "../../../src/lib/dealer.functions";
import { mobileListingAllowed } from "../../../src/lib/mobile-contract";
import { mobileListingSummary } from "../../../src/lib/mobile-listing-detail";
import {
  mobilePublicDealer,
  mobilePublicSeller,
  mobileStorefrontIdentityAllowed,
} from "../../../src/lib/mobile-storefront-contract";
import type { PublicListing, PublicSeller } from "../../../src/lib/seller.functions";
import { storefrontDestination } from "../../../src/lib/storefront-url";
import { trackAdvertising } from "./advertising";
import { rememberNativeAuthDestination } from "./auth-destination";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { detailCard } from "./listing-card-data";
import { nativeListingDestination } from "./listing-links";
import { sendMessageOnce } from "./message-retries";
import { handleNativePublicLink } from "./public-links";
import { ListingTile } from "./ShopperExperience";
import { trackShopping } from "./shopping";
const Storefront = createContext<{
  owner?: string;
  slug: string;
  kind: "sellers" | "dealers";
  dealerMessagesReady: boolean;
  learning: boolean;
  listings: PublicDealerProfile["listings"];
}>({ slug: "", kind: "sellers", dealerMessagesReady: false, learning: false, listings: [] });
function NativeStorefrontLink({
  to,
  params,
  search,
  hash,
  onClick,
  ...props
}: StorefrontLinkProps) {
  let dest = nativeListingDestination(to, params, search);
  if (hash && dest) {
    const url = new URL(dest, "https://localhost");
    dest = storefrontDestination(url.pathname, Object.fromEntries(url.searchParams), hash);
  }
  return (
    <a
      {...props}
      href={dest ? "#" + dest : undefined}
      onClick={(event) => {
        if (to === "/auth") rememberNativeAuthDestination(location.hash.slice(1));
        onClick?.(event);
        if (!dest) event.preventDefault();
      }}
    />
  );
}
function NativeSellerListings({
  listings,
  showProduct,
}: {
  listings: PublicListing[];
  showProduct?: boolean;
}) {
  return (
    <SellerListingGridView
      listings={listings}
      showProduct={showProduct}
      Link={NativeStorefrontLink}
      onOpen={(listing) => {
        trackShopping("recommendation_click", listing.id, { placement: "seller:inventory" });
        location.hash = "/listings/" + encodeURIComponent(listing.id);
      }}
    />
  );
}
function NativeReviewForm({ sellerId, sellerSlug }: { sellerId: string; sellerSlug: string }) {
  const { owner } = useContext(Storefront);
  const actor = () => ({ userId: owner ?? null, installId: installIdentifier() });
  return (
    <SellerReviewFormView
      sellerId={sellerId}
      sellerSlug={sellerSlug}
      runtime={{
        getReview: () => api(`sellers/${sellerSlug}/review`, "GET", undefined, undefined, actor()),
        submitReview: (data) =>
          api(`sellers/${sellerSlug}/review`, "PUT", data, undefined, actor()),
      }}
    />
  );
}
function NativeReviewFlag({ reviewId }: { reviewId: string }) {
  const { owner, slug } = useContext(Storefront),
    actor = () => ({ userId: owner ?? null, installId: installIdentifier() });
  return (
    <SellerReviewFlagView
      reviewId={reviewId}
      onFlag={({ reason }) =>
        api(`sellers/${slug}/reviews/${reviewId}/report`, "POST", { reason }, undefined, actor())
      }
    />
  );
}
function NativeDealerContact(
  props: Omit<ComponentProps<typeof DealerContactPanelView>, "runtime">,
) {
  const { owner, slug, dealerMessagesReady } = useContext(Storefront);
  return (
    <DealerContactPanelView
      {...props}
      runtime={{
        isSignedIn: !!owner,
        userId: owner,
        ready: dealerMessagesReady,
        Link: NativeStorefrontLink,
        onSend: ({ body }) => {
          if (!owner) throw Error("Sign in to message this dealership.");
          return sendMessageOnce(owner, `dealers/${slug}/conversations`, { body });
        },
        onSent: () => {
          void trackAdvertising("seller_contacted", "cars-trucks");
          document.dispatchEvent(new Event("bluebird-inbox-changed"));
        },
      }}
    />
  );
}
function NoAdministration() {
  return null;
}
function NativeDealerHeader({ dealer }: { dealer: PublicDealerProfile }) {
  return (
    <DealerStorefrontHeaderView
      dealer={dealer}
      onAction={() => {}}
      ContactPanel={NativeDealerContact}
      AdminLink={NoAdministration}
    />
  );
}
function NativeDealerCard({ listing }: ComponentProps<typeof WebsiteListingCard>) {
  const { learning, listings } = useContext(Storefront);
  return (
    <ListingTile
      card={detailCard(listing)}
      position={Math.max(
        0,
        listings.findIndex((c) => c.id === listing.id),
      )}
      placement="dealer:inventory"
      learning={learning}
      onOpen={(id) => {
        location.hash = "/listings/" + id;
      }}
    />
  );
}
export function NativeStorefront({
  kind,
  slug,
  owner,
  ready,
  dealerMessagesReady,
  learning,
  revision,
}: {
  kind: "sellers" | "dealers";
  slug: string;
  owner?: string;
  ready: boolean;
  dealerMessagesReady: boolean;
  learning: boolean;
  revision: number;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <StorefrontPage {...{ kind, slug, owner, ready, dealerMessagesReady, learning, revision }} />
    </QueryClientProvider>
  );
}
function StorefrontPage({
  kind,
  slug,
  owner,
  ready,
  dealerMessagesReady,
  learning,
  revision,
}: ComponentProps<typeof NativeStorefront>) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const search = new URLSearchParams(hash.split("?")[1]),
    page = Number(search.get("page") ?? 1);
  const valid = !!storefrontDestination(`/${kind}/${slug}`, Object.fromEntries(search));
  const q = useQuery({
    queryKey: kind === "sellers" ? ["seller", slug, revision] : ["dealer", slug, page, revision],
    enabled: ready && valid,
    queryFn: async () => {
      const data = await api<PublicSeller | PublicDealerProfile>(
        `${kind}/${slug}${kind === "dealers" ? `?page=${page}` : ""}`,
        "GET",
        undefined,
        undefined,
        { userId: owner ?? null, installId: installIdentifier() },
      );
      if (kind === "sellers") {
        const seller = data as PublicSeller;
        if (!mobileStorefrontIdentityAllowed(seller.displayName, seller.bio))
          throw Error("This seller is unavailable in the app.");
        const safe = mobilePublicSeller(seller);
        safe.listings = safe.listings.filter((l) =>
          mobileListingAllowed({
            categorySlug: l.categorySlug,
            title: l.productName,
            description: l.note,
          }),
        );
        safe.activeListingCount = safe.listings.length;
        return safe;
      }
      const dealer = data as PublicDealerProfile;
      if (!mobileStorefrontIdentityAllowed(dealer.displayName, dealer.description))
        throw Error("This dealership is unavailable in the app.");
      const cards = dealer.listings.flatMap((c) => {
        const safe = mobileListingSummary(c);
        return safe ? [safe] : [];
      });
      if (cards.length !== dealer.listings.length)
        throw Error("Dealership inventory could not be verified. Please retry.");
      return mobilePublicDealer(dealer, cards);
    },
  });
  const inventorySection = search.get("section") === "dealer-inventory";
  useEffect(() => {
    if (q.data && inventorySection)
      document.getElementById("dealer-inventory")?.scrollIntoView({ block: "start" });
  }, [q.data, inventorySection, hash]);
  if (!ready || !valid || q.isError)
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10">
        <BluebirdEmptyState
          title={kind === "sellers" ? "Seller profile unavailable" : "Dealership unavailable"}
          description={
            !ready
              ? "Storefronts are temporarily unavailable. Please retry shortly."
              : !valid
                ? "This storefront link is unavailable."
                : q.error instanceof Error
                  ? q.error.message
                  : "This storefront could not be loaded."
          }
        >
          {ready && valid && (
            <button type="button" onClick={() => void q.refetch()} className="underline">
              Retry storefront
            </button>
          )}
          <a className="ml-4 underline" href="#/search">
            Browse listings
          </a>
        </BluebirdEmptyState>
      </div>
    );
  if (!q.data)
    return (
      <p role="status" className="p-5 text-sm text-muted-foreground">
        Loading {kind === "sellers" ? "seller profile" : "dealership"}…
      </p>
    );
  const listings = kind === "dealers" ? (q.data as PublicDealerProfile).listings : [];
  return (
    <Storefront.Provider value={{ owner, slug, kind, dealerMessagesReady, learning, listings }}>
      <div onClickCapture={handleNativePublicLink}>
        {kind === "sellers" ? (
          <SellerStorefrontView
            seller={q.data as PublicSeller}
            userId={owner}
            focusReview={search.get("review") === "true"}
            runtime={{
              Link: NativeStorefrontLink,
              Listings: NativeSellerListings,
              ReviewForm: NativeReviewForm,
              ReviewFlagButton: NativeReviewFlag,
              AdminLink: NoAdministration,
              pageElement: "article",
            }}
          />
        ) : (
          <DealerStorefrontView
            dealer={q.data as PublicDealerProfile}
            page={page}
            runtime={{
              Header: NativeDealerHeader,
              ListingCard: NativeDealerCard,
              Link: NativeStorefrontLink,
              pageElement: "article",
            }}
          />
        )}
      </div>
    </Storefront.Provider>
  );
}
