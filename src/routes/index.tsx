import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowRight } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import earsPhoto from "@/assets/categories/category-ears.jpg.asset.json";
import apparelPhoto from "@/assets/categories/category-apparel.jpg.asset.json";
import bagsPhoto from "@/assets/categories/category-bags.jpg.asset.json";
import plushPhoto from "@/assets/categories/category-plush.jpg.asset.json";
import pinsPhoto from "@/assets/categories/category-pins-pirate.jpg.asset.json";
import sipperPhoto from "@/assets/categories/category-drinkware.jpg.asset.json";
import toteAsset from "@/assets/disneyland-canvas-tote.png.asset.json";
import batEarsAsset from "@/assets/halloween-bat-ears.png.asset.json";

const categoryPhotos: Record<string, { src: string; alt: string; fit?: "contain" }> = {
  "ears-headwear": { src: earsPhoto.url, alt: "Sparkling pink ear headband held up in a park" },
  apparel: { src: apparelPhoto.url, alt: "Cream ballgown-style park dress on a hanger" },
  bags: { src: bagsPhoto.url, alt: "Character mini backpack on grass" },
  plush: { src: plushPhoto.url, alt: "Row of small blue character plush keychains" },
  pins: {
    src: pinsPhoto.url,
    alt: "Collectible parrot trading pin held up inside a park pin shop",
  },
  "popcorn-buckets-sippers": {
    src: sipperPhoto.url,
    alt: "Light-up honey pot novelty sipper with a bear topper",
  },
};
import { getHomeSections, type MarketCard, type ProductCard } from "@/lib/catalog.functions";
import { CatalogCard, MarketRowCard } from "@/components/catalog/ProductCard";
import { trackEvent } from "@/lib/analytics";

const homeQuery = queryOptions({
  queryKey: ["home-sections"],
  queryFn: () => getHomeSections(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${brand.name} — The market for Disney Parks merchandise` },
      {
        name: "description",
        content:
          "Browse Walt Disney World and Disneyland Resort merchandise. Compare in-hand listings, offers and fixed-price park sourcing options on one canonical product page.",
      },
      { property: "og:title", content: `${brand.name} — Disney Parks merchandise marketplace` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${brand.urls.siteUrl}${toteAsset.url}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${brand.urls.siteUrl}${toteAsset.url}` },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeQuery);
  },
  component: Home,
});

function Shelf({
  title,
  description,
  children,
  count,
  seeAll,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  count: number;
  seeAll?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="mt-11">
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-editorial text-[26px] font-normal leading-none tracking-[-0.025em]">
            {title}
          </h2>
          {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
        </div>
        {seeAll}
      </div>
      <div className="no-scrollbar mt-4 grid auto-cols-[205px] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[225px] lg:auto-cols-[240px]">
        {children}
      </div>
    </section>
  );
}

function TopTenShelf({ products }: { products?: ProductCard[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const draggingRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const dragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();

    const advance = (currentTime: number) => {
      const viewport = viewportRef.current;
      const elapsedSeconds = Math.min((currentTime - previousTime) / 1000, 0.1);
      previousTime = currentTime;

      if (
        viewport &&
        !hoveredRef.current &&
        !focusedRef.current &&
        !draggingRef.current
      ) {
        const loopWidth = viewport.scrollWidth / 2;
        scrollPositionRef.current += elapsedSeconds * 24;
        if (loopWidth > 0 && scrollPositionRef.current >= loopWidth) {
          scrollPositionRef.current -= loopWidth;
        }
        viewport.scrollLeft = scrollPositionRef.current;
      }

      animationFrame = requestAnimationFrame(advance);
    };

    animationFrame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animationFrame);
  }, [products]);

  if (!products || products.length === 0) return null;

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || dragRef.current.pointerId !== event.pointerId) return;

    draggingRef.current = false;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const loopWidth = event.currentTarget.scrollWidth / 2;
    if (loopWidth > 0 && event.currentTarget.scrollLeft >= loopWidth) {
      event.currentTarget.scrollLeft -= loopWidth;
    }
    scrollPositionRef.current = event.currentTarget.scrollLeft;
  };

  const productSet = (isClone: boolean) => (
    <div
      className="top-ten-marquee-set"
      aria-hidden={isClone ? true : undefined}
      inert={isClone ? true : undefined}
    >
      {products.map((product, index) => (
        <div
          key={`${isClone ? "clone" : "primary"}-${product.id}`}
          className={`top-ten-item${index + 1 >= 10 ? " is-wide" : ""}`}
        >
          <span className="top-ten-rank" aria-hidden="true">
            {index + 1}
          </span>
          <div className="top-ten-card">
            <CatalogCard
              product={product}
              action={
                <span className="border border-brand-warm bg-card/95 px-1.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-brand-warm shadow-sm">
                  Top 10
                </span>
              }
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section
      className="mt-11 overflow-hidden border-2 border-primary bg-card shadow-[6px_6px_0_0_var(--color-brand-warm)]"
      aria-labelledby="top-ten-heading"
    >
      <div className="flex flex-col gap-2 border-b border-primary/25 bg-primary px-5 py-4 text-primary-foreground sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-warm">
            ParkVault weekly chart
          </p>
          <h2
            id="top-ten-heading"
            className="mt-1 font-editorial text-[29px] font-normal leading-none tracking-[-0.03em]"
          >
            Top 10 items this week
          </h2>
        </div>
        <p className="text-[11px] text-primary-foreground/70">Trending across the marketplace</p>
      </div>
      <div
        ref={viewportRef}
        className={`top-ten-marquee-viewport no-scrollbar py-5${isDragging ? " is-dragging" : ""}`}
        aria-label="Top 10 items this week. Automatically scrolling; drag horizontally to browse."
        onMouseEnter={() => {
          hoveredRef.current = true;
        }}
        onMouseLeave={() => {
          hoveredRef.current = false;
          scrollPositionRef.current = viewportRef.current?.scrollLeft ?? 0;
        }}
        onFocusCapture={() => {
          focusedRef.current = true;
        }}
        onBlurCapture={(event) => {
          focusedRef.current = event.currentTarget.contains(event.relatedTarget as Node | null);
          scrollPositionRef.current = event.currentTarget.scrollLeft;
        }}
        onTouchStart={() => {
          draggingRef.current = true;
        }}
        onTouchEnd={(event) => {
          const viewport = event.currentTarget;
          window.setTimeout(() => {
            const loopWidth = viewport.scrollWidth / 2;
            if (loopWidth > 0 && viewport.scrollLeft >= loopWidth) {
              viewport.scrollLeft -= loopWidth;
            }
            scrollPositionRef.current = viewport.scrollLeft;
            draggingRef.current = false;
          }, 2500);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          draggingRef.current = true;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startScrollLeft: event.currentTarget.scrollLeft,
            moved: false,
          };
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current || dragRef.current.pointerId !== event.pointerId) return;
          const distance = event.clientX - dragRef.current.startX;
          if (Math.abs(distance) > 4) dragRef.current.moved = true;
          if (dragRef.current.moved) event.preventDefault();
          event.currentTarget.scrollLeft = dragRef.current.startScrollLeft - distance * 1.35;
          scrollPositionRef.current = event.currentTarget.scrollLeft;
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={(event) => {
          if (!dragRef.current.moved) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current.moved = false;
        }}
      >
        <div className="top-ten-marquee-track">
          {productSet(false)}
          {productSet(true)}
        </div>
      </div>
    </section>
  );
}

const seeAllClass =
  "inline-flex shrink-0 items-center gap-1 border-b border-primary/35 pb-0.5 text-[12px] font-medium text-primary transition-colors hover:border-brand-warm hover:text-brand-warm";

function Home() {
  const { data: home } = useSuspenseQuery(homeQuery);

  useEffect(() => {
    void trackEvent("page_view", { route: "/" });
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-8">
      <section className="relative mt-6 overflow-hidden bg-primary text-primary-foreground">
        <div className="relative min-h-[350px]">
          <div className="relative z-10 flex flex-col justify-center px-7 py-10 sm:px-11 lg:max-w-[52%] lg:py-12">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-brand-warm">
              Walt Disney World &amp; Disneyland Resort
            </p>
            <h1 className="mt-3 max-w-[18ch] font-editorial text-[39px] font-normal leading-[1.01] tracking-[-0.04em] sm:text-[52px]">
              The park merch you couldn&apos;t get, all in one place.
            </h1>
            <p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-primary-foreground/75 sm:text-[14px]">
              Find the exact item, compare active listings and buy from someone who has it—or ask an
              approved park shopper to find for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/browse"
                search={{}}
                className="inline-flex items-center gap-1 bg-primary-foreground px-4 py-2.5 text-[12.5px] font-semibold text-primary"
              >
                Shop all merchandise <ArrowRight size={13} />
              </Link>
              <Link
                to="/suggest"
                className="inline-flex items-center gap-1 border border-primary-foreground/45 px-4 py-2.5 text-[12.5px] font-medium"
              >
                Request an item
              </Link>
            </div>
          </div>
          <div className="relative h-[285px] w-full transform-gpu [backface-visibility:hidden] lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[50%]">
            <div className="absolute inset-5 hidden rounded-full bg-[#f4ecdf]/8 blur-2xl lg:block" />
            <img
              src="/images/products/launch-10/cutouts/hatbox-ghost.png"
              alt="Hatbox Ghost popcorn bucket"
              className="absolute bottom-[-5%] left-[2%] z-20 h-[95%] w-auto origin-bottom -rotate-[14deg] object-contain drop-shadow-[0_24px_28px_rgba(0,0,0,0.28)] motion-safe:transition-transform motion-safe:duration-500"
            />
            <img
              src={batEarsAsset.url}
              alt="Glow-in-the-dark Halloween bat ear headband"
              className="absolute bottom-[42%] left-1/2 z-30 h-[50%] w-auto -translate-x-1/2 rotate-[3deg] object-contain drop-shadow-[0_16px_20px_rgba(0,0,0,0.28)] motion-safe:transition-transform motion-safe:duration-500"
            />
            <img
              src={toteAsset.url}
              alt="Disneyland canvas tote bag with park land patches"
              className="absolute bottom-[0%] right-[2%] z-10 h-[82%] w-auto origin-bottom rotate-[12deg] object-contain drop-shadow-[0_20px_24px_rgba(0,0,0,0.3)] motion-safe:transition-transform motion-safe:duration-500"
            />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-brand-warm">
              Start with what you collect
            </p>
            <h2 className="mt-1 font-editorial text-[28px] font-normal tracking-[-0.025em]">
              Shop by category
            </h2>
          </div>
          <Link to="/browse" search={{}} className={seeAllClass}>
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="no-scrollbar mt-4 grid auto-cols-[210px] grid-flow-col gap-3 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
          {home.categories.slice(0, 6).map((category) => {
            const photo = categoryPhotos[category.slug];
            const image = photo ?? category.image;
            return (
              <Link
                key={category.slug}
                to="/browse"
                search={{ category: category.slug }}
                className="group overflow-hidden border border-border bg-card transition-colors hover:border-primary"
              >
                <div className="aspect-[4/3] overflow-hidden bg-white">
                  {image && (
                    <img
                      src={image.src}
                      alt={image.alt}
                      className={`h-full w-full transition-transform duration-300 group-hover:scale-[1.04] ${
                        photo && photo.fit !== "contain" ? "object-cover" : "object-contain p-3"
                      }`}
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-border px-3 py-3">
                  <span className="text-[12px] font-semibold group-hover:text-primary">
                    {category.name}
                  </span>
                  <span className="font-mono text-[9.5px] text-muted-foreground">
                    {category.productCount}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <Shelf
        title="Just added"
        description="The newest merchandise pages in ParkVault"
        count={home.newToCatalog.length}
        seeAll={
          <Link to="/browse" search={{ sort: "newest" }} className={seeAllClass}>
            See all <ArrowRight size={12} />
          </Link>
        }
      >
        {home.newToCatalog.map((product: ProductCard) => (
          <CatalogCard key={product.id} product={product} />
        ))}
      </Shelf>

      <TopTenShelf products={home.topThisWeek} />

      {home.merchandiseShelves.map((shelf) => (
        <Fragment key={shelf.slug}>
          {shelf.slug.includes("bags") && (
            <section className="mt-12 border-y border-border bg-secondary px-5 py-5 sm:px-7">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-brand-warm">
                    One product page. Four ways to move.
                  </p>
                  <h2 className="mt-1 font-editorial text-[25px] font-normal tracking-[-0.025em]">
                    Buy it, bid on it, list yours or request sourcing.
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-semibold">
                  <Link to="/browse" search={{}} className="hover:underline">
                    Buy now
                  </Link>
                  <span className="text-brand-warm">•</span>
                  <Link to="/browse" search={{}} className="hover:underline">
                    Place a bid
                  </Link>
                  <span className="text-brand-warm">•</span>
                  <Link to="/browse" search={{}} className="hover:underline">
                    List yours
                  </Link>
                  <span className="text-brand-warm">•</span>
                  <Link to="/browse" search={{}} className="hover:underline">
                    Request sourcing
                  </Link>
                  <Link to="/glossary" className={seeAllClass}>
                    How it works <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </section>
          )}
          <Shelf
            title={shelf.title}
            description={shelf.description}
            count={shelf.products.length}
            seeAll={
              <Link to="/browse" search={shelf.browseSearch} className={seeAllClass}>
                Shop all <ArrowRight size={12} />
              </Link>
            }
          >
            {shelf.products.map((product: ProductCard) => (
              <CatalogCard key={`${shelf.slug}-${product.id}`} product={product} />
            ))}
          </Shelf>
        </Fragment>
      ))}

      <Shelf
        title="Lowest listing prices"
        description="In-hand merchandise available now"
        count={home.lowestAsks.length}
      >
        {home.lowestAsks.map((card: MarketCard) => (
          <MarketRowCard key={`ask-${card.variantId}`} card={card} />
        ))}
      </Shelf>

      <Shelf
        title="Available to source from park"
        description="Fixed-price options from approved park shoppers"
        count={home.sourcingOffers.length}
      >
        {home.sourcingOffers.map((card: MarketCard) => (
          <MarketRowCard key={`source-${card.variantId}`} card={card} />
        ))}
      </Shelf>

      <Shelf
        title="Recently sighted in park"
        description="Timestamped observations, not stock guarantees"
        count={home.recentlySighted.length}
      >
        {home.recentlySighted.map((card: MarketCard) => (
          <MarketRowCard key={`sighting-${card.variantId}`} card={card} />
        ))}
      </Shelf>

      <Shelf title="Verified market activity" count={home.verifiedSales.length}>
        {home.verifiedSales.map((card: MarketCard) => (
          <MarketRowCard key={`sale-${card.variantId}`} card={card} />
        ))}
      </Shelf>

      <section className="mt-11 grid gap-3 md:grid-cols-3">
        {[
          [
            "Mobile app coming soon!",
            "We are hard at work to bring a mobile app to you. This has been highly requested and will be sure to update everyone when its live!",
          ],
          [
            "One page per product",
            "Prices and offers sit under one canonical record and one exact variation, so comparisons stay meaningful.",
          ],
          [
            "Independent marketplace",
            "ParkVault is not affiliated with, endorsed by, or sponsored by The Walt Disney Company.",
          ],
        ].map(([title, body]) => (
          <div key={title} className="border border-border bg-secondary px-6 py-5">
            <h2 className="text-[13.5px] font-semibold">{title}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
