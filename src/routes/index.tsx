import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, MagnifyingGlass, MapPin, Car } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoRegions, usStates } from "@/config/classifieds";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
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
const headlineWindowKey = "gem-state-classifieds:last-headline=";

function pickHeadlineItems() {
  if (typeof window === "undefined") return headlineOptions[0];

  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(headlineStorageKey);
  } catch {
    previous = window.name.startsWith(headlineWindowKey)
      ? window.name.slice(headlineWindowKey.length)
      : null;
  }

  const available = headlineOptions.filter((option) => option.join("|") !== previous);
  const selected = available[Math.floor(Math.random() * available.length)] ?? headlineOptions[0];
  try {
    window.localStorage.setItem(headlineStorageKey, selected.join("|"));
  } catch {
    window.name = `${headlineWindowKey}${selected.join("|")}`;
  }
  return selected;
}

function parseLocationSearch(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return {};

  const zipMatch = normalized.match(/\b\d{5}(?:-\d{4})?\b$/);
  const postalCode = zipMatch?.[0];
  const withoutPostalCode = normalized.replace(/\s*\b\d{5}(?:-\d{4})?\b$/, "").trim();
  const matchingRegion = idahoRegions.find(
    (option) => option.toLowerCase() === withoutPostalCode.toLowerCase(),
  );
  if (matchingRegion) return { region: matchingRegion, ...(postalCode ? { postalCode } : {}) };
  const matchingStateOnly = usStates.find(
    ([code, name]) =>
      code.toLowerCase() === withoutPostalCode.toLowerCase() ||
      name.toLowerCase() === withoutPostalCode.toLowerCase(),
  );
  if (matchingStateOnly) {
    return { state: matchingStateOnly[0], ...(postalCode ? { postalCode } : {}) };
  }

  const parts = withoutPostalCode
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  let city = parts.length > 1 ? parts.slice(0, -1).join(", ") : withoutPostalCode;
  let stateToken = parts.length > 1 ? parts.at(-1) : undefined;

  if (!stateToken) {
    const stateSuffix =
      usStates.find(([, name]) => {
        const lowerName = name.toLowerCase();
        const lowerValue = withoutPostalCode.toLowerCase();
        return lowerValue.endsWith(` ${lowerName}`);
      }) ??
      usStates.find(([code]) => withoutPostalCode.toLowerCase().endsWith(` ${code.toLowerCase()}`));
    if (stateSuffix) {
      stateToken = stateSuffix[1];
      city = withoutPostalCode.slice(0, -stateToken.length).trim();
    }
  }

  const matchingState = stateToken
    ? usStates.find(
        ([code, name]) =>
          code.toLowerCase() === stateToken?.toLowerCase() ||
          name.toLowerCase() === stateToken?.toLowerCase(),
      )
    : undefined;

  return {
    ...(city ? { city } : {}),
    ...(matchingState ? { state: matchingState[0] } : {}),
    ...(postalCode ? { postalCode } : {}),
  };
}

function Home() {
  const navigate = useNavigate();
  const { data: home } = useSuspenseQuery(homeQuery);
  const [headlineItems, setHeadlineItems] = useState<(typeof headlineOptions)[number]>(
    headlineOptions[0],
  );
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    setHeadlineItems(pickHeadlineItems());
    void trackEvent("page_view", { route: "/" });
  }, []);

  const motorCategories = classifiedCategories.filter((c) => c.group === "motors");
  const generalCategories = classifiedCategories.filter((c) => c.group === "classifieds");

  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-6">
      <section className="relative mt-8 overflow-hidden rounded-[28px] bg-secondary px-5 py-9 sm:px-10 sm:py-12">
        <span className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-warm/10" />
        <span className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-primary/5" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Gem State classifieds
          </p>
          <h1 className="mt-3 max-w-[34ch] text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[48px]">
            Find {headlineItems[0]} to {headlineItems[1]} to {headlineItems[2]} to{" "}
            {headlineItems[3]}.
          </h1>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
            And so much more across Idaho and surrounding states.
          </p>

          <form
            className="floating-card mt-8 grid gap-2 p-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const locationSearch = parseLocationSearch(location);
              void navigate({
                to: "/browse",
                search: {
                  ...(term.trim() ? { q: term.trim() } : {}),
                  ...(category ? { category } : {}),
                  ...locationSearch,
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
                className="h-12 w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Category"
              className="soft-control h-12 px-4 text-sm text-foreground outline-none"
            >
              <option value="">All categories</option>
              {classifiedCategories.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
            <label className="soft-control relative flex h-12 items-center gap-2 px-4">
              <MapPin
                size={16}
                weight="duotone"
                className="shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="sr-only">Location</span>
              <input
                type="search"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Search by city or region"
                aria-label="Location"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              className="h-12 rounded-full bg-primary px-7 text-[13.5px] font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Motors lead */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              <Car size={14} weight="fill" /> Cars &amp; motors
            </p>
            <h2 className="mt-1 text-[26px] font-bold tracking-tight">
              Vehicles for sale in Idaho
            </h2>
          </div>
          <Link to="/browse" search={{ group: "motors" }} className={seeAll}>
            All vehicles <ArrowRight size={12} />
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {motorCategories.map((option) => (
            <Link
              key={option.slug}
              to="/browse"
              search={{ category: option.slug }}
              className="rounded-full border border-input bg-card px-3.5 py-2 text-[12px] transition-colors hover:border-primary hover:bg-secondary"
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
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
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
      <section className="mt-16">
        <h2 className="text-[26px] font-bold tracking-tight">Browse other classifieds</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {generalCategories.map((option) => (
            <Link
              key={option.slug}
              to="/browse"
              search={{ category: option.slug }}
              className="group rounded-2xl border border-transparent bg-card px-4 py-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex h-12 items-center">
                <CategoryArtwork slug={option.slug} size={54} className="category-art--nav" />
              </span>
              <span className="block text-[13px] font-semibold">{option.name}</span>
              <span className="mt-1 block text-[11.5px] text-muted-foreground">
                {home.categoryCounts[option.slug] ?? 0} listings
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recently posted */}
      <section className="mt-16">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[26px] font-bold tracking-tight">Recently posted</h2>
          <Link to="/browse" search={{}} className={seeAll}>
            See all <ArrowRight size={12} />
          </Link>
        </div>
        {home.recent.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
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

      <section className="soft-card mt-16 px-6 py-8 sm:px-8">
        <h2 className="text-[20px] font-bold tracking-tight">Have something to sell?</h2>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          Post one item at a time with your own photos, your price, and your city. Buyers contact
          you directly to ask questions and arrange pickup, shipping, and payment.
        </p>
        <Link
          to="/sell"
          className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 text-[13.5px] font-semibold text-primary-foreground shadow-sm"
        >
          Post a listing
        </Link>
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="soft-card mt-5 px-5 py-12 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
