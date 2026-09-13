import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, MapPin, FunnelSimple } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { CatalogCard } from "@/components/catalog/ProductCard";
import { trackEvent } from "@/lib/analytics";
import { browseProducts, getCatalogFacets, type BrowseInput } from "@/lib/catalog.functions";

type Search = {
  q?: string | undefined;
  resort?: string | undefined;
  park?: string | undefined;
  store?: string | undefined;
  category?: string | undefined;
  sort?: BrowseInput["sort"] | undefined;
  page?: number | undefined;
};

const facetsQuery = queryOptions({
  queryKey: ["catalog-facets"],
  queryFn: () => getCatalogFacets(),
});

const productsQuery = (input: BrowseInput) =>
  queryOptions({
    queryKey: ["browse", input],
    queryFn: () => browseProducts({ data: input }),
  });

const sortOptions: { value: NonNullable<BrowseInput["sort"]>; label: string }[] = [
  { value: "newest", label: "Newest release" },
  { value: "name", label: "Name A–Z" },
  { value: "price_low", label: "Retail: low to high" },
  { value: "price_high", label: "Retail: high to low" },
];

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const str = (key: string, max = 80) => {
      const value = search[key];
      return typeof value === "string" && value ? value.slice(0, max) : undefined;
    };
    const sort = search["sort"];
    const page = Number(search["page"]);
    return {
      q: str("q"),
      resort: str("resort", 12),
      park: str("park", 80),
      store: str("store", 80),
      category: str("category", 60),
      sort: (["newest", "name", "price_low", "price_high"] as const).includes(sort as never)
        ? (sort as BrowseInput["sort"])
        : undefined,
      page: page > 1 ? page : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: `Browse park merchandise — ${brand.name}` },
      {
        name: "description",
        content:
          "Browse the ParkVault catalog of Walt Disney World and Disneyland Resort merchandise. Filter by resort, park, district, store and category, then open one canonical page per product.",
      },
      { property: "og:title", content: `Browse park merchandise — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Filter Disney Parks merchandise by resort, park, district, store and category. One canonical page per product, priced by variation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(facetsQuery),
      context.queryClient.ensureQueryData(
        productsQuery({
          q: deps.q,
          resort: deps.resort,
          category: deps.category,
          sort: deps.sort ?? "newest",
          page: deps.page ?? 1,
        }),
      ),
    ]);
  },
  component: Browse,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[720px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">The catalog didn’t load</h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
        The connection dropped before the catalog finished loading. Nothing was lost — try again.
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
  const { data: facets } = useSuspenseQuery(facetsQuery);
  const { data: result } = useSuspenseQuery(
    productsQuery({
      q: search.q,
      resort: search.resort,
      category: search.category,
      sort: search.sort ?? "newest",
      page: search.page ?? 1,
    }),
  );
  const [term, setTerm] = useState(search.q ?? "");

  useEffect(() => setTerm(search.q ?? ""), [search.q]);

  useEffect(() => {
    void trackEvent("page_view", { route: "/browse" });
  }, []);

  useEffect(() => {
    if (!search.q) return;
    // Search terms are never sent — only the length, so PII cannot leak.
    void trackEvent(result.total === 0 ? "search_no_results" : "search_performed", {
      term_length: search.q.length,
      results: result.total,
      resort: search.resort ?? "all",
      category: search.category ?? "all",
    });
  }, [search.q, search.resort, search.category, result.total]);

  const lastFilters = useRef<string | null>(null);
  useEffect(() => {
    const signature = JSON.stringify([
      search.resort ?? null,
      search.park ?? null,
      search.store ?? null,
      search.category ?? null,
      search.sort ?? "newest",
    ]);
    if (lastFilters.current === null) {
      lastFilters.current = signature;
      return;
    }
    if (lastFilters.current === signature) return;
    lastFilters.current = signature;
    void trackEvent("filter_applied", {
      resort: search.resort ?? "all",
      park: search.park ?? "all",
      store: search.store ?? "all",
      category: search.category ?? "all",
      sort: search.sort ?? "newest",
      results: result.total,
    });
  }, [search.resort, search.park, search.store, search.category, search.sort, result.total]);

  /** Merge a filter change into the current scope, dropping cleared keys and resetting paging. */
  const scoped = (patch: Partial<Search>): Search =>
    Object.fromEntries(
      Object.entries({ ...search, ...patch, page: undefined }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Search;

  const selectedResort = facets.geography.find((g) => g.resortCode === search.resort);
  const selectedCategory = facets.categories.find((category) => category.slug === search.category);
  const selectedPark = selectedResort?.parks.find((p) => p.slug === search.park);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const page = search.page ?? 1;

  const scopeLabel = search.store
    ? (selectedPark?.locations.find((l) => l.slug === search.store)?.name ?? "Selected store")
    : (selectedPark?.name ?? selectedResort?.resortName ?? "All resorts");

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-7 sm:px-6">
      {selectedCategory && result.products.some((product) => product.primaryImage) && (
        <section className="mb-7 overflow-hidden border border-border bg-primary text-primary-foreground">
          <div className="grid min-h-[245px] md:grid-cols-[0.8fr_1.2fr]">
            <div className="flex flex-col justify-center px-7 py-8 sm:px-9">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-brand-warm">
                Shop the category
              </p>
              <h1 className="mt-2 max-w-[18ch] font-editorial text-[36px] font-normal leading-[1.02] tracking-[-0.035em] sm:text-[44px]">
                {selectedCategory.name}
              </h1>
              <p className="mt-3 max-w-[44ch] text-[12.5px] leading-relaxed text-primary-foreground/72">
                {result.total} curated {result.total === 1 ? "product" : "products"}, each with one
                canonical page and every active listing underneath it.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-px bg-primary-foreground/15">
              {result.products
                .filter((product) => product.primaryImage)
                .slice(0, 3)
                .map((product) => (
                  <Link
                    key={`category-hero-${product.id}`}
                    to="/products/$slug"
                    params={{ slug: product.slug }}
                    className="group flex min-h-[210px] items-center justify-center overflow-hidden bg-white p-3"
                  >
                    <img
                      src={product.primaryImage!.src}
                      alt={product.primaryImage!.alt}
                      className="h-full max-h-[225px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  </Link>
                ))}
            </div>
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {selectedCategory ? (
            <h2 className="text-[22px] font-semibold tracking-tight">
              Browse {selectedCategory.name}
            </h2>
          ) : (
            <h1 className="text-[22px] font-semibold tracking-tight">Catalog</h1>
          )}
          <p className="mt-1 text-[13px] text-muted-foreground">
            One canonical page per product, split by exact variation. Scope: {scopeLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground" htmlFor="sort">
            Sort
          </label>
          <select
            id="sort"
            value={search.sort ?? "newest"}
            onChange={(e) =>
              void navigate({
                to: "/browse",
                search: scoped({ sort: e.target.value as BrowseInput["sort"] }),
              })
            }
            className="h-9 rounded-md border border-input bg-card px-2 text-[13px]"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
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
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search products by name or description"
            aria-label="Search products"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
          />
        </label>
      </form>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        <Link
          to="/browse"
          search={scoped({ resort: undefined, park: undefined, store: undefined })}
          className="shrink-0 rounded-full border border-input px-3 py-1.5 text-[11.5px]"
        >
          All resorts
        </Link>
        {facets.geography.map((g) => (
          <Link
            key={g.resortId}
            to="/browse"
            search={scoped({ resort: g.resortCode, park: undefined, store: undefined })}
            className={[
              "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px]",
              search.resort === g.resortCode
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "border-input",
            ].join(" ")}
          >
            {g.resortName.replace(" Resort", "")}
          </Link>
        ))}
        {facets.categories.map((c) => (
          <Link
            key={c.id}
            to="/browse"
            search={scoped({ category: c.slug })}
            className={[
              "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px]",
              search.category === c.slug
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "border-input",
            ].join(" ")}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden space-y-5 lg:block">
          <div className="rounded-lg border border-border bg-card">
            <div className="hairline-b flex items-center gap-1.5 px-4 py-2.5">
              <MapPin size={14} className="text-primary" />
              <h2 className="text-[12px] font-semibold tracking-tight">Where</h2>
            </div>
            <div className="space-y-1 p-3">
              <FilterLink
                active={!search.resort}
                search={scoped({ resort: undefined, park: undefined, store: undefined })}
              >
                All resorts
              </FilterLink>
              {facets.geography.map((g) => (
                <div key={g.resortId} className="space-y-1">
                  <FilterLink
                    active={search.resort === g.resortCode && !search.park}
                    search={scoped({ resort: g.resortCode, park: undefined, store: undefined })}
                  >
                    {g.resortName}
                  </FilterLink>
                  {search.resort === g.resortCode && (
                    <div className="ml-2 space-y-1 border-l border-border pl-2">
                      {g.parks.map((p) => (
                        <div key={p.id} className="space-y-1">
                          <FilterLink
                            small
                            active={search.park === p.slug && !search.store}
                            search={scoped({
                              resort: g.resortCode,
                              park: p.slug,
                              store: undefined,
                            })}
                          >
                            {p.kind === "district" ? `${p.name} (district)` : p.name}

                          </FilterLink>
                          {search.park === p.slug && (
                            <div className="ml-2 space-y-1 border-l border-border pl-2">
                              {p.locations
                                .filter((l) => l.granularity === "store")
                                .map((l) => (
                                  <FilterLink
                                    key={l.id}
                                    small
                                    active={search.store === l.slug}
                                    search={scoped({
                                      resort: g.resortCode,
                                      park: p.slug,
                                      store: l.slug,
                                    })}
                                  >
                                    {l.name}
                                  </FilterLink>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(search.park || search.store) && (
              <p className="hairline-t px-4 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Products are listed by resort availability. Park, district and store scope describes
                where in-park sightings are reported on a product page — it does not filter the
                catalog.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="hairline-b flex items-center gap-1.5 px-4 py-2.5">
              <FunnelSimple size={14} className="text-primary" />
              <h2 className="text-[12px] font-semibold tracking-tight">Category</h2>
            </div>
            <div className="space-y-1 p-3">
              <FilterLink active={!search.category} search={scoped({ category: undefined })}>
                All categories
              </FilterLink>
              {facets.categories.map((c) => (
                <FilterLink
                  key={c.id}
                  active={search.category === c.slug}
                  search={scoped({ category: c.slug })}
                >
                  {c.name}
                </FilterLink>
              ))}
            </div>
          </div>
        </aside>

        <section>
          <p className="text-[12.5px] text-muted-foreground">
            <span className="numeric">{result.total}</span>{" "}
            <span>{result.total === 1 ? "product" : "products"}</span>
            {search.q ? <span> matching “{search.q}”</span> : null}
          </p>


          {result.products.length === 0 ? (
            <div className="mt-3 rounded-lg border border-border bg-card px-5 py-10 text-center">
              <p className="text-[14px] font-medium">No products match this scope.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                The catalog is curated by hand. Clear a filter, or check back as more products are
                reviewed and published.
              </p>
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
              {result.products.map((p) => (
                <li key={p.id}>
                  <CatalogCard product={p} />
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <Link
                to="/browse"
                search={(prev) => ({ ...prev, page: page > 2 ? page - 1 : undefined })}
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
                search={(prev) => ({ ...prev, page: page + 1 })}
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

/**
 * Filters are real links, not buttons: they work before hydration, are
 * shareable, and keep every scope a crawlable URL.
 */
function FilterLink({
  active,
  small,
  search,
  children,
}: {
  active: boolean;
  small?: boolean;
  search: Search;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/browse"
      search={search}
      aria-current={active ? "true" : undefined}
      className={[
        "block w-full rounded-md px-2.5 py-1.5 text-left leading-snug transition-colors",
        small ? "text-[12px]" : "text-[12.5px]",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
