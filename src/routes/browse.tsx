import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CaretDown, FunnelSimple, MapPin, MagnifyingGlass, X } from "@phosphor-icons/react";

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

      <div className={`flex flex-wrap items-end justify-between gap-3 ${motors ? "mt-7" : ""}`}>
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

      {!motors && (
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

      {!motors && <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
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

      <div className={motors ? "mt-6" : "mt-8"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={motors ? "hidden" : "text-[13px] text-muted-foreground"}>
            <span className="numeric font-semibold text-foreground">{result.total}</span>{" "}
            {result.total === 1 ? "listing" : "listings"}
          </p>
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-5 text-[13px] font-semibold shadow-sm transition-shadow hover:shadow-md ${motors ? "hidden" : ""}`}
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
          </Sheet>
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
                Try widening the year, price, mileage, location, or vehicle filters.
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
    <section className="floating-card relative overflow-hidden bg-surface px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-brand-warm/35" />
      <div className="pointer-events-none absolute -bottom-36 left-1/3 h-64 w-64 rounded-full bg-primary/5" />

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
          {quickFilters.map(({ key, label }) => (
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
            additionalFilters.map(({ key, label }) => (
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
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 min-w-full rounded-xl bg-card p-4 shadow-xl ring-1 ring-border/70">
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

  useEffect(() => {
    setMake(search.make ?? "");
    setModel(search.model ?? "");
  }, [search.make, search.model]);

  return (
    <div className="w-[min(360px,calc(100vw-48px))] space-y-2.5">
      <input
        list="hero-vehicle-makes"
        value={make}
        onChange={(event) => setMake(event.target.value)}
        placeholder="Make or brand"
        className="filter-input"
      />
      <datalist id="hero-vehicle-makes">
        {vehicleOptions.makes.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
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
    <div className="w-[min(360px,calc(100vw-48px))] space-y-2.5">
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
    <div className="w-[min(360px,calc(100vw-48px))] space-y-2.5">
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
      className="filter-input w-[min(360px,calc(100vw-48px))]"
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
    <div className="w-[min(360px,calc(100vw-48px))] space-y-2.5">
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
