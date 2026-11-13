import { VisualSimilarShopping } from "@/components/community/ShoppingExperience";
import { VehiclePriceInsight } from "@/components/dealers/VehiclePriceInsight";
import {
  ClaimBusinessPanelView,
  ClaimEmployerPanelView,
  FlagListingDialogView,
} from "@/components/listings/ListingDetailControlsView";
import {
  EndedListingBanner,
  listingDetailTitle,
  ListingDetailView,
  similarNoun,
} from "@/components/listings/ListingDetailView";
import type { DetailLinkProps } from "@/components/listings/listing-detail-runtime";
import { gunsComProfile } from "@/config/retailers";
import { shoppingTrack, trackActiveListing } from "@/lib/shopping-client";
import { dealerContactPriceLabel } from "@/lib/vehicle-shopping";
import { ArrowLeft, ArrowRight, CaretRight } from "@phosphor-icons/react";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { ListingActions } from "@/components/classifieds/ListingActions";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { MobileContactBar } from "@/components/classifieds/MobileContactBar";
import { PartnerHomeHeartButton } from "@/components/community/PartnerHomeHeartButton";
import { PartnerJobHeartButton } from "@/components/community/PartnerJobHeartButton";
import { PartnerVehicleHeartButton } from "@/components/community/PartnerVehicleHeartButton";
import { WatchHeartButton } from "@/components/community/WatchHeartButton";
import { AdminBusinessPerformanceLink } from "@/components/dealers/AdminBusinessPerformanceLink";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent, trackSellerContact } from "@/lib/analytics";
import { trackBusinessAnchor } from "@/lib/business-analytics";
import { rememberListingBusiness } from "@/lib/business-context";
import { adoptionPriceLabel, formatClassifiedPrice, formatJobPay } from "@/lib/classifieds-display";
import type { ClassifiedCard, ClassifiedDetail } from "@/lib/classifieds.functions";
import {
  getClassifiedListing,
  getEndedClassifiedListing,
  getRelatedClassifieds,
  reportClassifiedListing,
} from "@/lib/classifieds.functions";
import { claimEmployer, getMyEmployerClaim } from "@/lib/employer-claims.functions";
import { listingPhotoUrl } from "@/lib/listing-photo-url";
import { recordListingView } from "@/lib/listing-stats.functions";
import { listingIdFromParam, listingParam, listingPath } from "@/lib/listing-url";
import { canonicalMarketCheckId } from "@/lib/marketcheck-contract";
import { isIndexablePartnerDetail } from "@/lib/partner-seo";
import { getRemovedListingBrowsePath } from "@/lib/place-pages.functions";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";
import { isSeoTestListing, socialImageMeta } from "@/lib/seo-policy";
import { claimServiceBusiness, getMyServiceClaim } from "@/lib/service-claims.functions";
import { jsonLdScript, listingStructuredData } from "@/lib/structured-data";

const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["classified-listing", id],
    staleTime: PUBLIC_PAGE_STALE_MS,
    // A sold or expired listing keeps a read-only page for a while.
    queryFn: async () =>
      (await getClassifiedListing({ data: { id } })) ??
      (await getEndedClassifiedListing({ data: { id } })),
  });

async function copyListingUrl(url: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fall through to the legacy clipboard path for embedded browsers and
    // contexts where the Clipboard API is present but permission is denied.
  }

  if (typeof document === "undefined") return false;

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

export const Route = createFileRoute("/listings/$listingId")({
  loader: async ({ context, params }) => {
    // Historical warm-cache rows generated repeated dealer prefixes. Redirect
    // before querying the listing so the old URL cannot spend a provider call.
    const canonicalMarketCheckIdValue = canonicalMarketCheckId(params.listingId);
    if (canonicalMarketCheckIdValue && canonicalMarketCheckIdValue !== params.listingId) {
      throw redirect({
        to: "/listings/$listingId",
        params: { listingId: canonicalMarketCheckIdValue },
        statusCode: 301,
      });
    }
    const listingId = listingIdFromParam(params.listingId);
    const listing = await context.queryClient.ensureQueryData(listingQuery(listingId));
    if (!listing) {
      // A category is useful onward navigation, not a replacement for this
      // removed item. Keep a real 404 and offer the category as a link.
      const browseHref =
        listingId.startsWith("mashvisor-") || listingId.startsWith("openwebninja-")
          ? "/browse?category=other-real-estate"
          : listingId.startsWith("fsq-")
            ? "/browse?category=services"
            : listingId.startsWith("adzuna-")
              ? "/browse?category=jobs"
              : await getRemovedListingBrowsePath({ data: { id: listingId } });
      throw notFound({ data: { browseHref } });
    }
    // One URL per listing: bare-ID and outdated-title URLs redirect to it.
    const canonicalParam = listingParam(listing);
    if (params.listingId !== canonicalParam) {
      throw redirect({
        to: "/listings/$listingId",
        params: { listingId: canonicalParam },
        statusCode: 301,
      });
    }
    return {
      title: listing.title,
      // Directory businesses read "Knight Plumbing — Plumbers in Nampa".
      priceLabel: listing.directory
        ? (listing.service?.subcategory ?? "Local business")
        : listing.job
          ? formatJobPay(listing.job)
          : (listing.service?.pricing ??
            dealerContactPriceLabel(listing) ??
            adoptionPriceLabel(listing) ??
            formatClassifiedPrice(listing.priceCents, {
              wholeDollars: Boolean(listing.vehicle || listing.home),
              monthly: listing.home?.mode === "rent",
            })),
      city: listing.city,
      state: listing.state,
      ended: listing.ended?.reason ?? null,
      shareImage: listingPhotoUrl(listing),
      leadImage: listing.images[0]?.url,
      // Rich, recently verified directory facts may be useful search results.
      // Truncated jobs and affiliate copies remain followed/noindex.
      external: !isIndexablePartnerDetail(listing),
      onlineRetailer: Boolean(listing.externalMerchandise),
      structuredData:
        listing.externalJob || listing.directory || listing.externalMerchandise
          ? []
          : listingStructuredData(listing),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: `Listing unavailable — ${brand.name}` },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const endedLabel =
      loaderData.ended === "sold" ? "Sold" : loaderData.ended === "expired" ? "Expired" : null;
    const title = loaderData.onlineRetailer
      ? `${loaderData.title} — ${loaderData.priceLabel} | ${brand.name}`
      : endedLabel
        ? `${loaderData.title} (${endedLabel}) in ${loaderData.city}, ${loaderData.state}`
        : `${loaderData.title} — ${loaderData.priceLabel} in ${loaderData.city}, ${loaderData.state}`;
    const description = loaderData.onlineRetailer
      ? `${loaderData.title}, listed by ${gunsComProfile.name} for ${loaderData.priceLabel} on ${brand.name}.`
      : endedLabel
        ? `${loaderData.title} in ${loaderData.city}, ${loaderData.state} is no longer available. See similar listings from local sellers on ${brand.name}.`
        : `${loaderData.title} listed for ${loaderData.priceLabel} by a seller in ${loaderData.city}, ${loaderData.state} on ${brand.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(isSeoTestListing(loaderData.title)
          ? [{ name: "robots", content: "noindex, nofollow" }]
          : loaderData.external || loaderData.ended
            ? [{ name: "robots", content: "noindex, follow" }]
            : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...socialImageMeta(brand.urls.siteUrl, loaderData.shareImage, loaderData.title),
      ],
      scripts: loaderData.structuredData.length ? [jsonLdScript(loaderData.structuredData)] : [],
      // Discover the exact gallery resource before hydration, without a second photo URL.
      links: loaderData.leadImage
        ? [{ rel: "preload", as: "image", href: loaderData.leadImage, fetchPriority: "high" }]
        : [],
    };
  },
  component: ListingDetail,
  notFoundComponent: ListingMissing,
});

function ListingMissing({ data }: { data?: unknown }) {
  const candidate =
    data && typeof data === "object" && "browseHref" in data ? data.browseHref : null;
  const browseHref =
    typeof candidate === "string" &&
    (/^\/idaho\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(candidate) ||
      /^\/browse(?:\?category=[a-z0-9-]+)?$/.test(candidate))
      ? candidate
      : "/browse";
  return (
    <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
      <BluebirdEmptyState
        title="This listing is no longer live"
        description="It may have sold, expired, or been removed by the seller."
      >
        <a
          href={browseHref}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
        >
          {browseHref === "/browse" ? "Browse all listings" : "Browse similar listings"}
        </a>
      </BluebirdEmptyState>
    </main>
  );
}

const STATS_LISTING_ID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|avantlink-\d{1,20}|adzuna-\d{1,20}|mashvisor-\d{1,15}|openwebninja-(?:redfin-)?\d{1,20}|marketcheck-(?:dealer|fsbo)-[A-Za-z0-9._:-]{1,160}|dealerfeed-[0-9a-f-]{36}|fsq-[0-9a-f]{24})$/;

/** Records this page view and returns views and saves; one request per page. */
function useListingStats(listing: ClassifiedDetail) {
  const record = useServerFn(recordListingView);
  return useQuery({
    queryKey: ["listing-stats", listing.id],
    queryFn: () => record({ data: { listingId: listing.id } }),
    enabled: !listing.isMock && STATS_LISTING_ID.test(listing.id),
    staleTime: 60_000,
  });
}

function ListingDetail() {
  const listingId = listingIdFromParam(Route.useParams().listingId);
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  // One view per listing page load, tagged with where the visit came from.
  // The ref keeps React's development double-run of effects from counting twice.
  const trackedListing = useRef<string | null>(null);
  useEffect(() => {
    if (!listing || trackedListing.current === listing.id) return;
    trackedListing.current = listing.id;
    rememberListingBusiness(listing);
    void trackEvent(
      "listing_viewed",
      {
        listing_id: listing.id,
        category: listing.categorySlug ?? null,
        ended: Boolean(listing.ended),
      },
      { isDemo: listing.isMock === true },
    );
  }, [listing?.id]);
  useEffect(
    () =>
      listing && !listing.isMock && !listing.ended ? trackActiveListing(listing.id) : undefined,
    [listing?.id],
  );
  // Related suggestions must not suspend the primary listing during hydration.
  const relatedQuery = useQuery(
    queryOptions({
      staleTime: PUBLIC_PAGE_STALE_MS,
      queryKey: [
        "classified-related",
        listingId,
        listing?.categorySlug,
        listing?.seller?.slug,
        listing?.region,
      ],
      queryFn: () =>
        getRelatedClassifieds({
          data: {
            excludeId: listingId,
            ...(listing?.home
              ? {
                  homeReference: {
                    title: listing.title,
                    city: listing.city,
                    priceCents: listing.priceCents,
                    mode: listing.home.mode,
                    bedrooms: listing.home.bedrooms,
                    squareFeet: listing.home.squareFeet,
                  },
                }
              : {}),
            ...(listing?.categorySlug ? { category: listing.categorySlug } : {}),
            ...(listing?.seller?.slug ? { sellerSlug: listing.seller.slug } : {}),
            ...(listing?.region ? { region: listing.region } : {}),
            ...(listing?.state ? { state: listing.state } : {}),
          },
        }),
    }),
  );
  return (
    <div
      className="contents"
      onClickCapture={(event) => {
        if (listing) trackBusinessAnchor(event, listing);
      }}
    >
      {listing?.ended ? <EndedListingBanner listing={listing} /> : null}
      <ListingDetailContent />
      {listing ? (
        <RelatedRails
          listing={listing}
          fromSeller={relatedQuery.data?.fromSeller ?? []}
          similar={relatedQuery.data?.similar ?? []}
          moreHomes={relatedQuery.data?.moreHomes ?? []}
        />
      ) : null}
      {listing ? <MobileContactBar listing={listing} /> : null}
    </div>
  );
}

function HomeRecommendationRail({
  title,
  subtitle,
  items,
  action,
}: {
  title: string;
  subtitle: string;
  items: ClassifiedCard[];
  action: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <section className="border-t border-border/70 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[23px] font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {action}
          <div className="flex gap-2">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                aria-label={`${direction < 0 ? "Previous" : "Next"} ${title.toLowerCase()}`}
                onClick={() =>
                  scroller.current?.scrollBy({
                    left: direction * scroller.current.clientWidth * 0.85,
                    behavior: "smooth",
                  })
                }
                className="grid size-9 place-items-center rounded-full border border-border bg-card text-primary transition hover:bg-secondary"
              >
                {direction < 0 ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3"
      >
        {items.map((related) => (
          <div key={related.id} className="w-[245px] shrink-0 snap-start sm:w-[270px]">
            <ListingCard listing={related} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Two rails under every listing type, so a shopper who isn't sold on this
// item has an obvious next step instead of a dead end.
function RelatedRails({
  listing,
  fromSeller,
  similar,
  moreHomes,
}: {
  listing: ClassifiedDetail;
  fromSeller: ClassifiedCard[];
  similar: ClassifiedCard[];
  moreHomes: ClassifiedCard[];
}) {
  if (!fromSeller.length && !similar.length && !moreHomes.length) return null;
  const sellerName = listing.seller?.displayName;
  const rail = (title: string, subtitle: string, items: ClassifiedCard[], href: ReactNode) =>
    listing.home ? (
      <HomeRecommendationRail title={title} subtitle={subtitle} items={items} action={href} />
    ) : (
      <section className="border-t border-border/70 pt-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[23px] font-bold tracking-tight">{title}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          </div>
          {href}
        </div>
        <div className="no-scrollbar mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
          {items.map((related) => (
            <div key={related.id} className="w-[220px] shrink-0 snap-start sm:w-[260px]">
              <ListingCard listing={related} />
            </div>
          ))}
        </div>
      </section>
    );
  const seeAll =
    "inline-flex min-h-11 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline";
  return (
    <div className="mx-auto max-w-[1360px] space-y-10 px-4 pb-14 sm:px-7 lg:px-10">
      {fromSeller.length > 0 && listing.seller
        ? rail(
            `More from ${sellerName ?? "this seller"}`,
            "Other listings from the same seller",
            fromSeller,
            <Link to="/sellers/$slug" params={{ slug: listing.seller.slug }} className={seeAll}>
              View all <CaretRight size={15} />
            </Link>,
          )
        : null}
      <VisualSimilarShopping listingId={listing.id} />
      {similar.length > 0
        ? rail(
            listing.externalMerchandise
              ? "Related listings"
              : listing.home
                ? "Similar homes"
                : `Similar ${similarNoun(listing)} near you`,
            listing.externalMerchandise
              ? `More ${listing.categoryName ?? "listings"}`
              : listing.home
                ? `Homes to consider in ${listing.city} and across ${listing.state}`
                : `More ${listing.categoryName ?? "listings"} around ${listing.region || listing.state}`,
            similar,
            <Link
              to="/browse"
              search={{
                ...(listing.categorySlug ? { category: listing.categorySlug } : {}),
                ...(listing.home
                  ? { homeTab: listing.home.mode, homeMode: "results" as const }
                  : {}),
                ...(!listing.externalMerchandise
                  ? listing.region
                    ? { region: listing.region }
                    : { state: listing.state }
                  : {}),
              }}
              className={seeAll}
            >
              View all <CaretRight size={15} />
            </Link>,
          )
        : null}
      {listing.home && moreHomes.length
        ? rail(
            "More homes to explore",
            "More available homes, with the same sale or rental search",
            moreHomes,
            <Link
              to="/browse"
              search={{
                category: "other-real-estate",
                homeTab: listing.home.mode,
                homeMode: "results",
                state: listing.state,
              }}
              className={seeAll}
            >
              Browse homes <CaretRight size={15} />
            </Link>,
          )
        : null}
    </div>
  );
}

function ListingDetailContent() {
  const listingId = listingIdFromParam(Route.useParams().listingId);
  const { data: listing } = useSuspenseQuery(listingQuery(listingId));
  if (!listing) return <ListingMissing />;
  return <WebsiteListingDetail listing={listing} />;
}
function WebsiteListingDetail({ listing }: { listing: ClassifiedDetail }) {
  const stats = useListingStats(listing).data;
  const title = listingDetailTitle(listing);
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${listingPath(listing)}`;

    try {
      if (typeof navigator.share === "function") {
        toast.info("Opening share options…");
        const shareAttempt = navigator
          .share({
            title,
            text: `Check out ${title} on ${brand.name}`,
            url: shareUrl,
          })
          .then(() => "shared" as const)
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError")
              return "aborted" as const;
            return "fallback" as const;
          });
        const shareResult = await Promise.race([
          shareAttempt,
          new Promise<"fallback">((resolve) => window.setTimeout(() => resolve("fallback"), 1200)),
        ]);
        if (shareResult === "shared") {
          toast.success("Share sheet opened.");
          return;
        }
        if (shareResult === "aborted") {
          toast.info("Share canceled.");
          return;
        }
      }

      if (await copyListingUrl(shareUrl)) {
        toast.success("Listing link copied.");
        return;
      }
      toast.error("Sharing is not available in this browser.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("We could not share this listing.");
    }
  };

  return (
    <ListingDetailView
      listing={listing}
      handleShare={handleShare}
      runtime={{
        Link: WebsiteDetailLink,
        ListingActions,
        VehiclePriceInsight,
        ListingCard,
        PartnerHomeHeartButton,
        PartnerJobHeartButton,
        PartnerVehicleHeartButton,
        WatchHeartButton,
        AdminBusinessPerformanceLink,
        FlagListingDialog,
        ClaimEmployerPanel,
        ClaimBusinessPanel,
        stats,
        onPhoto: (photo) => shoppingTrack("photo", listing.id, { photo }),
        onContact: trackSellerContact,
        onPrint: () => window.print(),
      }}
    />
  );
}
function WebsiteDetailLink({ to, search, params, ...props }: DetailLinkProps) {
  return <Link to={to as "/browse"} search={search as never} params={params as never} {...props} />;
}

function FlagListingDialog(props: { listingId: string; isMock?: boolean }) {
  const { isSignedIn } = useAuth();
  const report = useServerFn(reportClassifiedListing);
  return (
    <FlagListingDialogView
      {...props}
      isSignedIn={isSignedIn}
      onReport={(data) => report({ data })}
      renderLink={WebsiteDetailLink}
    />
  );
}
function ClaimEmployerPanel({
  listing,
  employerName,
}: {
  listing: ClassifiedDetail;
  employerName: string;
}) {
  const { isSignedIn } = useAuth(),
    get = useServerFn(getMyEmployerClaim),
    submit = useServerFn(claimEmployer);
  return (
    <ClaimEmployerPanelView
      listing={listing}
      employerName={employerName}
      runtime={{
        isSignedIn,
        getClaim: () => get({ data: { employerName } }),
        submitClaim: (data) =>
          submit({
            data: { ...data, employerName, city: listing.city, state: listing.state ?? "" },
          }),
        renderLink: WebsiteDetailLink,
      }}
    />
  );
}
function ClaimBusinessPanel({ listing }: { listing: ClassifiedDetail }) {
  const { isSignedIn } = useAuth(),
    get = useServerFn(getMyServiceClaim),
    submit = useServerFn(claimServiceBusiness);
  return (
    <ClaimBusinessPanelView
      listing={listing}
      runtime={{
        isSignedIn,
        getClaim: () => get({ data: { directoryId: listing.id } }),
        submitClaim: (data) => submit({ data: { ...data, directoryId: listing.id } }),
        renderLink: WebsiteDetailLink,
      }}
    />
  );
}
