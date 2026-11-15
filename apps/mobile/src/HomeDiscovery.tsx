import { selectDiscoveryCards } from "../../../src/lib/discovery-ranking";
import type { Search } from "../../../src/lib/browse-search";
import { ArrowRight } from "@phosphor-icons/react";
import { MarketplaceListingSection } from "../../../src/components/classifieds/MarketplaceListingSection";
import { allocateHomepageRows } from "../../../src/lib/homepage-initial-payload";
import type { ListingCardSummary } from "../../../src/lib/listing-card-summary";
import type { MobileHome } from "../../../src/lib/mobile-contract";
import {
  LogoDevCredit,
  PartnerJobsCredit,
} from "../../../src/components/classifieds/ListingCardView";
import { listingPresentation } from "./listing-presentation";
import { ListingTile } from "./ShopperExperience";
import { useEffect, useState } from "react";
import { api } from "./client";
import { refreshedHomeSelection } from "./home-refresh-selection";
import { varietyOfPets } from "../../../src/lib/pet-showcase";
import {
  mobileListingAllowed,
  type MobileBrowse,
  type MobileListing,
} from "../../../src/lib/mobile-contract";

export function HomeDiscovery({
  home,
  learning,
  onBrowse,
  onOpen,
  refreshSequence = 0,
}: {
  home: MobileHome;
  learning: boolean;
  refreshSequence?: number;
  onBrowse: (scope: Partial<Search>) => void;
  onOpen: (id: string) => void;
}) {
  const [cachedJobs, setCachedJobs] = useState<MobileListing[]>([]);
  const [jobsUnavailable, setJobsUnavailable] = useState(false);
  const [cachedPets, setCachedPets] = useState<MobileListing[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [petsUnavailable, setPetsUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (home.recent.some((card) => card.categorySlug === "pets" && card.display?.pet)) {
      setPetsLoading(false);
      setPetsUnavailable(false);
      setCachedPets([]);
      return;
    }
    setPetsLoading(true);
    setPetsUnavailable(false);
    // The Home snapshot can omit pets while the shared category search still
    // has eligible inventory. Reuse its cache-only Idaho/border rescue rules.
    api<MobileBrowse>("search?category=pets&state=ID&page=1", "GET", undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.items)) throw Error("Pets unavailable");
        setCachedPets(
          result.items.filter((card) => card.categorySlug === "pets" && mobileListingAllowed(card)),
        );
        setPetsUnavailable(result.incomplete === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPetsUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPetsLoading(false);
      });
    return () => controller.abort();
  }, [home]);
  useEffect(() => {
    const controller = new AbortController();
    setCachedJobs([]);
    setJobsUnavailable(false);
    if (home.recent.some((card) => card.categorySlug === "jobs")) return;
    // The snapshot may predate the current job cache. This existing search
    // contract reads purchased inventory only; it cannot refresh a provider.
    api<MobileBrowse>("search?category=jobs&state=ID&page=1", "GET", undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.items)) throw Error("Jobs unavailable");
        setCachedJobs(
          result.items.filter((card) => card.categorySlug === "jobs" && mobileListingAllowed(card)),
        );
        setJobsUnavailable(result.incomplete === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setJobsUnavailable(true);
      });
    return () => controller.abort();
  }, [home]);
  const recent = [
    ...new Map([...home.recent, ...cachedJobs].map((card) => [card.id, card])).values(),
  ];
  const selection = refreshedHomeSelection({ motors: home.motors, recent }, refreshSequence);
  const adapted = {
    motors: selection.motors.map(listingPresentation),
    recent: selection.recent.map(listingPresentation),
    totalActive: recent.length,
    categoryCounts: {},
  };
  const rows = allocateHomepageRows(adapted, {
    motors: adapted.motors.filter((c) => c.categorySlug === "cars-trucks"),
  });
  const originals = new Map(
    [...home.motors, ...recent, ...cachedPets].map((card) => [card.id, card]),
  );
  const sections: {
    title: string;
    eyebrow: string;
    category: string;
    scope?: Partial<Search>;
    cards: ListingCardSummary[];
  }[] = [
    {
      title: "Fresh local finds",
      eyebrow: "Bluebird classifieds",
      category: "",
      cards: rows.freshListings,
    },
    {
      title: "Homes for sale",
      eyebrow: "Bluebird homes",
      category: "other-real-estate",
      scope: { homeMode: "results", homeTab: "buy" },
      cards: rows.buyHomes,
    },
    {
      title: "New vehicle arrivals",
      eyebrow: "Bluebird motors",
      category: "cars-trucks",
      cards: rows.vehicleListings,
    },
    { title: "Local jobs", eyebrow: "Bluebird jobs", category: "jobs", cards: rows.jobRow },
    {
      title: "Local services",
      eyebrow: "Bluebird services",
      category: "services",
      cards: rows.serviceListings,
    },
    {
      title: "Pets & adoption",
      eyebrow: "Bluebird pets",
      category: "pets",
      cards: rows.petListings.length
        ? rows.petListings
        : varietyOfPets(cachedPets.map(listingPresentation), 4),
    },
    ...[
      { title: "Trucks & SUVs", category: "cars-trucks", cards: rows.truckListings },
      {
        title: "Vehicles for less",
        category: "cars-trucks",
        scope: { sort: "price_low" as const },
        cards: rows.valueVehicleListings,
      },
      {
        title: "Homes for rent",
        category: "other-real-estate",
        scope: { homeMode: "results" as const, homeTab: "rent" as const },
        cards: rows.rentalHomes,
      },
      {
        title: "New homes to explore",
        category: "other-real-estate",
        scope: { homeMode: "results" as const, homeTab: "build" as const },
        cards: rows.buildHomes,
      },
      { title: "Flexible work", category: "jobs", cards: rows.flexibleJobs },
      { title: "Help around the home", category: "services", cards: rows.homeServices },
      { title: "More from local sellers", category: "", cards: rows.generalListings },
      { title: "Toys & collectibles", category: "", cards: rows.toyAndCollectibleListings },
      { title: "Finds under $100", category: "", scope: { priceMax: 100 }, cards: rows.valueFinds },
      { title: "Local seller picks", category: "", cards: rows.localSellerPicks },
    ]
      .filter((row) => row.cards.length)
      .map((row) => ({ ...row, eyebrow: "" })),
    ...(rows.feedStart.length
      ? [{ title: "More local finds", eyebrow: "", category: "", cards: rows.feedStart }]
      : []),
  ];
  const lead = selectDiscoveryCards(
    adapted.motors.filter((c) => c.categorySlug === "cars-trucks"),
    4,
  );
  return (
    <>
      <MarketplaceListingSection
        className="native-home-section homepage-lead-vehicles"
        density="compact"
        eyebrow=""
        title="Vehicles"
        action={
          <button
            aria-label="See all vehicles"
            onClick={() => onBrowse({ category: "cars-trucks" })}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary"
          >
            See all <ArrowRight size={12} />
          </button>
        }
      >
        <div className="native-listing-rail no-scrollbar mt-2 flex gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {lead.map((summary, position) => {
            const card = originals.get(summary.id);
            return card ? (
              <div key={card.id} className="native-rail-card min-w-0 shrink-0">
                <ListingTile
                  density="compact"
                  card={card}
                  position={position}
                  placement="home:lead"
                  model="home-discovery-v2"
                  learning={learning}
                  onOpen={onOpen}
                />
              </div>
            ) : null;
          })}
        </div>
        {!lead.length && (
          <p className="mt-5 text-[13px] text-muted-foreground">
            Vehicles appear here as local sellers post them.
          </p>
        )}
      </MarketplaceListingSection>
      {sections.map((section) => (
        <MarketplaceListingSection
          key={section.title}
          className="native-home-section"
          density="compact"
          eyebrow={section.eyebrow}
          title={section.title}
          action={
            <button
              className="inline-flex min-h-11 shrink-0 items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary"
              onClick={() => onBrowse({ category: section.category, ...section.scope })}
            >
              See all <ArrowRight size={12} />
            </button>
          }
        >
          {section.cards.length ? (
            <div
              className={
                section.title === "More local finds"
                  ? "mt-2 grid grid-cols-2 gap-x-2.5 gap-y-4 lg:grid-cols-4"
                  : "native-listing-rail no-scrollbar mt-2 flex gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible"
              }
            >
              {section.cards.map((summary, position) => {
                const card = originals.get(summary.id);
                return card ? (
                  <div className="native-rail-card min-w-0 shrink-0" key={card.id}>
                    <ListingTile
                      density="compact"
                      card={card}
                      position={position}
                      placement={`home:${section.title}`}
                      model="home-discovery-v2"
                      learning={learning}
                      onOpen={onOpen}
                    />
                  </div>
                ) : null;
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border px-5 py-4 text-[13px] text-muted-foreground">
              {section.category === "jobs"
                ? jobsUnavailable
                  ? "Jobs are temporarily unavailable. Pull to refresh or try See all."
                  : "No jobs are available right now. Pull to refresh or try See all."
                : section.category === "pets"
                  ? petsLoading
                    ? "Loading pets…"
                    : petsUnavailable
                      ? "Pets are temporarily unavailable. Pull to refresh or try See all."
                      : "No pets are available right now. Try See all."
                  : "Nothing here yet. New listings show up as soon as local sellers post them."}
            </p>
          )}
        </MarketplaceListingSection>
      ))}
      <footer
        className="pb-6 pt-3 text-right text-[11px] text-muted-foreground"
        aria-label="Listing source credits"
      >
        <PartnerJobsCredit listings={adapted.recent} />
        {adapted.recent.some((card) => card.directory?.logoUrl) && <LogoDevCredit />}
      </footer>
    </>
  );
}
