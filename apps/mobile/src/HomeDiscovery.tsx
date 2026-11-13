import { MarketplaceVehicleLeadHeader } from "../../../src/components/classifieds/MarketplaceVehicleLeadHeader";
import { selectDiscoveryCards } from "../../../src/lib/discovery-ranking";
import { ArrowRight } from "@phosphor-icons/react";
import { MarketplaceListingSection } from "../../../src/components/classifieds/MarketplaceListingSection";
import { CategoryArtwork } from "../../../src/components/classifieds/CategoryIcon";
import { allocateHomepageRows } from "../../../src/lib/homepage-initial-payload";
import type { ListingCardSummary } from "../../../src/lib/listing-card-summary";
import type { MobileHome } from "../../../src/lib/mobile-contract";
import { ListingSourceCredits } from "./ListingSourceCredits";
import { listingPresentation } from "./listing-presentation";
import { ListingTile } from "./ShopperExperience";

export function HomeDiscovery({
  home,
  learning,
  onBrowse,
  onOpen,
}: {
  home: MobileHome;
  learning: boolean;
  onBrowse: (category: string) => void;
  onOpen: (id: string) => void;
}) {
  const adapted = {
    motors: home.motors.map(listingPresentation),
    recent: home.recent.map(listingPresentation),
    totalActive: home.recent.length,
    categoryCounts: {},
  };
  const rows = allocateHomepageRows(adapted, {
    motors: adapted.motors.filter((c) => c.categorySlug === "cars-trucks"),
  });
  const originals = new Map([...home.motors, ...home.recent].map((card) => [card.id, card]));
  const sections: {
    title: string;
    eyebrow: string;
    category: string;
    cards: ListingCardSummary[];
  }[] = [
    {
      title: "New vehicle arrivals",
      eyebrow: "Bluebird motors",
      category: "cars-trucks",
      cards: rows.vehicleListings,
    },
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
      cards: rows.buyHomes,
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
      cards: rows.petListings,
    },
    {
      title: "More local finds",
      eyebrow: "Bluebird classifieds",
      category: "",
      cards: rows.feedStart.slice(0, 8),
    },
  ];
  const lead = selectDiscoveryCards(
    adapted.motors.filter((c) => c.categorySlug === "cars-trucks"),
    4,
  );
  return (
    <>
      <div className="homepage-featured-categories mt-5 grid grid-cols-2 gap-2.5 sm:gap-4">
        {[
          { slug: "pets", title: "Pets & adoption", tone: "bg-brand-blue/7" },
          { slug: "furniture", title: "Furniture & home", tone: "bg-brand-warm/10" },
        ].map((category) => (
          <button
            key={category.slug}
            onClick={() => onBrowse(category.slug)}
            className={`group flex min-w-0 items-center gap-3 rounded-[20px] border border-primary/15 p-3.5 text-left shadow-sm ${category.tone}`}
          >
            <CategoryArtwork slug={category.slug} size={40} />
            <span className="min-w-0 text-[15px] font-bold leading-tight">{category.title}</span>
            <ArrowRight size={14} className="ml-auto shrink-0" />
          </button>
        ))}
      </div>
      <section className="homepage-lead-vehicles mt-6 sm:mt-14">
        <MarketplaceVehicleLeadHeader
          action={
            <button
              onClick={() => onBrowse("cars-trucks")}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary"
            >
              All cars &amp; trucks <ArrowRight size={12} />
            </button>
          }
        />
        <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {lead.map((summary, position) => {
            const card = originals.get(summary.id);
            return card ? (
              <div key={card.id} className="min-w-[235px] lg:min-w-0">
                <ListingTile
                  card={card}
                  position={position}
                  placement="home:lead"
                  model="browse-v1"
                  learning={learning}
                  onOpen={onOpen}
                />
              </div>
            ) : null;
          })}
        </div>
        <ListingSourceCredits
          cards={lead.flatMap((summary) =>
            originals.get(summary.id) ? [originals.get(summary.id)!] : [],
          )}
        />
        {!lead.length && (
          <p className="mt-5 text-[13px] text-muted-foreground">
            Cars and trucks show up here as soon as Idaho sellers post them.
          </p>
        )}
      </section>
      {sections.map((section) => (
        <MarketplaceListingSection
          key={section.title}
          eyebrow={section.eyebrow}
          title={section.title}
          action={
            <button
              className="inline-flex min-h-11 shrink-0 items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary"
              onClick={() => onBrowse(section.category)}
            >
              See all <ArrowRight size={12} />
            </button>
          }
        >
          {section.cards.length ? (
            <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {section.cards.map((summary, position) => {
                const card = originals.get(summary.id);
                return card ? (
                  <div className="min-w-[235px] lg:min-w-0" key={card.id}>
                    <ListingTile
                      card={card}
                      position={position}
                      placement={`home:${section.title}`}
                      model="browse-v1"
                      learning={learning}
                      onOpen={onOpen}
                    />
                  </div>
                ) : null;
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border px-5 py-4 text-[13px] text-muted-foreground">
              Nothing here yet. New listings show up as soon as local sellers post them.
            </p>
          )}
          <ListingSourceCredits
            cards={section.cards.flatMap((summary) =>
              originals.get(summary.id) ? [originals.get(summary.id)!] : [],
            )}
          />
        </MarketplaceListingSection>
      ))}
    </>
  );
}
