import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, MagnifyingGlass, Car } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoRegions } from "@/config/classifieds";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { getClassifiedsHome } from "@/lib/classifieds.functions";
import { trackEvent } from "@/lib/analytics";

const homeQuery = queryOptions({
  queryKey: ["classifieds-home"],
  queryFn: () => getClassifiedsHome(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Idaho classifieds for cars, trucks and more` },
      {
        name: "description",
        content:
          "Search Idaho classifieds for cars, trucks, RVs, trailers, tools, furniture and outdoor gear. Buy from local sellers or post your own listing.",
      },
      { property: "og:title", content: `${brand.name} — Idaho's local marketplace` },
      {
        property: "og:description",
        content:
          "Cars, trucks and everyday classifieds from sellers across the Treasure Valley and the rest of Idaho.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(homeQuery);
  },
  component: Home,
});

const seeAll =
  "inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline";

const headlineOptions = [
  ["Cars", "Toys", "Appliances", "Fishing Lures"],
  ["Trucks", "Tools", "Furniture", "Massage Chairs"],
  ["RVs", "Outdoor Gear", "Electronics", "Air Hockey Tables"],
  ["Motorcycles", "Farm Equipment", "Home Goods", "Kayaks"],
  ["Auto Parts", "Camping Gear", "Bikes", "Vintage Signs"],
  ["Boats", "Garden Gear", "Collectibles", "Smoker Grills"],
  ["Trailers", "Lawn Equipment", "Appliances", "Arcade Cabinets"],
  ["SUVs", "Toys", "Tools", "Fishing Tackle"],
] as const;

const headlineStorageKey = "gem-state-classifieds:last-headline";

function pickHeadlineItems() {
  if (typeof window === "undefined") return headlineOptions[0];

  const previous = window.localStorage.getItem(headlineStorageKey);
  const available = headlineOptions.filter((option) => option.join("|") !== previous);
  const selected = available[Math.floor(Math.random() * available.length)] ?? headlineOptions[0];
  window.localStorage.setItem(headlineStorageKey, selected.join("|"));
  return selected;
}

function Home() {
  const navigate = useNavigate();
  const { data: home } = useSuspenseQuery(homeQuery);
  const [headlineItems, setHeadlineItems] = useState<(typeof headlineOptions)[number]>(
    headlineOptions[0],
  );
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    setHeadlineItems(pickHeadlineItems());
    void trackEvent("page_view", { route: "/" });
  }, []);

  const motorCategories = classifiedCategories.filter((c) => c.group === "motors");
  const generalCategories = classifiedCategories.filter((c) => c.group === "classifieds");

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-14 sm:px-6">
      {/* Search first: this is a marketplace, not a brochure. */}
      <section className="mt-6 rounded-lg border border-border bg-primary px-5 py-8 text-primary-foreground sm:px-9 sm:py-10">
        <h1 className="max-w-[34ch] text-[30px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">
          Find {headlineItems[0]} to {headlineItems[1]} to {headlineItems[2]} to {headlineItems[3]}.
        </h1>
        <p className="mt-3 max-w-[56ch] text-[13.5px] leading-relaxed text-primary-foreground/80">
          And so much more across Idaho and surrounding states.
        </p>

        <form
          className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              to: "/browse",
              search: {
                ...(term.trim() ? { q: term.trim() } : {}),
                ...(category ? { category } : {}),
                ...(region ? { region } : {}),
              },
            });
          }}
        >
          <label className="relative block">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search listings"
              aria-label="Search listings"
              className="h-11 w-full rounded-md border border-transparent bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Category"
            className="h-11 rounded-md bg-card px-3 text-sm text-foreground"
          >
            <option value="">All categories</option>
            {classifiedCategories.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            aria-label="Idaho region"
            className="h-11 rounded-md bg-card px-3 text-sm text-foreground"
          >
            <option value="">All of Idaho</option>
            {idahoRegions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-md bg-nav-accent px-6 text-[13.5px] font-semibold text-primary-foreground"
          >
            Search
          </button>
        </form>

        <p className="mt-3 text-[11.5px] text-primary-foreground/70">
          {home.totalActive} live {home.totalActive === 1 ? "listing" : "listings"} right now.
        </p>
      </section>

      {/* Motors lead */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              <Car size={14} weight="fill" /> Cars &amp; motors
            </p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight">Vehicles for sale in Idaho</h2>
          </div>
          <Link to="/browse" search={{ group: "motors" }} className={seeAll}>
            All vehicles <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {motorCategories.map((option) => (
            <Link
              key={option.slug}
              to="/browse"
              search={{ category: option.slug }}
              className="rounded-full border border-input px-3 py-1.5 text-[12px] hover:border-primary"
            >
              {option.name}
              {home.categoryCounts[option.slug] ? (
                <span className="ml-1.5 text-muted-foreground">
                  {home.categoryCounts[option.slug]}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        {home.motors.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {home.motors.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No vehicles are listed yet."
            body="Vehicle listings appear here as soon as Idaho sellers post them and they pass review."
          />
        )}
      </section>

      {/* Everything else */}
      <section className="mt-12">
        <h2 className="text-[22px] font-bold tracking-tight">Browse other classifieds</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {generalCategories.map((option) => (
            <Link
              key={option.slug}
              to="/browse"
              search={{ category: option.slug }}
              className="rounded-md border border-border bg-card px-4 py-5 transition-colors hover:border-primary"
            >
              <span className="block text-[13px] font-semibold">{option.name}</span>
              <span className="mt-1 block text-[11.5px] text-muted-foreground">
                {home.categoryCounts[option.slug] ?? 0} listings
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recently posted */}
      <section className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[22px] font-bold tracking-tight">Recently posted</h2>
          <Link to="/browse" search={{}} className={seeAll}>
            See all <ArrowRight size={12} />
          </Link>
        </div>
        {home.recent.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {home.recent.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No listings are live yet."
            body="Nothing has been posted and approved so far. Be the first to list something for sale in Idaho."
          />
        )}
      </section>

      <section className="mt-12 rounded-lg border border-border bg-secondary px-6 py-7">
        <h2 className="text-[20px] font-bold tracking-tight">Have something to sell?</h2>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          Post one item at a time with your own photos, your price, and your city. Buyers pay by
          card and you arrange pickup or shipping.
        </p>
        <Link
          to="/sell"
          className="mt-4 inline-flex h-11 items-center rounded-md bg-nav-accent px-5 text-[13.5px] font-semibold text-primary-foreground"
        >
          Post a listing
        </Link>
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-md border border-border bg-card px-5 py-10 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
