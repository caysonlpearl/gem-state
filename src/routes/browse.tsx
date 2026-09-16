import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MagnifyingGlass, FunnelSimple, SquaresFour, Rows, X } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { classifiedCategories, idahoRegions, vehicleOptions } from "@/config/classifieds";
import { ListingCard, ListingRow } from "@/components/classifieds/ListingCard";
import { isMotorsCategory } from "@/lib/classifieds-display";
import { browseClassifieds, type ClassifiedBrowseInput } from "@/lib/classifieds.functions";
import { trackEvent } from "@/lib/analytics";

type Search = ClassifiedBrowseInput & { view?: "grid" | "list" | undefined };

const listingsQuery = (input: ClassifiedBrowseInput) =>
  queryOptions({
    queryKey: ["classifieds-browse", input],
    queryFn: () => browseClassifieds({ data: input }),
  });

const sortOptions: { value: NonNullable<ClassifiedBrowseInput["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "mileage_low", label: "Mileage: lowest" },
];

const conditionOptions = [
  { value: "new_with_tags", label: "New" },
  { value: "new_without_tags", label: "New, no tags" },
  { value: "used_excellent", label: "Used — excellent" },
  { value: "used_good", label: "Used — good" },
];

const fulfillmentOptions = [
  { value: "local_pickup", label: "Local pickup" },
  { value: "shipping", label: "Shipping" },
];

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const str = (key: string, max = 80) => {
      const value = search[key];
      return typeof value === "string" && value ? value.slice(0, max) : undefined;
    };
    const int = (key: string) => {
      const value = Number(search[key]);
      return Number.isFinite(value) ? value : undefined;
    };
    const sort = search["sort"];
    const view = search["view"];
    const page = Number(search["page"]);
    return {
      q: str("q"),
      category: str("category", 60),
      group: str("group", 20),
      region: str("region"),
      city: str("city"),
      condition: str("condition", 30),
      fulfillment: str("fulfillment", 20),
      priceMin: int("priceMin"),
      priceMax: int("priceMax"),
      make: str("make"),
      model: str("model"),
      yearMin: int("yearMin"),
      yearMax: int("yearMax"),
      mileageMax: int("mileageMax"),
      bodyStyle: str("bodyStyle", 30),
      transmission: str("transmission", 30),
      drivetrain: str("drivetrain", 20),
      fuelType: str("fuelType", 30),
      titleStatus: str("titleStatus", 30),
      sort: (["newest", "price_low", "price_high", "mileage_low"] as const).includes(sort as never)
        ? (sort as ClassifiedBrowseInput["sort"])
        : undefined,
      view: view === "list" ? "list" : undefined,
      page: page > 1 ? page : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: `Browse Idaho classifieds — ${brand.name}` },
      {
        name: "description",
        content:
          "Search live Idaho classifieds. Filter by category, city, price, condition and full vehicle specs including make, model, year, mileage and drivetrain.",
      },
      { property: "og:title", content: `Browse Idaho classifieds — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Filter cars, trucks and local classifieds across Idaho by price, city, condition and vehicle specs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { view: _view, ...input } = deps;
    await context.queryClient.ensureQueryData(listingsQuery(input));
  },
  component: Browse,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">Listings didn&apos;t load</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        The connection dropped before results came back. Nothing was lost — try again.
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
  const { view: _view, ...input } = search;
  const { data: result } = useSuspenseQuery(listingsQuery(input));
  const [term, setTerm] = useState(search.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setTerm(search.q ?? ""), [search.q]);
  useEffect(() => {
    void trackEvent("page_view", { route: "/browse" });
  }, []);

  /** Merge one filter change into the current scope and reset paging. */
  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: undefined }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ) as Search;

  const apply = (patch: Partial<Search>) => void navigate({ to: "/browse", search: scoped(patch) });

  const vehicleMode = isMotorsCategory(search.category) || search.group === "motors";
  const listView = search.view === "list";
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  const activeChips = (
    [
      ["category", classifiedCategories.find((c) => c.slug === search.category)?.name],
      ["region", search.region],
      ["city", search.city],
      ["make", search.make],
      ["model", search.model],
      ["condition", conditionOptions.find((c) => c.value === search.condition)?.label],
      ["fulfillment", fulfillmentOptions.find((c) => c.value === search.fulfillment)?.label],
      ["bodyStyle", search.bodyStyle],
      ["transmission", search.transmission],
      ["drivetrain", search.drivetrain],
      ["fuelType", search.fuelType],
      ["titleStatus", search.titleStatus],
    ] as [keyof Search, string | undefined][]
  ).filter(([, label]) => Boolean(label));

  const filterPanel = (
    <div className="space-y-5">
      <Group title="Category">
        <select
          value={search.category ?? ""}
          onChange={(event) => apply({ category: event.target.value || undefined, group: undefined })}
          className="h-10 w-full rounded-md border border-input bg-card px-2 text-[13px]"
        >
          <option value="">All categories</option>
          {classifiedCategories.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>
      </Group>

      <Group title="Location">
        <select
          value={search.region ?? ""}
          onChange={(event) => apply({ region: event.target.value || undefined })}
          className="h-10 w-full rounded-md border border-input bg-card px-2 text-[13px]"
        >
          <option value="">All of Idaho</option>
          {idahoRegions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          defaultValue={search.city ?? ""}
          onBlur={(event) => apply({ city: event.target.value.trim() || undefined })}
          placeholder="City"
          aria-label="City"
          className="mt-2 h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
        />
      </Group>

      <Group title="Price (USD)">
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            defaultValue={search.priceMin ?? ""}
            onBlur={(event) => apply({ priceMin: Number(event.target.value) || undefined })}
            placeholder="Min"
            aria-label="Minimum price"
            className="numeric h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
          />
          <input
            inputMode="numeric"
            defaultValue={search.priceMax ?? ""}
            onBlur={(event) => apply({ priceMax: Number(event.target.value) || undefined })}
            placeholder="Max"
            aria-label="Maximum price"
            className="numeric h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
          />
        </div>
      </Group>

      <Group title="Condition">
        <select
          value={search.condition ?? ""}
          onChange={(event) => apply({ condition: event.target.value || undefined })}
          className="h-10 w-full rounded-md border border-input bg-card px-2 text-[13px]"
        >
          <option value="">Any condition</option>
          {conditionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Group>

      <Group title="Pickup or delivery">
        <select
          value={search.fulfillment ?? ""}
          onChange={(event) => apply({ fulfillment: event.target.value || undefined })}
          className="h-10 w-full rounded-md border border-input bg-card px-2 text-[13px]"
        >
          <option value="">Either</option>
          {fulfillmentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Group>

      {vehicleMode && (
        <>
          <Group title="Make and model">
            <input
              defaultValue={search.make ?? ""}
              onBlur={(event) => apply({ make: event.target.value.trim() || undefined })}
              placeholder="Make (e.g. Ford)"
              aria-label="Make"
              className="h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
            />
            <input
              defaultValue={search.model ?? ""}
              onBlur={(event) => apply({ model: event.target.value.trim() || undefined })}
              placeholder="Model (e.g. F-150)"
              aria-label="Model"
              className="mt-2 h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
            />
          </Group>

          <Group title="Year">
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                defaultValue={search.yearMin ?? ""}
                onBlur={(event) => apply({ yearMin: Number(event.target.value) || undefined })}
                placeholder="From"
                aria-label="Earliest year"
                className="numeric h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
              />
              <input
                inputMode="numeric"
                defaultValue={search.yearMax ?? ""}
                onBlur={(event) => apply({ yearMax: Number(event.target.value) || undefined })}
                placeholder="To"
                aria-label="Latest year"
                className="numeric h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
              />
            </div>
          </Group>

          <Group title="Max mileage">
            <input
              inputMode="numeric"
              defaultValue={search.mileageMax ?? ""}
              onBlur={(event) => apply({ mileageMax: Number(event.target.value) || undefined })}
              placeholder="e.g. 120000"
              aria-label="Maximum mileage"
              className="numeric h-10 w-full rounded-md border border-input bg-card px-2.5 text-[13px]"
            />
          </Group>

          <VehicleSelect
            title="Body style"
            value={search.bodyStyle}
            options={vehicleOptions.bodyStyles}
            onChange={(value) => apply({ bodyStyle: value })}
          />
          <VehicleSelect
            title="Transmission"
            value={search.transmission}
            options={vehicleOptions.transmissions}
            onChange={(value) => apply({ transmission: value })}
          />
          <VehicleSelect
            title="Drivetrain"
            value={search.drivetrain}
            options={vehicleOptions.drivetrains}
            onChange={(value) => apply({ drivetrain: value })}
          />
          <VehicleSelect
            title="Fuel type"
            value={search.fuelType}
            options={vehicleOptions.fuelTypes}
            onChange={(value) => apply({ fuelType: value })}
          />
          <VehicleSelect
            title="Title status"
            value={search.titleStatus}
            options={vehicleOptions.titleStatuses}
            onChange={(value) => apply({ titleStatus: value })}
          />
        </>
      )}

      <Link
        to="/browse"
        search={{}}
        className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium"
      >
        Clear all filters
      </Link>
    </div>
  );

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6">
      <h1 className="text-[22px] font-bold tracking-tight">
        {classifiedCategories.find((c) => c.slug === search.category)?.name ??
          (search.group === "motors" ? "Cars & motors" : "All Idaho listings")}
      </h1>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: term.trim() || undefined });
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
            placeholder="Search Idaho listings"
            aria-label="Search listings"
            className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
          />
        </label>
      </form>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeChips.map(([key, label]) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => apply({ [key]: undefined } as Partial<Search>)}
              className="inline-flex items-center gap-1 rounded-full border border-input px-3 py-1 text-[12px]"
            >
              {label} <X size={11} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-4 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <FunnelSimple size={14} className="text-primary" /> Filters
            </p>
            {filterPanel}
          </div>
        </aside>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              <span className="numeric font-semibold text-foreground">{result.total}</span>{" "}
              {result.total === 1 ? "listing" : "listings"}
              {search.q ? <span> matching “{search.q}”</span> : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-[12.5px] font-medium lg:hidden"
              >
                <FunnelSimple size={14} /> Filters
              </button>
              <div className="flex overflow-hidden rounded-md border border-input">
                <button
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={!listView}
                  onClick={() => apply({ view: undefined, page: search.page })}
                  className={`flex h-9 w-9 items-center justify-center ${!listView ? "bg-secondary" : ""}`}
                >
                  <SquaresFour size={15} />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={listView}
                  onClick={() => apply({ view: "list", page: search.page })}
                  className={`flex h-9 w-9 items-center justify-center ${listView ? "bg-secondary" : ""}`}
                >
                  <Rows size={15} />
                </button>
              </div>
              <select
                aria-label="Sort listings"
                value={search.sort ?? "newest"}
                onChange={(event) =>
                  apply({ sort: event.target.value as ClassifiedBrowseInput["sort"] })
                }
                className="h-9 rounded-md border border-input bg-card px-2 text-[12.5px]"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {result.listings.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-card px-5 py-12 text-center">
              <p className="text-[14px] font-semibold">No listings match these filters.</p>
              <p className="mx-auto mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
                Clear a filter or widen your area. New listings appear here as soon as sellers post
                them and they pass review.
              </p>
            </div>
          ) : listView ? (
            <div className="mt-4 space-y-3">
              {result.listings.map((listing) => (
                <ListingRow key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {result.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Link
                to="/browse"
                search={(prev) => ({ ...prev, page: page > 2 ? page - 1 : undefined })}
                disabled={page <= 1}
                aria-disabled={page <= 1}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                Previous
              </Link>
              <span className="numeric text-[12.5px] text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Link
                to="/browse"
                search={(prev) => ({ ...prev, page: page + 1 })}
                aria-disabled={page >= pageCount}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                Next
              </Link>
            </div>
          )}
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="flex-1 bg-black/40"
          />
          <div className="w-[88%] max-w-[360px] overflow-y-auto bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em]">Filters</p>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </main>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function VehicleSelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Group title={title}>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-10 w-full rounded-md border border-input bg-card px-2 text-[13px]"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Group>
  );
}
