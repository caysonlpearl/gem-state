import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  Check,
  FunnelSimple,
  MapPin,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoRegions, usStates, vehicleOptions } from "@/config/classifieds";
import { ListingCard, ListingRow } from "@/components/classifieds/ListingCard";
import { conditionLabels, isMotorsCategory } from "@/lib/classifieds-display";
import { browseClassifieds, type ClassifiedBrowseInput } from "@/lib/classifieds.functions";
import { trackEvent } from "@/lib/analytics";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Sort = NonNullable<ClassifiedBrowseInput["sort"]>;
type View = "grid" | "list";
type HomeTab = "build" | "buy" | "rent";

type Search = {
  q?: string | undefined;
  category?: string | undefined;
  group?: "motors" | "classifieds" | undefined;
  state?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  condition?: string | undefined;
  fulfillment?: string | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  make?: string | undefined;
  model?: string | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
  mileageMax?: number | undefined;
  bodyStyle?: string | undefined;
  transmission?: string | undefined;
  drivetrain?: string | undefined;
  fuelType?: string | undefined;
  exteriorColor?: string | undefined;
  titleStatus?: string | undefined;
  sort?: Sort | undefined;
  view?: View | undefined;
  page?: number | undefined;
  homeMode?: "landing" | "results" | undefined;
  homeTab?: HomeTab | undefined;
  homeLocation?: string | undefined;
  homePrice?: string | undefined;
  propertyType?: string | undefined;
  bedrooms?: string | undefined;
  bathrooms?: string | undefined;
  homeSquareFeet?: string | undefined;
  homeBuilder?: string | undefined;
  constructionType?: string | undefined;
  homeAcres?: string | undefined;
  homeSellerType?: string | undefined;
  petsCats?: string | undefined;
  petsDogs?: string | undefined;
  homeAmenities?: string | undefined;
  communityAmenities?: string | undefined;
  leaseLength?: string | undefined;
};

type VehicleHeroFilter =
  | "makeModel"
  | "year"
  | "price"
  | "mileage"
  | "bodyStyle"
  | "sellerType"
  | "titleStatus"
  | "location"
  | "condition"
  | "fulfillment"
  | "drivetrain"
  | "transmission"
  | "fuelType"
  | "exteriorColor";

const conditionOptions = Object.entries(conditionLabels);

const sortOptions: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "mileage_low", label: "Mileage: low to high" },
];

const homeTabs: { value: HomeTab; label: string; eyebrow: string }[] = [
  { value: "build", label: "Build", eyebrow: "New construction" },
  { value: "buy", label: "Buy", eyebrow: "Homes for sale" },
  { value: "rent", label: "Rent", eyebrow: "Places to rent" },
];

const homePropertyTypes = ["Any property type", "Single family", "Townhome", "Condo", "Land", "Multi-family"];
const homePriceOptions = ["Any price", "Under $250k", "$250k–$500k", "$500k–$750k", "$750k+"];
const rentPriceOptions = ["Any price", "Under $1,500", "$1,500–$2,500", "$2,500–$3,500", "$3,500+"];
const homeBedroomOptions = ["Any bedrooms", "Studio", "1+ bedrooms", "2+ bedrooms", "3+ bedrooms", "4+ bedrooms"];
const homeBathroomOptions = ["Any bathrooms", "1+ bathrooms", "2+ bathrooms", "3+ bathrooms", "4+ bathrooms"];
const homeSquareFeetOptions = ["Any", "<250", "250+", "500+", "1000+", "1500+", "2000+", "3000+", "4000+", "5000+", "10000+"];
const homeAcresOptions = ["Any", "< .10", ".10+", ".20+", ".25+", ".30+", ".5+", ".75+", "1+", "1.5+", "2+", "2.5+"];
const homeAmenitiesOptions = [
  "Any",
  "Air Conditioning",
  "Attached Garage",
  "Balcony",
  "Carpet",
  "Ceiling Fan(s)",
  "Crown Molding",
  "Controlled Access",
  "Deck",
  "Dishwasher",
  "Energy Efficient",
  "Fireplace",
  "Furnished",
  "Handicap Accessible",
  "Hardwood Flooring",
  "Heating",
  "High ceilings",
  "Internet Ready",
  "New Paint",
  "Newly Remodeled",
  "Parking",
];
const communityAmenitiesOptions = [
  "Any",
  "BBQ Area(s)",
  "Basketball Court",
  "Bike Lockers/Storage",
  "Bluetooth Enabled Spaces",
  "Business Center",
  "Clubhouse",
  "Community Garden",
  "Dog Park",
  "Elevator Access",
  "Fenced Yard",
  "Parcel Lockers",
  "Pet Washing Station",
  "Pickleball",
  "Playground",
  "Pool",
  "Public Transit Nearby",
  "Splash Pad",
  "Storage",
  "Tennis",
  "Theater Room",
  "Volleyball",
  "WiFi in Common Areas",
];
const leaseLengthOptions = [
  "Any",
  "Month-to-month",
  "1 Month or Less",
  "2 Months or Less",
  "3 Months or Less",
  "4 Months or Less",
  "5 Months or Less",
  "6 Months or Less",
  "9 Months or Less",
  "12 Months or Less",
  "18 Months or Less",
  "24 Months or Less",
];

const homePreviewRows = [
  {
    title: "Featured homes for sale",
    action: "Browse homes for sale",
    cards: [
      { name: "Riverstone at Banbury", location: "Eagle, ID", price: "$524,900", facts: "3 bed · 2.5 bath · 2,146 sqft", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" },
      { name: "North End Bungalow", location: "Boise, ID", price: "$649,000", facts: "4 bed · 2 bath · 1,988 sqft", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" },
      { name: "Sage Creek Townhomes", location: "Meridian, ID", price: "$419,900", facts: "3 bed · 2.5 bath · 1,742 sqft", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80" },
      { name: "Canyon Rim Estates", location: "Nampa, ID", price: "$489,900", facts: "3 bed · 2 bath · 1,876 sqft", image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80" },
      { name: "Juniper Ridge", location: "Star, ID", price: "$719,000", facts: "4 bed · 3 bath · 2,492 sqft", image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=80" },
      { name: "The Owyhee Collection", location: "Kuna, ID", price: "$379,900", facts: "3 bed · 2 bath · 1,604 sqft", image: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80" },
    ],
  },
  {
    title: "New builds to explore",
    action: "Find new construction",
    cards: [
      { name: "Aspen Grove", location: "Meridian, ID", price: "From $499,900", facts: "2–5 bed · 1,550–2,800 sqft", image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80" },
      { name: "Cottonwood Crossing", location: "Star, ID", price: "From $559,900", facts: "3–4 bed · 2–3 bath", image: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80" },
      { name: "The Preserve", location: "Eagle, ID", price: "From $799,900", facts: "3–5 bed · 2,100+ sqft", image: "https://images.unsplash.com/photo-1600047508788-786f386c0f2d?auto=format&fit=crop&w=900&q=80" },
      { name: "Overland Park", location: "Boise, ID", price: "From $449,900", facts: "Townhomes · 2–3 bed", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80" },
      { name: "Hillside Terrace", location: "Nampa, ID", price: "Call for pricing", facts: "Single-family homes", image: "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=900&q=80" },
      { name: "Harvest Point", location: "Caldwell, ID", price: "From $389,900", facts: "2–4 bed · 2 bath", image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80" },
    ],
  },
  {
    title: "Rentals worth a look",
    action: "Browse rentals",
    cards: [
      { name: "The Franklin", location: "Boise, ID", price: "$1,895 / mo", facts: "2 bed · 2 bath · Downtown", image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80" },
      { name: "Parkside Flats", location: "Meridian, ID", price: "$1,650 / mo", facts: "1 bed · 1 bath · Pet friendly", image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80" },
      { name: "Warm Springs House", location: "Boise, ID", price: "$2,750 / mo", facts: "3 bed · 2 bath · Fenced yard", image: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80" },
      { name: "The Village Lofts", location: "Meridian, ID", price: "$2,150 / mo", facts: "2 bed · 2 bath · Garage", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80" },
      { name: "Canyon View Apartments", location: "Nampa, ID", price: "$1,425 / mo", facts: "1 bed · 1 bath · Pool", image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80" },
      { name: "Maple Street Cottage", location: "Eagle, ID", price: "$2,400 / mo", facts: "3 bed · 2 bath · No HOA", image: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80" },
    ],
  },
] as const;

const classifiedQuery = (input: ClassifiedBrowseInput) =>
  queryOptions({
    queryKey: ["classified-browse", input],
    queryFn: () => browseClassifieds({ data: input }),
  });

function stringParam(search: Record<string, unknown>, key: string, max = 80) {
  const value = search[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function numberParam(search: Record<string, unknown>, key: string) {
  const value = Number(search[key]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function inputFromSearch(search: Search): ClassifiedBrowseInput {
  return {
    q: search.q,
    category: search.category,
    group: search.group,
    state: search.state,
    region: search.region,
    city: search.city,
    condition: search.condition,
    fulfillment: search.fulfillment,
    priceMin: search.priceMin,
    priceMax: search.priceMax,
    make: search.make,
    model: search.model,
    yearMin: search.yearMin,
    yearMax: search.yearMax,
    mileageMax: search.mileageMax,
    bodyStyle: search.bodyStyle,
    transmission: search.transmission,
    drivetrain: search.drivetrain,
    fuelType: search.fuelType,
    exteriorColor: search.exteriorColor,
    titleStatus: search.titleStatus,
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
  };
}

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const group = stringParam(search, "group", 20);
    const sort = stringParam(search, "sort", 20);
    const view = stringParam(search, "view", 10);
    const homeMode = stringParam(search, "homeMode", 10);
    const homeTab = stringParam(search, "homeTab", 10);
    const page = Number(search["page"]);
    return {
      q: stringParam(search, "q"),
      category: stringParam(search, "category", 60),
      group: group === "motors" || group === "classifieds" ? group : undefined,
      state: stringParam(search, "state", 2)?.toUpperCase(),
      region: stringParam(search, "region"),
      city: stringParam(search, "city"),
      condition: stringParam(search, "condition", 30),
      fulfillment: stringParam(search, "fulfillment", 20),
      priceMin: numberParam(search, "priceMin"),
      priceMax: numberParam(search, "priceMax"),
      make: stringParam(search, "make"),
      model: stringParam(search, "model"),
      yearMin: numberParam(search, "yearMin"),
      yearMax: numberParam(search, "yearMax"),
      mileageMax: numberParam(search, "mileageMax"),
      bodyStyle: stringParam(search, "bodyStyle", 30),
      transmission: stringParam(search, "transmission", 30),
      drivetrain: stringParam(search, "drivetrain", 20),
      fuelType: stringParam(search, "fuelType", 30),
      exteriorColor: stringParam(search, "exteriorColor", 30),
      titleStatus: stringParam(search, "titleStatus", 30),
      sort: (sortOptions.map((option) => option.value) as string[]).includes(sort ?? "")
        ? (sort as Sort)
        : undefined,
      view: view === "list" ? "list" : view === "grid" ? "grid" : undefined,
      page: page > 1 ? page : undefined,
      homeMode: homeMode === "results" ? "results" : homeMode === "landing" ? "landing" : undefined,
      homeTab: homeTab === "build" || homeTab === "rent" ? homeTab : homeTab === "buy" ? "buy" : undefined,
      homeLocation: stringParam(search, "homeLocation"),
      homePrice: stringParam(search, "homePrice", 30),
      propertyType: stringParam(search, "propertyType", 40),
      bedrooms: stringParam(search, "bedrooms", 30),
      bathrooms: stringParam(search, "bathrooms", 30),
      homeSquareFeet: stringParam(search, "homeSquareFeet", 30),
      homeBuilder: stringParam(search, "homeBuilder", 60),
      constructionType: stringParam(search, "constructionType", 40),
      homeAcres: stringParam(search, "homeAcres", 30),
      homeSellerType: stringParam(search, "homeSellerType", 40),
      petsCats: stringParam(search, "petsCats", 20),
      petsDogs: stringParam(search, "petsDogs", 20),
      homeAmenities: stringParam(search, "homeAmenities", 40),
      communityAmenities: stringParam(search, "communityAmenities", 40),
      leaseLength: stringParam(search, "leaseLength", 30),
    };
  },
  head: () => ({
    meta: [
      { title: `Browse Idaho classifieds — ${brand.name}` },
      {
        name: "description",
        content:
          "Search Idaho classifieds by category, region, price, condition, and detailed vehicle filters including make, model, year, mileage, drivetrain, fuel type, and title status.",
      },
      { property: "og:title", content: `Browse Idaho classifieds — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Find cars, trucks, powersports, furniture, tools, and more from sellers across Idaho.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(classifiedQuery(inputFromSearch(deps)));
  },
  component: Browse,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">The classifieds did not load</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        The connection dropped before the listings finished loading. Nothing was lost — try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-md border border-input px-4 text-[13px] font-semibold hover:bg-secondary"
      >
        Retry
      </button>
    </main>
  ),
});

function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: result } = useSuspenseQuery(classifiedQuery(inputFromSearch(search)));
  const [term, setTerm] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setTerm(search.q ?? ""), [search.q]);

  useEffect(() => {
    void trackEvent("page_view", { route: "/browse" });
  }, []);

  useEffect(() => {
    if (!search.q) return;
    void trackEvent(result.total === 0 ? "search_no_results" : "search_performed", {
      term_length: search.q.length,
      results: result.total,
      category: search.category ?? "all",
      region: search.region ?? "all",
    });
  }, [search.q, search.category, search.region, result.total]);

  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: undefined }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ) as Search;

  const scopedWithoutVehicleFilters = (patch: Partial<Search>): Search =>
    scoped({
      make: undefined,
      model: undefined,
      yearMin: undefined,
      yearMax: undefined,
      mileageMax: undefined,
      bodyStyle: undefined,
      transmission: undefined,
      drivetrain: undefined,
      fuelType: undefined,
      exteriorColor: undefined,
      titleStatus: undefined,
      ...patch,
    });

  const selectedCategory = classifiedCategories.find(
    (category) => category.slug === search.category,
  );
  const motors = search.group === "motors" || isMotorsCategory(search.category);
  const homes = search.category === "other-real-estate";
  const homeTab: HomeTab = search.homeTab ?? "buy";
  const homeLanding = homes && search.homeMode !== "results";
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const activeFilterCount = countActiveFilters(search, motors);
  const heading =
    selectedCategory?.name ??
    (search.group === "motors" ? "Cars & motors" : "All Idaho classifieds");

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const value = (key: string) => {
      const raw = values.get(key);
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    };
    const numeric = (key: string) => {
      const parsed = Number(value(key));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    };
    const category = value("category");
    const nextMotors = value("group") === "motors" || isMotorsCategory(category);

    void navigate({
      to: "/browse",
      search: scoped({
        category,
        group: category ? undefined : value("group") === "motors" ? "motors" : undefined,
        state: value("state")?.toUpperCase(),
        region: value("region"),
        city: value("city"),
        condition: value("condition"),
        fulfillment: value("fulfillment"),
        priceMin: numeric("priceMin"),
        priceMax: numeric("priceMax"),
        make: nextMotors ? value("make") : undefined,
        model: nextMotors ? value("model") : undefined,
        yearMin: nextMotors ? numeric("yearMin") : undefined,
        yearMax: nextMotors ? numeric("yearMax") : undefined,
        mileageMax: nextMotors ? numeric("mileageMax") : undefined,
        bodyStyle: nextMotors ? value("bodyStyle") : undefined,
        transmission: nextMotors ? value("transmission") : undefined,
        drivetrain: nextMotors ? value("drivetrain") : undefined,
        fuelType: nextMotors ? value("fuelType") : undefined,
        exteriorColor: nextMotors ? value("exteriorColor") : undefined,
        titleStatus: nextMotors ? value("titleStatus") : undefined,
      }),
    });
    setFiltersOpen(false);
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8">
      {motors && (
        <VehicleBrowseHero
          search={search}
          resultCount={result.total}
          activeFilterCount={activeFilterCount}
          term={term}
          onTermChange={setTerm}
          onSearch={() =>
            void navigate({ to: "/browse", search: scoped({ q: term.trim() || undefined }) })
          }
          onFilterChange={(patch) => void navigate({ to: "/browse", search: scoped(patch) })}
          onSell={() => void navigate({ to: "/create-listing" })}
        />
      )}

      {homeLanding && (
        <HomesLandingHero
          activeTab={homeTab}
          location={search.homeLocation ?? search.q ?? ""}
          resultCount={result.total}
          onTabChange={(tab) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab: tab, homeMode: "landing" }),
            })
          }
          onSearch={(location) =>
            void navigate({
              to: "/browse",
              search: scoped({
                category: "other-real-estate",
                homeTab,
                homeMode: "results",
                q: location.trim() || undefined,
                homeLocation: location.trim() || undefined,
              }),
            })
          }
          onMoreFilters={() =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab, homeMode: "results" }),
            })
          }
        />
      )}

      {homes && !homeLanding && (
        <HomesFilterPage
          activeTab={homeTab}
          search={search}
          resultCount={result.total}
          onTabChange={(tab) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab: tab, homeMode: "results" }),
            })
          }
          onApply={(patch) =>
            void navigate({
              to: "/browse",
              search: scoped({ category: "other-real-estate", homeTab, homeMode: "results", ...patch }),
            })
          }
        />
      )}

      {homeLanding && <HomeShowcaseRows />}

      <div className={`flex flex-wrap items-end justify-between gap-3 ${motors || homes ? "mt-7" : ""} ${homes ? "hidden" : ""}`}>
        <div className={motors ? "hidden" : ""}>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
            Gem State classifieds
          </p>
          <h1 className="mt-2 text-[30px] font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
            Search listings from sellers across Idaho. Vehicle shoppers can narrow by the details
            that matter before they open a listing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground" htmlFor="sort">
            Sort
          </label>
          <select
            id="sort"
            value={search.sort ?? "newest"}
            onChange={(event) =>
              void navigate({ to: "/browse", search: scoped({ sort: event.target.value as Sort }) })
            }
            className="h-9 rounded-md border border-input bg-card px-2 text-[13px]"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Link
            to="/browse"
            search={scoped({ view: "grid" })}
            aria-label="Grid view"
            className={`hidden h-9 items-center rounded-md border px-2 text-[12px] sm:inline-flex ${search.view !== "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
          >
            Grid
          </Link>
          <Link
            to="/browse"
            search={scoped({ view: "list" })}
            aria-label="List view"
            className={`hidden h-9 items-center rounded-md border px-2 text-[12px] sm:inline-flex ${search.view === "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
          >
            List
          </Link>
        </div>
      </div>

      {!motors && !homes && (
        <form
          className="floating-card mt-8 p-2 sm:p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({ to: "/browse", search: scoped({ q: term.trim() || undefined }) });
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
              placeholder="Search cars, tools, furniture, and more"
              aria-label="Search classifieds"
              className="h-12 w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </form>
      )}

      {!motors && !homes && <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        <BrowsePill
          active={!search.group && !search.category}
          search={scopedWithoutVehicleFilters({ group: undefined, category: undefined })}
        >
          All listings
        </BrowsePill>
        <BrowsePill
          active={search.group === "motors" || motors}
          search={scoped({ group: "motors", category: undefined })}
        >
          Cars & motors
        </BrowsePill>
        {classifiedCategories
          .filter((category) => category.group === "classifieds")
          .map((category) => (
            <BrowsePill
              key={category.slug}
              active={search.category === category.slug}
              search={scopedWithoutVehicleFilters({ category: category.slug, group: undefined })}
            >
              {category.name}
          </BrowsePill>
        ))}
      </div>}

      <div className={`${motors || homes ? "mt-6" : "mt-8"} ${homeLanding ? "hidden" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={motors || homes ? "hidden" : "text-[13px] text-muted-foreground"}>
            <span className="numeric font-semibold text-foreground">{result.total}</span>{" "}
            {result.total === 1 ? "listing" : "listings"}
          </p>
          {!motors && !homes && <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-5 text-[13px] font-semibold shadow-sm transition-shadow hover:shadow-md ${motors || homes ? "hidden" : ""}`}
              >
                <FunnelSimple size={17} className="text-primary" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
              <SheetHeader className="border-b border-border px-6 py-6 pr-16 text-left">
                <SheetTitle className="text-[22px] tracking-tight">Filter listings</SheetTitle>
                <SheetDescription>
                  Narrow down local items, or add every vehicle detail that matters.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={applyFilters} className="space-y-6 px-6 py-6">
            <input type="hidden" name="group" value={search.group ?? ""} />
            <FilterSection title="Category">
              <select name="category" defaultValue={search.category ?? ""} className="filter-input">
                <option value="">All categories</option>
                {classifiedCategories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FilterSection>

            <FilterSection title="Location" icon={<MapPin size={13} className="text-primary" />}>
              <select name="region" defaultValue={search.region ?? ""} className="filter-input">
                <option value="">All of Idaho</option>
                {idahoRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <select name="state" defaultValue={search.state ?? ""} className="filter-input">
                <option value="">All states</option>
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                name="city"
                defaultValue={search.city ?? ""}
                placeholder="City"
                className="filter-input"
                maxLength={80}
              />
            </FilterSection>

            <FilterSection title="Price">
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="priceMin"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={search.priceMin ?? ""}
                  placeholder="Min"
                  className="filter-input"
                />
                <input
                  name="priceMax"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={search.priceMax ?? ""}
                  placeholder="Max"
                  className="filter-input"
                />
              </div>
            </FilterSection>

            <FilterSection title="Condition and fulfillment">
              <select
                name="condition"
                defaultValue={search.condition ?? ""}
                className="filter-input"
              >
                <option value="">Any condition</option>
                {conditionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                name="fulfillment"
                defaultValue={search.fulfillment ?? ""}
                className="filter-input"
              >
                <option value="">Any fulfillment</option>
                <option value="local_pickup">Local pickup</option>
                <option value="shipping">Ships</option>
                <option value="both">Pickup or shipping</option>
              </select>
            </FilterSection>

            {motors && (
              <FilterSection title="Vehicle details">
                <input
                  list="vehicle-makes"
                  name="make"
                  defaultValue={search.make ?? ""}
                  placeholder="Make / brand"
                  className="filter-input"
                  maxLength={80}
                />
                <datalist id="vehicle-makes">
                  {vehicleOptions.makes.map((make) => (
                    <option key={make} value={make} />
                  ))}
                </datalist>
                <input
                  name="model"
                  defaultValue={search.model ?? ""}
                  placeholder="Model"
                  className="filter-input"
                  maxLength={80}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    name="yearMin"
                    type="number"
                    min="1900"
                    max="2100"
                    step="1"
                    defaultValue={search.yearMin ?? ""}
                    placeholder="Year from"
                    className="filter-input"
                  />
                  <input
                    name="yearMax"
                    type="number"
                    min="1900"
                    max="2100"
                    step="1"
                    defaultValue={search.yearMax ?? ""}
                    placeholder="Year to"
                    className="filter-input"
                  />
                </div>
                <input
                  name="mileageMax"
                  type="number"
                  min="0"
                  step="1000"
                  defaultValue={search.mileageMax ?? ""}
                  placeholder="Max mileage"
                  className="filter-input"
                />
                <select
                  name="bodyStyle"
                  defaultValue={search.bodyStyle ?? ""}
                  className="filter-input"
                >
                  <option value="">Any body style</option>
                  {vehicleOptions.bodyStyles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="drivetrain"
                  defaultValue={search.drivetrain ?? ""}
                  className="filter-input"
                >
                  <option value="">Any drivetrain</option>
                  {vehicleOptions.drivetrains.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="transmission"
                  defaultValue={search.transmission ?? ""}
                  className="filter-input"
                >
                  <option value="">Any transmission</option>
                  {vehicleOptions.transmissions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="fuelType"
                  defaultValue={search.fuelType ?? ""}
                  className="filter-input"
                >
                  <option value="">Any fuel type</option>
                  {vehicleOptions.fuelTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="exteriorColor"
                  defaultValue={search.exteriorColor ?? ""}
                  className="filter-input"
                >
                  <option value="">Any exterior color</option>
                  {vehicleOptions.exteriorColors.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="titleStatus"
                  defaultValue={search.titleStatus ?? ""}
                  className="filter-input"
                >
                  <option value="">Any title status</option>
                  {vehicleOptions.titleStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FilterSection>
            )}

                <button
                  type="submit"
                  className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  Show {result.total} {result.total === 1 ? "listing" : "listings"}
                </button>
              </form>
            </SheetContent>
          </Sheet>}
        </div>

        <section id="results" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={motors ? "hidden" : "text-[12.5px] text-muted-foreground"}>
              <span className="numeric">{result.total}</span>{" "}
              {result.total === 1 ? "listing" : "listings"}
              {search.q ? <span> matching “{search.q}”</span> : null}
            </p>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilterLabels(search, motors).map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[10.5px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
                <Link
                  to="/browse"
                  search={scoped({ category: undefined, group: search.group })}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-accent"
                >
                  <X size={11} /> Clear
                </Link>
              </div>
            )}
          </div>

          {result.listings.length === 0 ? (
            <div className="soft-card mt-5 px-5 py-12 text-center">
              <p className="text-[14px] font-medium">No listings match these filters.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                {homes
                  ? "Try widening the price, location, property type, or bedroom filters."
                  : "Try widening the year, price, mileage, location, or vehicle filters."}
              </p>
              <Link
                to="/browse"
                search={scoped({ category: undefined, group: search.group })}
                className="mt-4 inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </Link>
            </div>
          ) : search.view === "list" ? (
            <ul className="mt-5 space-y-4">
              {result.listings.map((listing) => (
                <li key={listing.id}>
                  <ListingRow listing={listing} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-4">
              {result.listings.map((listing) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <Link
                to="/browse"
                search={scoped({ page: page > 2 ? page - 1 : undefined })}
                disabled={page <= 1}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
                aria-disabled={page <= 1}
              >
                Previous
              </Link>
              <span className="numeric text-[12.5px] text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Link
                to="/browse"
                search={scoped({ page: page + 1 })}
                disabled={page >= pageCount}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
                aria-disabled={page >= pageCount}
              >
                Next
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function HomesLandingHero({
  activeTab,
  location,
  resultCount,
  onTabChange,
  onSearch,
  onMoreFilters,
}: {
  activeTab: HomeTab;
  location: string;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onSearch: (location: string) => void;
  onMoreFilters: () => void;
}) {
  const [draft, setDraft] = useState(location);

  useEffect(() => setDraft(location), [location]);

  return (
    <section
      aria-label="GemList Homes"
      className="relative isolate min-h-[610px] overflow-hidden rounded-[32px] bg-primary bg-cover bg-center shadow-xl sm:min-h-[680px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(11 26 38 / 72%), rgb(11 26 38 / 38%) 52%, rgb(11 26 38 / 18%)), url(https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=85)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-primary/55 via-transparent to-primary/15" />
      <div className="relative flex min-h-[610px] items-center justify-center px-4 py-12 sm:min-h-[680px] sm:px-8">
        <div className="w-full max-w-[650px] rounded-[28px] border border-white/20 bg-primary/80 p-5 text-primary-foreground shadow-2xl backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">GemList Homes</p>
          <h1 className="mt-3 text-center font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
            Build. Buy. Rent.
            <span className="block text-accent">All in one place.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[43ch] text-center text-[14px] leading-relaxed text-white/80 sm:text-[15px]">
            Find your next home, discover new communities, and explore rentals from local Idaho sellers and property managers.
          </p>

          <div className="mt-7 grid grid-cols-3 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            {homeTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={activeTab === tab.value}
                onClick={() => onTabChange(tab.value)}
                className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors sm:text-[15px] ${activeTab === tab.value ? "bg-accent text-accent-foreground shadow-sm" : "text-white/85 hover:bg-white/10"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex flex-col gap-2 rounded-2xl bg-card p-2 text-foreground sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(draft);
            }}
          >
            <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
              <MapPin size={19} weight="duotone" className="shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">County, city, neighborhood, or ZIP</span>
              <input
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="County, city, neighborhood, or ZIP"
                aria-label="County, city, neighborhood, or ZIP"
                className="h-12 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <MagnifyingGlass size={17} aria-hidden="true" />
              Search homes
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <span className="text-white/70">{resultCount.toLocaleString()} local listings to explore</span>
            <button
              type="button"
              onClick={onMoreFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/70 px-4 py-2 font-bold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              More filters
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeShowcaseRows() {
  return (
    <div className="mt-10 space-y-12 sm:mt-14 sm:space-y-16">
      {homePreviewRows.map((row) => (
        <section key={row.title} aria-labelledby={row.title.replaceAll(" ", "-").toLowerCase()}>
          <div className="mb-4 flex items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Homes</p>
              <h2 id={row.title.replaceAll(" ", "-").toLowerCase()} className="mt-1 text-[22px] font-bold tracking-tight sm:text-[27px]">
                {row.title}
              </h2>
            </div>
            <Link
              to="/browse"
              search={{ category: "other-real-estate", homeMode: "results", homeTab: row.title.includes("Rent") ? "rent" : row.title.includes("build") ? "build" : "buy" }}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary hover:underline"
            >
              {row.action}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="no-scrollbar grid grid-flow-col auto-cols-[minmax(215px,1fr)] gap-4 overflow-x-auto pb-2 sm:auto-cols-[minmax(240px,1fr)] lg:grid-flow-row lg:grid-cols-6 lg:overflow-visible">
            {row.cards.map((card) => (
              <li key={`${row.title}-${card.name}`}>
                <HomePreviewCard card={card} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HomePreviewCard({
  card,
}: {
  card: (typeof homePreviewRows)[number]["cards"][number];
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        <img
          src={card.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-primary/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground backdrop-blur">
          GemList Homes
        </span>
      </div>
      <div className="p-3.5">
        <p className="numeric text-[16px] font-bold text-primary">{card.price}</p>
        <h3 className="mt-1 text-[13px] font-bold leading-tight">{card.name}</h3>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{card.location}</p>
        <p className="mt-2 truncate text-[11px] text-muted-foreground">{card.facts}</p>
      </div>
    </article>
  );
}

function HomesFilterPage({
  activeTab,
  search,
  resultCount,
  onTabChange,
  onApply,
}: {
  activeTab: HomeTab;
  search: Search;
  resultCount: number;
  onTabChange: (tab: HomeTab) => void;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [location, setLocation] = useState(search.homeLocation ?? search.q ?? "");
  const [propertyType, setPropertyType] = useState(search.propertyType ?? "");
  const [homePrice, setHomePrice] = useState(search.homePrice ?? "");
  const [bedrooms, setBedrooms] = useState(search.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(search.bathrooms ?? "");
  const [extra, setExtra] = useState<Record<string, string>>({
    homeSquareFeet: search.homeSquareFeet ?? "",
    homeBuilder: search.homeBuilder ?? "",
    constructionType: search.constructionType ?? "",
    homeAcres: search.homeAcres ?? "",
    homeSellerType: search.homeSellerType ?? "",
    petsCats: search.petsCats ?? "",
    petsDogs: search.petsDogs ?? "",
    homeAmenities: search.homeAmenities ?? "",
    communityAmenities: search.communityAmenities ?? "",
    leaseLength: search.leaseLength ?? "",
  });

  useEffect(() => {
    setLocation(search.homeLocation ?? search.q ?? "");
    setPropertyType(search.propertyType ?? "");
    setHomePrice(search.homePrice ?? "");
    setBedrooms(search.bedrooms ?? "");
    setBathrooms(search.bathrooms ?? "");
  }, [search.homeLocation, search.q, search.homePrice, search.propertyType, search.bedrooms, search.bathrooms]);

  const priceOptions = activeTab === "rent" ? rentPriceOptions : homePriceOptions;
  const extraFields = activeTab === "build"
    ? [
        { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
        { key: "homeBuilder", label: "Home builder", options: ["Any builder", "Local builders", "National builders"], multi: false },
      ]
      : activeTab === "buy"
      ? [
          { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
          { key: "constructionType", label: "Construction type", options: ["Any construction", "New construction", "Existing home"], multi: false },
          { key: "homeAcres", label: "Acres", options: homeAcresOptions, multi: false },
          { key: "homeSellerType", label: "Seller type", options: ["Any seller", "Owner", "Agent", "Builder"], multi: false },
        ]
      : [
          { key: "petsCats", label: "Cats", options: ["Any cat policy", "Cats allowed", "Cats not allowed"], multi: false },
          { key: "petsDogs", label: "Dogs", options: ["Any dog policy", "Dogs allowed", "Dogs not allowed"], multi: false },
          { key: "homeAmenities", label: "Home amenities", options: homeAmenitiesOptions, multi: true },
          { key: "communityAmenities", label: "Community amenities", options: communityAmenitiesOptions, multi: true },
          { key: "leaseLength", label: "Lease length", options: leaseLengthOptions, multi: false },
          { key: "homeSquareFeet", label: "Square feet", options: homeSquareFeetOptions, multi: false },
        ];

  function apply() {
    onApply({
      q: location.trim() || undefined,
      homeLocation: location.trim() || undefined,
      propertyType: propertyType || undefined,
      homePrice: homePrice || undefined,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      ...Object.fromEntries(extraFields.map(({ key }) => [key, extra[key] || undefined])),
    });
  }

  return (
    <section className="floating-card relative mt-2 overflow-visible bg-surface px-4 py-5 sm:px-7 sm:py-7">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">GemList Homes</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight sm:text-[36px]">Find a gem to call home.</h1>
          <p className="mt-1 max-w-[55ch] text-[13px] text-muted-foreground">Search new builds, homes for sale, and rentals across Idaho.</p>
        </div>
        <div className="grid w-full max-w-[390px] grid-cols-3 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border/70">
          {homeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={activeTab === tab.value}
              onClick={() => onTabChange(tab.value)}
              className={`rounded-xl px-2 py-3 text-[13px] font-bold transition-colors ${activeTab === tab.value ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <HomeFilterControl label="County, city, neighborhood, or ZIP" value={location} onChange={setLocation} input />
        <HomeFilterControl label="Property type" value={propertyType} options={homePropertyTypes} onChange={setPropertyType} />
        <HomeFilterControl label="Price" value={homePrice} options={priceOptions} onChange={setHomePrice} />
        <HomeFilterControl label="Bedrooms" value={bedrooms} options={homeBedroomOptions} onChange={setBedrooms} />
        <HomeFilterControl label={activeTab === "rent" ? "Bathrooms" : "Bathrooms"} value={bathrooms} options={homeBathroomOptions} onChange={setBathrooms} />
        <button type="submit" className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary hover:text-primary-foreground">Search</button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-[12px] text-muted-foreground"><strong className="numeric text-foreground">{resultCount.toLocaleString()}</strong> {homeTabs.find((tab) => tab.value === activeTab)?.eyebrow.toLowerCase()}</span>
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
        >
          <FunnelSimple size={15} aria-hidden="true" />
          {showAll ? "Hide all filters" : "All filters"}
          <CaretDown size={14} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
        </button>
      </div>

      {showAll && (
        <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {extraFields.map((field) => (
            <div key={field.key} className="min-w-0">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{field.label}</p>
              <HomeFilterControl
                label={field.label}
                value={extra[field.key] ?? ""}
                options={field.options}
                multi={field.multi}
                onChange={(value) => setExtra((current) => ({ ...current, [field.key]: value }))}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HomeFilterControl({
  label,
  value,
  options,
  onChange,
  input = false,
  multi = false,
}: {
  label: string;
  value: string;
  options?: readonly string[];
  onChange: (value: string) => void;
  input?: boolean;
  multi?: boolean;
}) {
  if (multi && options) {
    return <HomeMultiSelectControl label={label} value={value} options={options} onChange={onChange} />;
  }

  return input ? (
    <label className="flex h-[88px] min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
      <MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" />
    </label>
  ) : (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-[88px] w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary">
        {options?.map((option) => <option key={option} value={option === options[0] ? "" : option}>{option}</option>)}
      </select>
      <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </label>
  );
}

function HomeMultiSelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split("||").filter(Boolean) : [];
  const summary = selected.length === 0
    ? options[0]
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  function toggle(option: string) {
    if (option === options[0]) {
      onChange("");
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join("||"));
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-[88px] w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <CaretDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-72 w-full min-w-[230px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {options.map((option) => {
            const checked = option === options[0] ? selected.length === 0 : selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(option)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] hover:bg-secondary"
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                  {checked && <Check size={11} weight="bold" aria-hidden="true" />}
                </span>
                <span className="truncate">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VehicleBrowseHero({
  search,
  resultCount,
  activeFilterCount,
  term,
  onTermChange,
  onSearch,
  onFilterChange,
  onSell,
}: {
  search: Search;
  resultCount: number;
  activeFilterCount: number;
  term: string;
  onTermChange: (value: string) => void;
  onSearch: () => void;
  onFilterChange: (patch: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [expandedFilter, setExpandedFilter] = useState<VehicleHeroFilter | null>(null);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const locationLabel = search.city
    ? `${search.city}${search.state ? `, ${search.state}` : ""}`
    : search.region ?? search.state ?? "All of Idaho";
  const yearLabel =
    search.yearMin != null || search.yearMax != null
      ? `${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`
      : "Year";
  const priceLabel =
    search.priceMin != null || search.priceMax != null
      ? `$${search.priceMin ?? 0}–${search.priceMax ?? "up"}`
      : "Price";
  const makeModelLabel = search.make || search.model || "Make / model";
  const toggleFilter = (filter: VehicleHeroFilter) =>
    setExpandedFilter((current) => (current === filter ? null : filter));
  const applyInlineFilter = (patch: Partial<Search>) => {
    onFilterChange(patch);
    setExpandedFilter(null);
  };

  const quickFilters: { key: VehicleHeroFilter; label: string; value?: string }[] = [
    { key: "makeModel", label: makeModelLabel },
    { key: "year", label: yearLabel },
    { key: "price", label: priceLabel },
    {
      key: "mileage",
      label: search.mileageMax != null ? `≤ ${search.mileageMax.toLocaleString()} mi` : "Mileage",
    },
    { key: "bodyStyle", label: search.bodyStyle ?? "Body type" },
    { key: "sellerType", label: "Seller type" },
    { key: "titleStatus", label: search.titleStatus ?? "Title type" },
  ];
  const additionalFilters: { key: VehicleHeroFilter; label: string }[] = [
    { key: "location", label: locationLabel === "All of Idaho" ? "Location" : locationLabel },
    { key: "condition", label: search.condition ?? "Condition" },
    { key: "fulfillment", label: search.fulfillment ?? "Delivery" },
    { key: "drivetrain", label: search.drivetrain ?? "Drive type" },
    { key: "transmission", label: search.transmission ?? "Transmission" },
    { key: "fuelType", label: search.fuelType ?? "Fuel type" },
    { key: "exteriorColor", label: search.exteriorColor ?? "Exterior color" },
  ];

  function filterPanel(filter: VehicleHeroFilter) {
    switch (filter) {
      case "makeModel":
        return <InlineMakeModelFilter search={search} onApply={applyInlineFilter} />;
      case "year":
        return (
          <InlineRangeFilter
            firstLabel="Year from"
            secondLabel="Year to"
            firstValue={search.yearMin}
            secondValue={search.yearMax}
            onApply={(first, second) =>
              applyInlineFilter({ yearMin: first, yearMax: second })
            }
          />
        );
      case "price":
        return (
          <InlineRangeFilter
            firstLabel="Min price"
            secondLabel="Max price"
            firstValue={search.priceMin}
            secondValue={search.priceMax}
            onApply={(first, second) =>
              applyInlineFilter({ priceMin: first, priceMax: second })
            }
            prefix="$"
          />
        );
      case "mileage":
        return (
          <InlineNumberFilter
            label="Maximum mileage"
            value={search.mileageMax}
            onApply={(value) => applyInlineFilter({ mileageMax: value })}
          />
        );
      case "bodyStyle":
        return (
          <InlineSelectFilter
            value={search.bodyStyle}
            options={vehicleOptions.bodyStyles}
            placeholder="Any body style"
            onChange={(value) => applyInlineFilter({ bodyStyle: value })}
          />
        );
      case "titleStatus":
        return (
          <InlineSelectFilter
            value={search.titleStatus}
            options={vehicleOptions.titleStatuses}
            placeholder="Any title type"
            onChange={(value) => applyInlineFilter({ titleStatus: value })}
          />
        );
      case "drivetrain":
        return (
          <InlineSelectFilter
            value={search.drivetrain}
            options={vehicleOptions.drivetrains}
            placeholder="Any drive type"
            onChange={(value) => applyInlineFilter({ drivetrain: value })}
          />
        );
      case "transmission":
        return (
          <InlineSelectFilter
            value={search.transmission}
            options={vehicleOptions.transmissions}
            placeholder="Any transmission"
            onChange={(value) => applyInlineFilter({ transmission: value })}
          />
        );
      case "fuelType":
        return (
          <InlineSelectFilter
            value={search.fuelType}
            options={vehicleOptions.fuelTypes}
            placeholder="Any fuel type"
            onChange={(value) => applyInlineFilter({ fuelType: value })}
          />
        );
      case "exteriorColor":
        return (
          <InlineSelectFilter
            value={search.exteriorColor}
            options={vehicleOptions.exteriorColors}
            placeholder="Any exterior color"
            onChange={(value) => applyInlineFilter({ exteriorColor: value })}
          />
        );
      case "location":
        return <InlineLocationFilter search={search} onApply={applyInlineFilter} />;
      case "condition":
        return (
          <InlineSelectFilter
            value={search.condition}
            options={conditionOptions.map(([value, label]) => ({ value, label }))}
            placeholder="Any condition"
            onChange={(value) => applyInlineFilter({ condition: value })}
          />
        );
      case "fulfillment":
        return (
          <InlineSelectFilter
            value={search.fulfillment}
            options={["local_pickup", "shipping", "both"]}
            optionLabels={{ local_pickup: "Local pickup", shipping: "Ships", both: "Pickup or shipping" }}
            placeholder="Any delivery option"
            onChange={(value) => applyInlineFilter({ fulfillment: value })}
          />
        );
      case "sellerType":
        return (
          <p className="max-w-[24ch] text-[12px] leading-relaxed text-muted-foreground">
            Seller type details will appear here as verified dealer and private-seller profiles are added.
          </p>
        );
    }
  }

  return (
    <section className="floating-card relative overflow-visible bg-surface px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-warm/35" />
        <div className="absolute -bottom-36 left-1/3 h-64 w-64 rounded-full bg-primary/5" />
      </div>

      <div className="relative">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Gem State motors
            </p>
            <h1 className="mt-2 max-w-[22ch] text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
              Find your next gem on wheels.
            </h1>
            <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
              Shop cars, trucks, powersports, trailers, and more from local sellers.
            </p>
          </div>

          <div className="grid w-full max-w-[360px] grid-cols-2 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border/70">
            <button
              type="button"
              className="h-14 rounded-xl bg-primary px-5 text-[16px] font-bold text-primary-foreground shadow-sm"
              aria-pressed="true"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={onSell}
              className="h-14 rounded-xl px-5 text-[16px] font-bold text-foreground transition-colors hover:bg-secondary"
            >
              Sell
            </button>
          </div>
        </div>

        <form
          className="mt-7 grid gap-2 rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border/60 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="relative flex h-14 items-center rounded-xl border border-transparent bg-secondary/55 px-3 focus-within:border-primary/40 focus-within:bg-card">
            <MagnifyingGlass size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search vehicles</span>
            <input
              type="search"
              value={term}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Search for..."
              aria-label="Search vehicles"
              className="min-w-0 flex-1 bg-transparent px-2 text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
            {term && (
              <button
                type="button"
                onClick={() => onTermChange("")}
                aria-label="Clear vehicle search"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          {quickFilters.map(({ key, label }, index) => (
            <VehicleQuickFilter
              key={key}
              label={label}
              expanded={expandedFilter === key}
              onClick={() => toggleFilter(key)}
            >
              {filterPanel(key)}
            </VehicleQuickFilter>
          ))}
          {showAllFilters &&
            additionalFilters.map(({ key, label }, index) => (
              <VehicleQuickFilter
                key={key}
                label={label}
                expanded={expandedFilter === key}
                onClick={() => toggleFilter(key)}
              >
                {filterPanel(key)}
              </VehicleQuickFilter>
            ))}
        </form>

        <div className="mt-5 flex flex-col gap-3 text-[12.5px] sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              setShowAllFilters(true);
              setExpandedFilter("location");
            }}
            className="inline-flex items-center gap-2 self-start text-primary hover:underline"
          >
            <MapPin size={18} weight="duotone" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]">Select location</span>
              <span className="mt-0.5 text-[12.5px] font-semibold">{locationLabel}</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setShowAllFilters((current) => !current);
                setExpandedFilter(null);
              }}
              className="inline-flex items-center gap-2 font-semibold text-primary hover:underline"
            >
              <FunnelSimple size={17} weight="duotone" aria-hidden="true" />
              {showAllFilters ? "Hide all search filters" : "Show all search filters"}
              {activeFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <a
              href="#results"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Show {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function VehicleQuickFilter({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${expanded ? "z-30" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className="flex h-[70px] w-full items-center justify-between rounded-xl border border-transparent bg-secondary/55 px-4 text-left text-[13.5px] font-semibold transition-colors hover:border-primary/40 hover:bg-card"
      >
        <span className="truncate">{label}</span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`ml-2 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-full rounded-xl bg-card p-4 shadow-xl ring-1 ring-border/70">
          {children}
        </div>
      )}
    </div>
  );
}

function InlineMakeModelFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [make, setMake] = useState(search.make ?? "");
  const [model, setModel] = useState(search.model ?? "");
  const [showMakes, setShowMakes] = useState(false);

  useEffect(() => {
    setMake(search.make ?? "");
    setModel(search.model ?? "");
  }, [search.make, search.model]);

  return (
    <div className="w-full space-y-2.5">
      <input
        value={make}
        onFocus={() => setShowMakes(true)}
        onChange={(event) => {
          setMake(event.target.value);
          setShowMakes(true);
        }}
        placeholder="Make or brand"
        className="filter-input"
      />
      {showMakes && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-sm">
          {vehicleOptions.makes
            .filter((option) => !make || option.toLowerCase().includes(make.toLowerCase()))
            .map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMake(option);
                  setShowMakes(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-[12px] hover:bg-secondary"
              >
                {option}
              </button>
            ))}
        </div>
      )}
      <input
        value={model}
        onChange={(event) => setModel(event.target.value)}
        placeholder="Model"
        className="filter-input"
      />
      <InlineApplyButton
        onClick={() => onApply({ make: make.trim() || undefined, model: model.trim() || undefined })}
      />
    </div>
  );
}

function InlineRangeFilter({
  firstLabel,
  secondLabel,
  firstValue,
  secondValue,
  onApply,
  prefix = "",
}: {
  firstLabel: string;
  secondLabel: string;
  firstValue: number | undefined;
  secondValue: number | undefined;
  onApply: (first?: number, second?: number) => void;
  prefix?: string;
}) {
  const [first, setFirst] = useState(firstValue == null ? "" : String(firstValue));
  const [second, setSecond] = useState(secondValue == null ? "" : String(secondValue));

  useEffect(() => {
    setFirst(firstValue == null ? "" : String(firstValue));
    setSecond(secondValue == null ? "" : String(secondValue));
  }, [firstValue, secondValue]);

  const parse = (value: string) => {
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="relative">
          <span className="sr-only">{firstLabel}</span>
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
          <input
            type="number"
            min="0"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            placeholder={firstLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
        <label className="relative">
          <span className="sr-only">{secondLabel}</span>
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
          <input
            type="number"
            min="0"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
            placeholder={secondLabel}
            className={`filter-input w-full ${prefix ? "pl-7" : ""}`}
          />
        </label>
      </div>
      <InlineApplyButton onClick={() => onApply(parse(first), parse(second))} />
    </div>
  );
}

function InlineNumberFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: number | undefined;
  onApply: (value?: number) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);

  return (
    <div className="w-full space-y-2.5">
      <label>
        <span className="sr-only">{label}</span>
        <input
          type="number"
          min="0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={label}
          className="filter-input w-full"
        />
      </label>
      <InlineApplyButton
        onClick={() => {
          const parsed = Number(draft);
          onApply(draft.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined);
        }}
      />
    </div>
  );
}

function InlineSelectFilter({
  value,
  options,
  placeholder,
  onChange,
  optionLabels,
}: {
  value: string | undefined;
  options: readonly (string | { value: string; label: string })[];
  placeholder: string;
  onChange: (value?: string) => void;
  optionLabels?: Record<string, string>;
}) {
  return (
    <select
      autoFocus
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      className="filter-input w-full"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? optionLabels?.[option] ?? option : option.label;
        return (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

function InlineLocationFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [region, setRegion] = useState(search.region ?? "");
  const [state, setState] = useState(search.state ?? "");
  const [city, setCity] = useState(search.city ?? "");

  useEffect(() => {
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? "");
  }, [search.region, search.state, search.city]);

  return (
    <div className="w-full space-y-2.5">
      <select value={region} onChange={(event) => setRegion(event.target.value)} className="filter-input w-full">
        <option value="">All of Idaho</option>
        {idahoRegions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <select value={state} onChange={(event) => setState(event.target.value)} className="filter-input w-full">
        <option value="">All states</option>
        {usStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
      <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="filter-input w-full" />
      <InlineApplyButton onClick={() => onApply({ region: region || undefined, state: state || undefined, city: city.trim() || undefined })} />
    </div>
  );
}

function InlineApplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
    >
      Apply filters
    </button>
  );
}

function countActiveFilters(search: Search, motors: boolean) {
  const keys: (keyof Search)[] = [
    "category",
    "group",
    "state",
    "region",
    "city",
    "condition",
    "fulfillment",
    "priceMin",
    "priceMax",
  ];
  if (motors)
    keys.push(
      "make",
      "model",
      "yearMin",
      "yearMax",
      "mileageMax",
      "bodyStyle",
      "transmission",
      "drivetrain",
      "fuelType",
      "exteriorColor",
      "titleStatus",
    );
  return keys.filter((key) => search[key] !== undefined && search[key] !== "").length;
}

function activeFilterLabels(search: Search, motors: boolean) {
  const labels: string[] = [];
  if (search.category)
    labels.push(
      classifiedCategories.find((category) => category.slug === search.category)?.name ??
        search.category,
    );
  if (search.group === "motors" && !search.category) labels.push("Cars & motors");
  if (search.region) labels.push(search.region);
  if (search.state) labels.push(search.state);
  if (search.city) labels.push(search.city);
  if (search.priceMin != null || search.priceMax != null)
    labels.push(`$${search.priceMin ?? 0}–${search.priceMax ?? "up"}`);
  if (motors) {
    if (search.make) labels.push(search.make);
    if (search.model) labels.push(search.model);
    if (search.yearMin != null || search.yearMax != null)
      labels.push(`${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`);
    if (search.drivetrain) labels.push(search.drivetrain);
    if (search.mileageMax != null) labels.push(`≤ ${search.mileageMax.toLocaleString()} mi`);
  }
  return labels;
}

function FilterSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BrowsePill({
  active,
  search,
  children,
}: {
  active: boolean;
  search: Search;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/browse"
      search={search}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] ${active ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-input"}`}
    >
      {children}
    </Link>
  );
}
