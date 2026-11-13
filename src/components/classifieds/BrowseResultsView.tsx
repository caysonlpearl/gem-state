import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import type { Search, Sort } from "@/lib/browse-search";
import { sortOptions } from "@/lib/browse-search";
import type { ListingCardSummary } from "@/lib/listing-card-summary";
import { ResponsiveBrowseFilters } from "./ResponsiveBrowseFilters";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { BookmarkSimple, X } from "@phosphor-icons/react";
export type BrowseLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to?: string;
  search?: Search;
};
export type BrowseResultsProps = {
  search: Search;
  motors: boolean;
  homes: boolean;
  homeLanding: boolean;
  pets: boolean;
  firearms: boolean;
  result: { listings: ListingCardSummary[]; total: number };
  shownListings: ListingCardSummary[];
  activeFilterCount: number;
  filterLabels: string[];
  searchKey: string;
  homeFilters?: ReactNode;
  genericFilters?: ReactNode;
  scoped: (patch: Partial<Search>) => Search;
  clearFilters: () => void;
  clearSearch: () => Search;
  requestSaveSearch: () => void;
  onApply: (patch: Partial<Search>) => void;
  noResultsHint: string;
  canLoadMore: boolean;
  loadedThroughPage: number;
  loadingMore: boolean;
  loadMore: () => void | Promise<void>;
  page: number;
  alertSubject: string;
  alertPlace: string;
  renderLink: ComponentType<BrowseLinkProps>;
  renderListing: (listing: ListingCardSummary, index: number, view: "grid" | "list") => ReactNode;
};

/** Website results shell, including controls, empty states, cards and alert actions. */
export function BrowseResultsView({
  search,
  motors,
  homes,
  homeLanding,
  pets,
  firearms,
  result,
  shownListings,
  activeFilterCount,
  filterLabels,
  searchKey,
  homeFilters,
  genericFilters,
  scoped,
  clearFilters,
  clearSearch,
  requestSaveSearch,
  onApply,
  noResultsHint,
  canLoadMore,
  loadedThroughPage,
  loadingMore,
  loadMore,
  page,
  alertSubject,
  alertPlace,
  renderListing,
  renderLink: BrowseLink,
}: BrowseResultsProps) {
  return (
    <div
      className={`${motors || homes ? "mt-6" : "mt-8"} ${homeLanding ? "hidden" : ""} ${!motors ? "grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8" : ""}`}
    >
      {!motors && !homeLanding && (
        <ResponsiveBrowseFilters
          title={homes ? "Home filters" : "Filter listings"}
          activeCount={activeFilterCount}
          resetKey={searchKey}
        >
          {homes ? homeFilters : genericFilters}
        </ResponsiveBrowseFilters>
      )}
      <div className={`min-w-0 ${!motors ? "lg:col-start-2" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!motors && !homes && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="sort">
                Sort
              </label>
              <select
                id="sort"
                value={search.sort ?? "newest"}
                onChange={(event) => onApply({ sort: event.target.value as Sort })}
                className="select-chevron h-11 rounded-full border border-input bg-card pl-4 pr-8 text-[13px] font-medium shadow-sm"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <BrowseLink
                to="/browse"
                search={scoped({ view: "grid" })}
                aria-label="Grid view"
                className={`hidden h-11 items-center rounded-full border px-4 text-[12px] sm:inline-flex ${search.view !== "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
              >
                Grid
              </BrowseLink>
              <BrowseLink
                to="/browse"
                search={scoped({ view: "list" })}
                aria-label="List view"
                className={`hidden h-11 items-center rounded-full border px-4 text-[12px] sm:inline-flex ${search.view === "list" ? "border-primary bg-accent font-semibold" : "border-input"}`}
              >
                List
              </BrowseLink>
              {search.savedSearchId ? (
                <button
                  type="button"
                  onClick={() => requestSaveSearch()}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-primary bg-card px-5 text-[13px] font-semibold text-primary shadow-sm"
                >
                  <BookmarkSimple size={17} />
                  Update saved search
                </button>
              ) : null}
            </div>
          )}
        </div>

        <section id="results" aria-labelledby="browse-results-heading" className="mt-6">
          <h2 id="browse-results-heading" className="sr-only">
            Search results
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={motors ? "hidden" : "text-[12.5px] text-muted-foreground"}>
              <span className="numeric">{result.total}</span>{" "}
              {result.total === 1 ? "listing" : "listings"}
              {search.q ? <span> matching “{search.q}”</span> : null}
            </p>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filterLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[10.5px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => void clearFilters()}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-accent"
                >
                  <X size={11} /> Clear
                </button>
              </div>
            )}
          </div>

          {result.listings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              headingLevel="h2"
              title="No listings match these filters."
              description={noResultsHint}
            >
              <BrowseLink
                to="/browse"
                search={clearSearch()}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </BrowseLink>
            </BluebirdEmptyState>
          ) : search.view === "list" ? (
            <ul className="mt-5 space-y-4">
              {shownListings.map((listing, index) => (
                <li key={listing.id}>{renderListing(listing, index, "list")}</li>
              ))}
            </ul>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-3">
              {shownListings.map((listing, index) => (
                <li key={listing.id}>{renderListing(listing, index, "grid")}</li>
              ))}
            </ul>
          )}

          {result.listings.length > 0 && (
            <div className="mt-8 flex flex-col items-center gap-2">
              <p className="numeric text-[12.5px] text-muted-foreground">
                Showing {shownListings.length.toLocaleString()} of {result.total.toLocaleString()}
              </p>
              {canLoadMore ? (
                <BrowseLink
                  to="/browse"
                  search={scoped({ page: loadedThroughPage + 1 })}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    if (!loadingMore) void loadMore();
                  }}
                  aria-disabled={loadingMore}
                  className="inline-flex h-11 items-center rounded-full border border-input bg-card px-6 text-[13.5px] font-semibold shadow-sm disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </BrowseLink>
              ) : null}
              {page > 1 ? (
                <BrowseLink
                  to="/browse"
                  search={scoped({ page: page - 1 })}
                  className="text-sm underline"
                >
                  Previous page
                </BrowseLink>
              ) : null}
            </div>
          )}

          {/* Offer alerts once the shopper has seen results, not before. */}
          {result.listings.length > 0 && !search.savedSearchId ? (
            <div className="soft-card mt-8 flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] font-semibold">
                  Get alerts for new {alertSubject}
                  {alertPlace}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  We'll let you know when something new matches this search.
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestSaveSearch()}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground"
              >
                <BookmarkSimple size={17} />
                Turn on alerts
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
