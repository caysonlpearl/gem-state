import { ArrowRight, PlusCircle } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ListingCard,
  PartnerHomesCredit,
  PartnerJobsCredit,
  PartnerVehiclesCredit,
} from "@/components/classifieds/ListingCard";
import { useHydrated } from "@/hooks/useHydrated";
import { editorialDestinations } from "@/lib/editorial-contract";
import { getNewsRelatedListings } from "@/lib/editorial.functions";
import { trackEvent } from "@/lib/analytics";

type Scope = {
  articleId: string;
  categorySlugs?: readonly string[];
  city?: string | null;
  state?: "ID" | "UT";
  collectionSlug?: string | null;
};
function trackEditorialClick(
  articleId: string,
  placement: string,
  category: string,
  destination: string,
) {
  if (articleId === "preview") return;
  const attribution = { article: articleId, placement, category, at: Date.now() };
  try {
    sessionStorage.setItem("bluebird_editorial_origin", JSON.stringify(attribution));
    // Record on the destination so normal anchor navigation cannot cancel the
    // asynchronous analytics request when the old document unloads.
    sessionStorage.setItem(
      "bluebird_editorial_pending_click",
      JSON.stringify({ ...attribution, destination }),
    );
  } catch {
    void trackEvent("media_cta_clicked", { article: articleId, placement, category, destination });
  }
}
export function EditorialReadTracker({
  articleId,
  topic = "guides",
}: {
  articleId: string;
  topic?: string;
}) {
  const seen = useRef("");
  useEffect(() => {
    if (seen.current !== articleId) {
      seen.current = articleId;
      void trackEvent("media_article_viewed", { article: articleId, topic });
    }
  }, [articleId, topic]);
  return null;
}
export function EditorialCta({
  articleId,
  categorySlugs = [],
  city = null,
  state = "ID",
  collectionSlug = null,
  placement,
  compact = false,
}: Scope & { placement: string; compact?: boolean }) {
  const destinations = editorialDestinations(categorySlugs, city, state, collectionSlug);
  return (
    <aside
      aria-label="Explore Bluebird classifieds"
      className={`not-prose rounded-2xl border border-primary/15 bg-primary/[0.045] ${compact ? "px-5 py-4" : "p-5 sm:p-7"}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">
        Find it on Bluebird
      </p>
      {!compact && (
        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Your next find could be right here.
        </h2>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {destinations.slice(0, 4).map((destination, index) => (
          <a
            key={destination.href}
            href={destination.href}
            onClick={() =>
              trackEditorialClick(articleId, placement, destination.category, destination.href)
            }
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition ${index === 0 ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-primary/20 bg-card text-primary hover:border-primary"}`}
          >
            {destination.label}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        ))}
        <a
          href="/sell"
          onClick={() => trackEditorialClick(articleId, placement, "", "/sell")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90"
        >
          <PlusCircle size={16} aria-hidden="true" />
          Post a listing
        </a>
      </div>
    </aside>
  );
}
export function EditorialRelatedListings(props: Scope) {
  const hydrated = useHydrated();
  return hydrated ? <HydratedRelatedListings {...props} /> : null;
}
function HydratedRelatedListings({
  articleId,
  categorySlugs = [],
  city = null,
  state = "ID",
  collectionSlug = null,
}: Scope) {
  const getRelated = useServerFn(getNewsRelatedListings);
  const query = useQuery({
    queryKey: ["editorial-related", categorySlugs, city, state, collectionSlug],
    queryFn: () =>
      getRelated({ data: { categorySlugs: [...categorySlugs], city, state, collectionSlug } }),
    staleTime: 60_000,
    retry: false,
  });
  const listings = query.data || [];
  if (!listings.length) return null;
  return (
    <section className="mt-10 border-t border-border pt-7" aria-label="Related classified listings">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            From the classifieds
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Explore related listings</h2>
        </div>
        <a
          href={editorialDestinations(categorySlugs, city, state, collectionSlug)[0].href}
          className="text-sm font-semibold text-primary"
          onClick={(event) =>
            trackEditorialClick(
              articleId,
              "related_browse",
              categorySlugs[0] || "",
              event.currentTarget.getAttribute("href") || "/browse",
            )
          }
        >
          Browse more listings →
        </a>
      </div>
      <div
        className="grid grid-cols-1 gap-4 min-[460px]:grid-cols-2 lg:grid-cols-4"
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
            'a[href*="/listings/"]',
          );
          if (link)
            trackEditorialClick(
              articleId,
              "related_listing",
              categorySlugs[0] || "",
              link.getAttribute("href") || "",
            );
        }}
      >
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
      <PartnerJobsCredit listings={listings} />
      <PartnerHomesCredit listings={listings} />
      <PartnerVehiclesCredit listings={listings} />
    </section>
  );
}
