import { listingCardImageUrl } from "@/lib/listing-card-image";
import { afterLeadPaint } from "@/lib/lead-paint-ready";
import { homepageDistanceRow } from "@/lib/homepage-distance-row";
import { isGeneralHomepageListing } from "@/lib/homepage-listing-rows";
import { requestHomepageLocation } from "@/lib/homepage-geolocation";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  QueryErrorResetBoundary,
  queryOptions,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, MagnifyingGlass, Car } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import {
  classifiedCategories,
  classifiedCoordinatesForCity,
  nearestClassifiedCity,
  marketplaceCities,
  idahoRegions,
  isWithinClassifiedRadius,
  usStates,
} from "@/config/classifieds";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { HomeSearchDropdown } from "@/components/classifieds/HomeSearchDropdown";
import { ListingCard } from "@/components/classifieds/ListingCard";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import type { LocationPoint } from "@/components/classifieds/LocationRadiusPicker";
import {
  browseClassifieds,
  getClassifiedsHome,
  getClassifiedsHomeLead,
  type ClassifiedsHome,
} from "@/lib/classifieds.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { PUBLIC_PAGE_STALE_MS } from "@/lib/query-freshness";
import { jsonLdScript, siteStructuredData } from "@/lib/structured-data";

// The map (and its stylesheet) only loads when someone opens it, so it never
// delays the first paint of the home page.
const LocationRadiusPicker = lazy(() =>
  import("@/components/classifieds/LocationRadiusPicker").then((module) => ({
    default: module.LocationRadiusPicker,
  })),
);

const homeQuery = queryOptions({
  queryKey: ["classifieds-home"],
  staleTime: PUBLIC_PAGE_STALE_MS,
  queryFn: () => getClassifiedsHome(),
});

const homeLeadQuery = queryOptions({
  queryKey: ["classifieds-home-lead", "cars-trucks"],
  staleTime: PUBLIC_PAGE_STALE_MS,
  queryFn: () => getClassifiedsHomeLead(),
});

export const Route = createFileRoute("/")({
  // Both reads use the same saved CDN snapshot. Settle them before rendering
  // so every initial row is in the HTML and hydration reuses the loaded data.
  // This never refreshes inventory or calls a listing provider.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(homeQuery),
      context.queryClient.prefetchQuery(homeLeadQuery),
    ]);
    const lead = context.queryClient.getQueryData(homeLeadQuery.queryKey);
    const firstImage = lead?.motors.find((listing) => listing.state === "ID")?.imageUrl;
    return { leadImageUrl: firstImage ? listingCardImageUrl(firstImage) : null };
  },
  head: ({ loaderData }) => ({
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
    links: [
      { rel: "preconnect", href: "https://images.craigslist.org" },
      ...(loaderData?.leadImageUrl
        ? [
            {
              rel: "preload",
              as: "image",
              href: loaderData.leadImageUrl,
              fetchPriority: "high" as const,
            },
          ]
        : []),
    ],
    scripts: [jsonLdScript(siteStructuredData())],
  }),
  component: Home,
});

const seeAll =
  "inline-flex min-h-11 shrink-0 items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline";

const HOMEPAGE_ROW_SIZE = 4;
const HOMEPAGE_LEAD_SLOW_NOTICE_MS = 8_000;

const homepageCategoryHighlights = [
  { slug: "firearms", name: "Firearms" },
  { slug: "pets", name: "Pets" },
  { slug: "furniture", name: "Furniture" },
  { slug: "electronics", name: "Electronics" },
  { slug: "industrial", name: "Industrial" },
] as const;

type HomepageBrowseSearch = {
  allCategories?: boolean;
  category?: string;
  group?: "motors";
  bodyStyle?: string;
  homeTab?: "buy" | "build" | "rent";
  jobEmploymentType?: string;
  priceMax?: number;
  city?: string;
  state?: string;
  region?: string;
  postalCode?: string;
  radiusMiles?: number;
  latitude?: number;
  longitude?: number;
};

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

type ParsedLocationSearch = {
  city?: string;
  region?: string;
  state?: string;
  postalCode?: string;
};

function parseLocationSearch(value: string): ParsedLocationSearch {
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
  const [leadPainted, setLeadPainted] = useState(false);
  const onLeadPainted = useCallback(() => setLeadPainted(true), []);
  const navigate = useNavigate();
  const [headlineItems, setHeadlineItems] = useState<(typeof headlineOptions)[number]>(
    headlineOptions[0],
  );
  // The server-rendered headline stays put for the first paint (it's the
  // page's largest text, so swapping it on load delays LCP); the entrance
  // animation only plays on later rotations.
  const [headlineRotated, setHeadlineRotated] = useState(false);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  // Fit the words inside the reserved headline shape without moving the
  // search or listing row when a longer phrase rotates into view.
  useEffect(() => {
    const h = headlineRef.current;
    if (!h) return;
    const fit = () => {
      const inner = h.firstElementChild as HTMLElement | null;
      if (!inner) return;
      inner.style.fontSize = "";
      const desktop = window.innerWidth >= 1200;
      if (window.innerWidth >= 640 && !desktop) return;
      let size = 1;
      const minimum = desktop ? 0.9 : 0.6;
      while (
        (h.scrollWidth > h.clientWidth + 1 || (desktop && h.scrollHeight > h.clientHeight + 1)) &&
        size > minimum
      ) {
        size -= 0.02;
        inner.style.fontSize = `${size}em`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [headlineItems]);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [mapPoint, setMapPoint] = useState<LocationPoint>();
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const manualLocationRef = useRef(false);

  const locateVisitor = useCallback(
    async (automatic: boolean, active: () => boolean = () => true) => {
      setLocating(true);
      const point = await requestHomepageLocation(
        {
          geolocation: navigator.geolocation,
          permissions: navigator.permissions,
          storage: (() => {
            try {
              return window.localStorage;
            } catch {
              return undefined;
            }
          })(),
        },
        automatic,
      );
      if (!active()) return;
      setLocating(false);
      // A late GPS result must not replace a city the visitor just selected.
      if (manualLocationRef.current) return;
      if (!point) {
        if (!automatic) toast.info("Enter a city, or allow location access in your browser.");
        return;
      }
      const nearest = nearestClassifiedCity(point.latitude, point.longitude);
      const city = nearest && nearest.distanceMiles <= 20 ? nearest.city : undefined;
      setMapPoint({ ...point, city });
      setLocation(city ?? "");
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void locateVisitor(true, () => active);
    return () => {
      active = false;
    };
  }, [locateVisitor]);

  useEffect(() => {
    void trackEvent("page_view", { route: "/" });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let firstRotation = true;
    const headlineRotation = window.setInterval(() => {
      setHeadlineRotated(true);
      // First change: something other than what this visitor saw last time.
      if (firstRotation) {
        firstRotation = false;
        setHeadlineItems(pickHeadlineItems());
        return;
      }
      setHeadlineItems((current) => {
        const currentIndex = headlineOptions.findIndex(
          (option) => option.join("|") === current.join("|"),
        );
        const next =
          headlineOptions[(currentIndex + 1) % headlineOptions.length] ?? headlineOptions[0];
        try {
          window.localStorage.setItem(headlineStorageKey, next.join("|"));
        } catch {
          window.name = `${headlineWindowKey}${next.join("|")}`;
        }
        return next;
      });
    }, 6500);

    return () => window.clearInterval(headlineRotation);
  }, []);

  // The hero fields prepare a search; changing them (or receiving GPS) must
  // never shrink the homepage's saved statewide inventory or its row links.
  const where = homeLocation("", undefined, 25);
  const { parsedLocation, locationSummary } = homeLocation(location, mapPoint, radiusMiles);

  const defaultingRef = useRef(false);
  function openMapWithDefault() {
    manualLocationRef.current = true;
    if (mapOpen || defaultingRef.current) return;
    setMapOpen(true);
    if (mapPoint || parsedLocation.city) return;
    defaultingRef.current = true;
    const apply = (latitude: number, longitude: number, fallbackCity?: string) => {
      const nearest = nearestClassifiedCity(latitude, longitude);
      const city =
        fallbackCity ?? (nearest && nearest.distanceMiles <= 20 ? nearest.city : undefined);
      setMapPoint({ latitude, longitude, city });
      setLocation(city ?? "");
      defaultingRef.current = false;
    };
    const boise = () => {
      const coords = classifiedCoordinatesForCity("Boise") ?? [43.615, -116.2023];
      apply(coords[0], coords[1], "Boise");
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      boise();
      return;
    }
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      boise();
    }, 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        apply(Number(pos.coords.latitude.toFixed(5)), Number(pos.coords.longitude.toFixed(5)));
      },
      () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        boise();
      },
      { timeout: 4000 },
    );
  }

  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-6">
      <section className="classifieds-hero-shell homepage-hero-shell relative mt-6 overflow-hidden rounded-[28px] border border-brand-blue/20 bg-secondary px-4 py-4 shadow-lg sm:px-10 sm:py-8">
        <span
          className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-blue/12"
          aria-hidden="true"
        />
        <span
          className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-brand-warm/18"
          aria-hidden="true"
        />
        <span
          className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
          aria-hidden="true"
        />
        <div className="relative z-10">
          <div className="homepage-hero-top">
            <div className="min-w-0">
              <h1
                ref={headlineRef}
                className="homepage-hero-headline block max-w-[34ch] text-[22px] sm:mt-2 font-bold leading-[1.08] tracking-tight sm:text-[48px]"
              >
                {/* Phones: fixed three lines "Find A to / B to C / to D."
                Tablet/desktop: two lines "Find A to B to / C to D." */}
                <span className="whitespace-nowrap sm:whitespace-normal">
                  Find{" "}
                  <span
                    key={headlineItems.join("|")}
                    className={`${headlineRotated ? "classifieds-hero-rotating-item " : ""}text-brand-blue`}
                    aria-live="polite"
                  >
                    {headlineItems[0]}
                  </span>{" "}
                  to
                  <br className="sm:hidden" />
                  <span className="hidden sm:inline"> </span>
                  {headlineItems[1]} to
                  <br className="hidden sm:inline" />
                  <span className="sm:hidden"> </span>
                  {headlineItems[2]}
                  <br className="sm:hidden" />
                  <span className="hidden sm:inline"> </span>
                  to {headlineItems[3]}.
                </span>
              </h1>
              <p className="mt-1 max-w-[56ch] text-xs leading-snug text-muted-foreground sm:mt-1.5 sm:whitespace-nowrap sm:leading-relaxed">
                And so much more across Idaho and surrounding states.
              </p>
              <div
                className="classifieds-hero-accent mt-3 hidden sm:flex items-center gap-1.5"
                aria-hidden="true"
              >
                <span className="classifieds-hero-accent-bar h-1.5 w-9 rounded-full bg-brand-blue" />
                <span className="classifieds-hero-accent-bar classifieds-hero-accent-bar--warm h-1.5 w-5 rounded-full bg-brand-warm" />
                <span className="classifieds-hero-accent-bar h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
              </div>
            </div>
          </div>

          <form
            className="floating-card mt-3 grid grid-cols-2 gap-1.5 border border-brand-blue/15 ring-1 ring-brand-warm/10 p-1.5 sm:mt-5 sm:gap-2 sm:p-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const locationSearch = parseLocationSearch(location);
              void navigate({
                to: "/browse",
                search: {
                  ...(term.trim() ? { q: term.trim() } : {}),
                  ...(category ? { category } : {}),
                  ...locationSearch,
                  ...(locationSearch.city || mapPoint ? { radiusMiles } : {}),
                  ...(mapPoint
                    ? { latitude: mapPoint.latitude, longitude: mapPoint.longitude }
                    : {}),
                },
              });
            }}
          >
            <label className="relative col-span-2 block sm:col-span-1">
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
                className="h-10 w-full rounded-full border-0 bg-transparent pl-9 sm:h-12 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </label>
            <HomeSearchDropdown
              value={category}
              onChange={setCategory}
              label="Category"
              placeholder="All categories"
              options={[
                { value: "", label: "All categories" },
                ...classifiedCategories.map((option) => ({
                  value: option.slug,
                  label: option.name,
                })),
              ]}
            />
            <HomeSearchDropdown
              value={location}
              onChange={(next) => {
                manualLocationRef.current = true;
                setLocation(next);
                setMapPoint(undefined);
              }}
              placeholder="City or ZIP code"
              shortPlaceholder="City or ZIP"
              label="City or ZIP code"
              editable
              options={marketplaceCities.map((option) => ({ value: option, label: option }))}
            />
            <button
              type="submit"
              className="col-span-2 h-10 rounded-full bg-primary px-7 sm:col-span-1 sm:h-12 text-[13px] font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
            >
              Search
            </button>
          </form>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0 text-[12px] sm:mt-3 sm:gap-y-2 text-muted-foreground">
            <span className="font-semibold text-foreground">Search area: {locationSummary}</span>
            <button
              type="button"
              disabled={locating}
              onClick={() => {
                manualLocationRef.current = false;
                void locateVisitor(false);
              }}
              className="inline-flex min-h-9 items-center font-semibold text-primary sm:min-h-11 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {locating ? "Finding location…" : "Use my location"}
            </button>
            <button
              type="button"
              onClick={() => setMapOpen((open) => !open)}
              className="inline-flex min-h-9 items-center font-semibold text-primary sm:min-h-11 underline-offset-2 hover:underline"
              aria-expanded={mapOpen}
            >
              {mapOpen ? "Hide map" : "Choose anywhere on map"}
            </button>
            {/* The radius only means something around a chosen city or map
                point; before that, "Search area: Idaho" already says it. */}
            <label className="flex min-h-9 min-w-[220px] sm:min-h-11 flex-1 items-center gap-2 sm:max-w-[360px]">
              <span className="whitespace-nowrap">Distance</span>
              <input
                aria-label="Search radius in miles"
                type="range"
                min="5"
                max="500"
                step="5"
                value={radiusMiles}
                onPointerDown={openMapWithDefault}
                onChange={(event) => {
                  openMapWithDefault();
                  setRadiusMiles(Number(event.target.value));
                }}
                className="w-full accent-primary"
              />
              <span className="whitespace-nowrap font-semibold text-foreground">
                {radiusMiles} mi
              </span>
            </label>
          </div>
          {mapOpen ? (
            <Suspense fallback={<div className="mt-3 h-[260px] rounded-xl bg-secondary" />}>
              <LocationRadiusPicker
                city={parsedLocation.city}
                latitude={mapPoint?.latitude}
                longitude={mapPoint?.longitude}
                radiusMiles={radiusMiles}
                onChange={(point) => {
                  manualLocationRef.current = true;
                  setMapPoint(point);
                  setLocation(point.city ?? "");
                }}
                className="mt-3"
              />
            </Suspense>
          ) : null}
        </div>
      </section>

      <HomepageFeaturedCategories withLocation={where.withLocation} />

      {/* All initial rows are ready before rendering; photos below the first
          row remain lazy-loaded so they do not compete with its main image. */}
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <HomepageLeadErrorBoundary onReset={reset} where={where} onUnavailable={onLeadPainted}>
            <Suspense fallback={<HomepageLeadLoading where={where} />}>
              <HomepageLeadVehicles where={where} onPainted={onLeadPainted} />
            </Suspense>
          </HomepageLeadErrorBoundary>
        )}
      </QueryErrorResetBoundary>
      <HomepageSections where={where} leadPainted={leadPainted} />
    </main>
  );
}

function HomepageFeaturedCategories({
  withLocation,
}: {
  withLocation: (search: HomepageBrowseSearch) => HomepageBrowseSearch;
}) {
  return (
    <section
      aria-label="Explore pets and firearms"
      className="homepage-featured-categories mt-5 grid grid-cols-2 gap-2.5 sm:gap-4"
    >
      {[
        { slug: "pets", title: "Pets & adoption", tone: "bg-brand-blue/7" },
        { slug: "firearms", title: "Firearms & gear", tone: "bg-brand-warm/10" },
      ].map((category) => (
        <Link
          key={category.slug}
          to="/browse"
          search={withLocation({ category: category.slug })}
          className={`group flex min-w-0 flex-col items-start gap-2.5 rounded-[20px] border border-primary/15 p-3.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:min-h-[60px] sm:flex-row sm:items-center sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-2 ${category.tone}`}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card/70 sm:size-10">
            <CategoryArtwork slug={category.slug} size={40} />
          </span>
          <span className="flex w-full min-w-0 items-center gap-1 text-[15px] font-bold leading-tight tracking-tight sm:flex-1 sm:gap-3 sm:text-[16px]">
            <span className="min-w-0">{category.title}</span>
            <ArrowRight
              size={14}
              weight="bold"
              className="shrink-0 text-primary sm:ml-auto"
              aria-hidden="true"
            />
          </span>
        </Link>
      ))}
    </section>
  );
}
/** Everything the page derives from the visitor's chosen location. */
function homeLocation(location: string, mapPoint: LocationPoint | undefined, radiusMiles: number) {
  const motorCategories = classifiedCategories.filter((c) => c.group === "motors");
  const parsedLocation = parseLocationSearch(location);
  const matchesLocation = (
    listing: Pick<ClassifiedsHome["recent"][number], "postalCode" | "city" | "state" | "region">,
  ) => {
    if (parsedLocation.postalCode) {
      return (listing.postalCode ?? "").startsWith(parsedLocation.postalCode);
    }
    if (parsedLocation.city || mapPoint) {
      return isWithinClassifiedRadius({
        city: parsedLocation.city,
        cityState: parsedLocation.state,
        listingCity: listing.city,
        listingState: listing.state,
        latitude: mapPoint?.latitude,
        longitude: mapPoint?.longitude,
        radiusMiles,
      });
    }
    if (parsedLocation.region) return listing.region === parsedLocation.region;
    if (parsedLocation.state) return listing.state === parsedLocation.state;
    // The homepage promise is local by default. Broader browsing remains
    // available through the optional state/region controls on browse.
    return listing.state === "ID";
  };
  const selectedStateName = parsedLocation.state
    ? usStates.find(([code]) => code === parsedLocation.state)?.[1]
    : undefined;
  const locationSummary = mapPoint
    ? `${mapPoint.city ?? "Map point"} · within ${radiusMiles} miles`
    : parsedLocation.city
      ? `${parsedLocation.city}${parsedLocation.state ? `, ${parsedLocation.state}` : ""} · within ${radiusMiles} miles`
      : parsedLocation.postalCode
        ? `ZIP ${parsedLocation.postalCode}`
        : (parsedLocation.region ?? selectedStateName ?? "Idaho");
  const browseLocationSearch = {
    ...(!parsedLocation.city &&
    !parsedLocation.postalCode &&
    !parsedLocation.region &&
    !parsedLocation.state
      ? { state: "ID" }
      : {}),
    ...parsedLocation,
    ...(parsedLocation.city || mapPoint ? { radiusMiles } : {}),
    ...(mapPoint ? { latitude: mapPoint.latitude, longitude: mapPoint.longitude } : {}),
  };
  const withLocation = (search: HomepageBrowseSearch): HomepageBrowseSearch => ({
    ...search,
    ...browseLocationSearch,
  });
  const locationFields = browseLocationSearch as {
    state?: string;
    region?: string;
    city?: string;
    postalCode?: string;
    radiusMiles?: number;
  };
  const feedLocation = {
    state: locationFields.state,
    region: locationFields.region,
    city: locationFields.city,
    postalCode: locationFields.postalCode,
    radiusMiles: locationFields.radiusMiles,
    latitude: mapPoint?.latitude,
    longitude: mapPoint?.longitude,
  };

  return {
    motorCategories,
    parsedLocation,
    hasLocalArea: Boolean(
      parsedLocation.city || parsedLocation.postalCode || parsedLocation.region || mapPoint,
    ),
    matchesLocation,
    locationSummary,
    withLocation,
    feedLocation,
  };
}

function HomeSectionsLoading() {
  return (
    <div
      className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="aspect-[4/3] rounded-2xl bg-secondary" />
      ))}
    </div>
  );
}

function HomepageLeadVehicles({
  where,
  onPainted,
}: {
  where: ReturnType<typeof homeLocation>;
  onPainted: () => void;
}) {
  const { data: homeLead } = useSuspenseQuery(homeLeadQuery);
  const { motorCategories, matchesLocation, withLocation } = where;
  const leadMotors = homeLead.motors.filter(matchesLocation).slice(0, HOMEPAGE_ROW_SIZE);
  const sectionRef = useRef<HTMLElement>(null);
  const firstId = leadMotors[0]?.id;
  const firstImage = leadMotors[0]?.imageUrl;
  useEffect(
    () =>
      afterLeadPaint(
        sectionRef.current?.querySelector<HTMLImageElement>('img[fetchpriority="high"]') ?? null,
        onPainted,
      ),
    [firstId, firstImage, onPainted],
  );

  return (
    <section ref={sectionRef} className="homepage-lead-vehicles mt-6 sm:mt-14">
      <HomepageLeadHeader where={where} />
      {leadMotors.length > 0 ? (
        <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {leadMotors.map((listing, index) => (
            <div key={listing.id} className="min-w-[235px] lg:min-w-0">
              <ListingCard listing={listing} priority={index === 0} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={EMPTY_ROW_TITLE}
          body="Cars and trucks show up here as soon as Idaho sellers post them. Have one to sell? Be one of the first."
        />
      )}
      <div className="no-scrollbar -mx-4 mt-4 flex flex-nowrap gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {motorCategories.map((option) => (
          <Link
            key={option.slug}
            to="/browse"
            search={withLocation({ category: option.slug })}
            className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-input bg-card px-3.5 text-[12px] sm:min-h-11 sm:px-4 sm:text-[12.5px] transition-colors hover:border-primary hover:bg-secondary"
          >
            {option.name}
            {homeLead.categoryCounts[option.slug] ? (
              <span className="ml-1.5 text-muted-foreground">
                {homeLead.categoryCounts[option.slug]}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

function HomepageLeadHeader({ where }: { where: ReturnType<typeof homeLocation> }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Car size={14} weight="fill" /> Cars &amp; trucks
        </p>
        <h2 className="mt-1 text-[19px] font-bold tracking-tight sm:whitespace-nowrap sm:text-[26px]">
          Cars &amp; trucks for sale in Idaho
        </h2>
      </div>
      <Link
        to="/browse"
        search={where.withLocation({ category: "cars-trucks" })}
        className={`${seeAll} shrink-0`}
      >
        All cars &amp; trucks <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function HomepageLeadLoading({ where }: { where: ReturnType<typeof homeLocation> }) {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), HOMEPAGE_LEAD_SLOW_NOTICE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="homepage-lead-vehicles mt-6 sm:mt-14">
      <HomepageLeadHeader where={where} />
      <div className="mt-5" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="aspect-[4/3] rounded-2xl bg-secondary" />
          ))}
        </div>
        <p
          className={takingLonger ? "mt-3 text-xs text-muted-foreground" : "sr-only"}
          role="status"
        >
          {takingLonger
            ? "Still loading cars and trucks. This section will update when results are ready."
            : "Loading Idaho cars and trucks."}
        </p>
      </div>
    </section>
  );
}

class HomepageLeadErrorBoundary extends Component<
  {
    children: ReactNode;
    onReset: () => void;
    where: ReturnType<typeof homeLocation>;
    onUnavailable?: () => void;
  },
  { hasError: boolean }
> {
  override state = { hasError: false };

  override componentDidCatch() {
    this.props.onUnavailable?.();
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  private retry = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <section className="homepage-lead-vehicles mt-6 sm:mt-14">
          <HomepageLeadHeader where={this.props.where} />
          <BluebirdEmptyState
            headingLevel="h2"
            className="mt-5"
            title="Cars and trucks couldn’t load."
            description="Check your connection and try again."
          >
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </BluebirdEmptyState>
        </section>
      );
    }
    return this.props.children;
  }
}

class HomepageSecondaryErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mt-16 rounded-2xl border border-border p-6">
        <h2 className="text-lg font-semibold">More listings couldn’t load.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The search and featured listings above are still available.
        </p>
        <button
          className="mt-4 min-h-11 rounded-full border border-input px-5 text-sm font-semibold"
          onClick={() => {
            this.props.onReset();
            this.setState({ failed: false });
          }}
        >
          Try again
        </button>
        <a
          href="/browse?allCategories=true"
          className="ml-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
        >
          Browse all listings
        </a>
      </div>
    );
  }
}

function HomepageSections({
  where,
  leadPainted,
}: {
  where: ReturnType<typeof homeLocation>;
  leadPainted: boolean;
}) {
  return (
    <div
      className="min-h-[600px]"
      data-secondary-ready="true"
      data-lead-painted={leadPainted ? "true" : "false"}
    >
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <HomepageSecondaryErrorBoundary onReset={reset}>
            <Suspense fallback={<HomeSectionsLoading />}>
              <HomeSections where={where} />
            </Suspense>
          </HomepageSecondaryErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </div>
  );
}

function HomeSections({ where }: { where: ReturnType<typeof homeLocation> }) {
  const { data: home } = useSuspenseQuery(homeQuery);
  // Observe the independently loaded lead without fetching or throwing its
  // errors here. Once it resolves (including after retry), reserve those same
  // IDs so the broader rows do not repeat the featured cars and trucks.
  const { data: homeLead } = useQuery({ ...homeLeadQuery, enabled: false, throwOnError: false });
  const { matchesLocation, withLocation, feedLocation, hasLocalArea } = where;
  const localRecent = home.recent.filter(
    (listing) => !listing.externalMerchandise && matchesLocation(listing),
  );
  const localMotors = home.motors.filter(matchesLocation);
  // The homepage shows Idaho homes for now; browse still includes the
  // surrounding states.
  const homeListings = localRecent.filter(
    (listing) => listing.home && listing.state?.toUpperCase() === "ID",
  );
  const jobListings = localRecent.filter((listing) => listing.job);
  const serviceSource = localRecent.filter((listing) => listing.service);
  const generalSource = localRecent.filter(isGeneralHomepageListing);

  // Every row below draws from the same small pool, so without this the same
  // few listings repeat row after row. Each listing appears at most once on
  // the page; rows claim up to four listings in the order they render, and a
  // row with nothing left shows the "just getting started" card instead.
  const allLocalListings = [...localRecent];
  for (const listing of localMotors) {
    if (!allLocalListings.some((existing) => existing.id === listing.id)) {
      allLocalListings.push(listing);
    }
  }
  // The route loader has settled both snapshot queries before this renders.
  const leadMotors = (homeLead?.motors ?? []).filter(matchesLocation).slice(0, HOMEPAGE_ROW_SIZE);
  const shownIds = new Set<string>(leadMotors.map((listing) => listing.id));
  const pick = (candidates: ClassifiedsHome["recent"]) => {
    const unseen = candidates
      .filter((listing) => !shownIds.has(listing.id))
      .slice(0, HOMEPAGE_ROW_SIZE);
    for (const listing of unseen) shownIds.add(listing.id);
    return unseen;
  };
  // Reserve dedicated-category inventory before broad rows consume it.
  const petListings = pick(localRecent.filter((listing) => listing.pet));
  // Member firearms lead; online retailer firearms and gear fill the rest.
  const firearmListings = pick([
    ...localRecent.filter((listing) => listing.categorySlug === "firearms"),
    ...(home.onlineMerchandise ?? []).filter((listing) => listing.categorySlug === "firearms"),
  ]);
  const freshListings = pick(generalSource);
  const distanceRow = homepageDistanceRow(
    [...home.recent, ...home.motors],
    hasLocalArea,
    matchesLocation,
    shownIds,
  );
  const fartherAwayListings = pick(distanceRow.listings);
  const vehicleListings = pick(localMotors);
  const truckListings = pick(
    localMotors.filter((listing) =>
      /truck|suv|pickup|jeep|sport utility|chassis/i.test(
        `${listing.vehicle?.bodyStyle ?? ""} ${listing.title}`,
      ),
    ),
  );
  const valueVehicleListings = pick([...localMotors].sort((a, b) => a.priceCents - b.priceCents));
  const buyHomes = pick(homeListings.filter((listing) => listing.home?.mode === "buy"));
  const buildHomes = pick(homeListings.filter((listing) => listing.home?.mode === "build"));
  const rentalHomes = pick(homeListings.filter((listing) => listing.home?.mode === "rent"));
  const jobRow = pick(jobListings);
  const flexibleJobs = pick(
    jobListings.filter((listing) =>
      /part-time|contract|temporary/i.test(listing.job?.employmentType ?? ""),
    ),
  );
  const serviceListings = pick(serviceSource);
  const homeServices = pick(
    serviceSource.filter((listing) =>
      /home|handyman|lawn|landscape|repair|clean|plumb|electric|roof|heating|paint|contractor|pest/i.test(
        `${listing.title} ${listing.service?.subcategory ?? ""}`,
      ),
    ),
  );
  const generalListings = pick(generalSource);
  const toyAndCollectibleListings = pick(
    generalSource.filter((listing) =>
      /toy|plush|doll|collectible|ninja|mario/i.test(
        `${listing.title} ${listing.categoryName ?? ""}`,
      ),
    ),
  );
  const valueFinds = pick(generalSource.filter((listing) => listing.priceCents <= 10_000));
  const localSellerPicks = pick(localRecent);
  const feedStart = allLocalListings.filter((listing) => !shownIds.has(listing.id));

  return (
    <>
      {/* Everything else */}
      <section className="mt-16">
        <h2 className="text-[26px] font-bold tracking-tight">Browse other classifieds</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {homepageCategoryHighlights.map((option) => (
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
            </Link>
          ))}
        </div>
      </section>

      <HomepageListingRow
        eyebrow="Bluebird picks"
        title="Fresh local finds"
        listings={freshListings}
        search={withLocation({ allCategories: true })}
        action="See all fresh listings"
      />

      <HomepageListingRow
        eyebrow="Bluebird distance"
        title={distanceRow.title}
        listings={fartherAwayListings}
        search={distanceRow.search}
        action={distanceRow.action}
      />

      <HomepageListingRow
        eyebrow="Bluebird motors"
        title="New vehicle arrivals"
        listings={vehicleListings}
        search={withLocation({ group: "motors" })}
        action="Browse all vehicles"
      />

      <HomepageListingRow
        eyebrow="Bluebird motors"
        title="Trucks, SUVs & pickups"
        listings={truckListings}
        search={withLocation({ group: "motors", bodyStyle: "Pickup||SUV" })}
        action="Shop trucks & SUVs"
      />

      <HomepageListingRow
        eyebrow="Bluebird motors"
        title="Affordable vehicles"
        listings={valueVehicleListings}
        search={withLocation({ group: "motors" })}
        action="Find a vehicle"
      />

      <HomepageInfoBand
        eyebrow="Local marketplace"
        title="Buy locally and connect directly with sellers."
        body="Explore listings from people and businesses across Idaho, then message sellers directly to ask questions and arrange the details."
        action="Browse local listings"
        to="/browse"
      />

      <HomepageListingRow
        eyebrow="Bluebird homes"
        title="Homes for sale"
        listings={buyHomes}
        search={withLocation({ category: "other-real-estate", homeTab: "buy" })}
        action="Browse homes for sale"
      />

      <HomepageListingRow
        eyebrow="Bluebird homes"
        title="New builds to explore"
        listings={buildHomes}
        search={withLocation({ category: "other-real-estate", homeTab: "build" })}
        action="Find new construction"
      />

      <HomepageListingRow
        eyebrow="Bluebird homes"
        title="Rentals worth a look"
        listings={rentalHomes}
        search={withLocation({ category: "other-real-estate", homeTab: "rent" })}
        action="Browse rentals"
      />

      <HomepageInfoBand
        eyebrow="For sellers and businesses"
        title="Put your next opportunity in front of local buyers."
        body="Post an item, promote a service, or share an open role. Bluebird Marketplace gives Idaho sellers one simple place to be discovered."
        action="Post a listing"
        to="/sell"
        tone="accent"
      />

      <HomepageListingRow
        eyebrow="Bluebird jobs"
        title="Jobs hiring now"
        listings={jobRow}
        search={withLocation({ category: "jobs" })}
        action="Browse local jobs"
      />

      <HomepageListingRow
        eyebrow="Bluebird jobs"
        title="Flexible and part-time work"
        listings={flexibleJobs}
        search={withLocation({
          category: "jobs",
          jobEmploymentType: "part-time||contract||temporary",
        })}
        action="Find flexible work"
      />

      <HomepageListingRow
        eyebrow="Bluebird services"
        title="Services for your next project"
        listings={serviceListings}
        search={withLocation({ category: "services" })}
        action="Find a local pro"
      />

      <HomepageListingRow
        eyebrow="Bluebird pets"
        title="Pets & adoption"
        listings={petListings}
        search={withLocation({ category: "pets" })}
        action="Browse pets"
      />

      <HomepageListingRow
        eyebrow="Bluebird firearms"
        title="Firearms & gear"
        listings={firearmListings}
        search={withLocation({ category: "firearms" })}
        action="Browse firearms"
      />

      <HomepageListingRow
        eyebrow="Bluebird services"
        title="Home services and repairs"
        listings={homeServices}
        search={withLocation({ category: "services" })}
        action="Find home help"
      />

      <HomepageInfoBand
        eyebrow="A marketplace with a local feel"
        title="Discover people, products, jobs, and services close to home."
        body="Save what catches your eye, create alerts for what you need, and come back anytime to keep browsing your local marketplace."
        action="Browse all categories"
        to="/browse"
      />

      <HomepageListingRow
        eyebrow="Bluebird classifieds"
        title="Everyday finds from local sellers"
        listings={generalListings}
        search={withLocation({ allCategories: true })}
        action="Browse all classifieds"
      />

      {(home.onlineMerchandise?.length ?? 0) > 0 ? (
        <>
          <HomepageListingRow
            eyebrow="Online retailer offers"
            title="Outdoor gear available online"
            listings={(home.onlineMerchandise ?? [])
              .filter((listing) => listing.categorySlug === "outdoor-sporting")
              .slice(0, HOMEPAGE_ROW_SIZE)}
            search={{ category: "outdoor-sporting" }}
            action="Browse outdoor gear"
          />
          <HomepageListingRow
            eyebrow="Online retailer offers"
            title="Apparel available online"
            listings={(home.onlineMerchandise ?? [])
              .filter((listing) => listing.categorySlug === "apparel-accessories")
              .slice(0, HOMEPAGE_ROW_SIZE)}
            search={{ category: "apparel-accessories" }}
            action="Browse apparel"
          />
          <HomepageListingRow
            eyebrow="Online retailer offers"
            title="Tools and supplies available online"
            listings={(home.onlineMerchandise ?? [])
              .filter((listing) => listing.categorySlug === "tools-equipment")
              .slice(0, HOMEPAGE_ROW_SIZE)}
            search={{ category: "tools-equipment" }}
            action="Browse tools and supplies"
          />
        </>
      ) : null}

      <HomepageListingRow
        eyebrow="Bluebird classifieds"
        title="Toys and collectibles"
        listings={toyAndCollectibleListings}
        search={withLocation({ category: "general" })}
        action="Browse collectibles"
      />

      <HomepageListingRow
        eyebrow="Bluebird classifieds"
        title="Value finds under $100"
        listings={valueFinds}
        search={withLocation({ allCategories: true, priceMax: 100 })}
        action="Shop everyday finds"
      />

      <HomepageListingRow
        eyebrow="Bluebird picks"
        title="More from local sellers"
        listings={localSellerPicks}
        search={withLocation({ allCategories: true })}
        action="See more local listings"
      />

      <HomeFeed
        key={JSON.stringify(feedLocation)}
        initial={feedStart}
        shownIds={shownIds}
        hasMore={home.totalActive > home.recent.length}
        location={feedLocation}
      />

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
    </>
  );
}

function HomepageListingRow({
  eyebrow,
  title,
  listings,
  search,
  action,
}: {
  eyebrow: string;
  title: string;
  listings: Awaited<ReturnType<typeof getClassifiedsHome>>["recent"];
  search: HomepageBrowseSearch;
  action: string;
}) {
  return (
    <section
      className="mt-16"
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
    >
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h2
            id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
            className="mt-1 text-[26px] font-bold tracking-tight"
          >
            {title}
          </h2>
        </div>
        <Link to="/browse" search={search} className={seeAll}>
          {action} <ArrowRight size={12} />
        </Link>
      </div>
      {listings.length > 0 ? (
        <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {listings.slice(0, HOMEPAGE_ROW_SIZE).map((listing) => (
            <div key={listing.id} className="min-w-[235px] lg:min-w-0">
              <ListingCard listing={listing} />
            </div>
          ))}
        </div>
      ) : (
        // A slim line rather than the full card: with little inventory most
        // rows are empty, and the vehicles section already shows the card.
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-border px-5 py-4 text-[13px] text-muted-foreground">
          Nothing here yet. New listings show up as soon as Idaho sellers post them.
          <Link to="/sell" className="font-semibold text-primary hover:underline">
            Post a listing
          </Link>
        </p>
      )}
    </section>
  );
}

// The end of the home page keeps going instead of dead-ending: first the
// listings no row above picked, then further pages of the newest listings in
// the same area on request.
function HomeFeed({
  initial,
  shownIds,
  hasMore,
  location,
}: {
  initial: Awaited<ReturnType<typeof getClassifiedsHome>>["recent"];
  shownIds: Set<string>;
  hasMore: boolean;
  location: Record<string, string | number | undefined>;
}) {
  const fetchPage = useServerFn(browseClassifieds);
  // The first-page remainder is derived from the current row allocation.
  // Keep only explicitly loaded later pages in state so allocation changes
  // neither retain stale first-page cards nor discard loaded pagination.
  const [loadedItems, setLoadedItems] = useState<typeof initial>([]);
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [nextPage, setNextPage] = useState(2);
  const [done, setDone] = useState(!hasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (loading) return;
    // Reveal already fetched cards before spending another inventory request.
    if (visibleItems.length > visibleLimit) {
      setVisibleLimit((current) => current + 24);
      return;
    }
    setLoading(true);
    try {
      const filters = Object.fromEntries(
        Object.entries(location).filter(([, value]) => value !== undefined && value !== ""),
      );
      const result = await fetchPage({ data: { ...filters, sort: "newest", page: nextPage } });
      setLoadedItems((current) => {
        const seen = new Set(current.map((listing) => listing.id));
        return [...current, ...result.listings.filter((listing) => !seen.has(listing.id))];
      });
      setVisibleLimit((current) => current + 24);
      setNextPage(result.page + 1);
      if (!result.listings.length || result.page * result.pageSize >= result.total) setDone(true);
    } catch {
      toast.error("Could not load more listings.");
    } finally {
      setLoading(false);
    }
  }

  // The independent lead can shift every secondary row after mount. Exclude
  // all currently allocated IDs, not just the featured ones. Retain fetched
  // records even while allocated elsewhere, so they can reappear if released.
  const seenIds = new Set(shownIds);
  const visibleItems = [...initial, ...loadedItems].filter((listing) => {
    if (seenIds.has(listing.id)) return false;
    seenIds.add(listing.id);
    return true;
  });
  if (!visibleItems.length && done) return null;

  return (
    <section className="mt-16" aria-labelledby="keep-browsing-heading">
      <div className="border-b border-border pb-3">
        <h2 id="keep-browsing-heading" className="text-[26px] font-bold tracking-tight">
          Keep browsing
        </h2>
      </div>
      {visibleItems.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {visibleItems.slice(0, visibleLimit).map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
      {(!done || visibleItems.length > visibleLimit) && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="inline-flex h-11 items-center rounded-full border border-input bg-card px-6 text-[13.5px] font-semibold shadow-sm disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </section>
  );
}

function HomepageInfoBand({
  eyebrow,
  title,
  body,
  action,
  to,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  body: string;
  action: string;
  to: "/sell" | "/browse";
  tone?: "default" | "accent";
}) {
  return (
    <section
      className={`mt-16 overflow-hidden rounded-[24px] border px-6 py-8 sm:px-8 ${
        tone === "accent" ? "border-accent/40 bg-accent/15" : "border-border bg-secondary/70"
      }`}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="max-w-[30ch] text-[22px] font-bold tracking-tight sm:text-[26px]">
            {title}
          </h2>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
        <Link to={to} className={`${seeAll} sm:mb-1`}>
          {action} <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}

const EMPTY_ROW_TITLE = "Bluebird is just getting started.";

function EmptyState({ title, body }: { title: string; body: string }) {
  return <BluebirdEmptyState headingLevel="h2" className="mt-5" title={title} description={body} />;
}
