import type { ComponentType, ReactNode } from "react";
import type { Search } from "@/lib/browse-search";
import type { BrowseLinkProps } from "./BrowseResultsView";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
export function BrowseResultsHeading({
  search,
  motors,
  homes,
  jobs,
  services,
  pets,
  firearms,
  serviceLanding,
  showGenericBrowse,
  allCategoriesLanding,
  heading,
  term,
  setTerm,
  scopedWithoutVehicleFilters,
  onApply,
  categories,
  renderLink: BrowseLink,
}: {
  search: Search;
  motors: boolean;
  homes: boolean;
  jobs: boolean;
  services: boolean;
  pets: boolean;
  firearms: boolean;
  serviceLanding: boolean;
  showGenericBrowse: boolean;
  allCategoriesLanding: boolean;
  heading: string;
  term: string;
  setTerm: (value: string) => void;
  scopedWithoutVehicleFilters: (patch: Partial<Search>) => Search;
  onApply: (patch: Partial<Search>) => void;
  categories: readonly { slug: string; name: string; group: string }[];
  renderLink: ComponentType<BrowseLinkProps>;
}) {
  return (
    <>
      <div
        className={`flex flex-wrap items-end justify-between gap-3 ${motors || homes || jobs || services ? "mt-7" : ""} ${homes || jobs || services || serviceLanding || !showGenericBrowse ? "hidden" : ""}`}
      >
        <div className={`${motors ? "hidden" : ""} flex items-center gap-4`}>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
              Bluebird classifieds
            </p>
            <h1 className="mt-2 text-[30px] font-bold tracking-tight">{heading}</h1>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
              Local listings from sellers across Idaho.
            </p>
            {firearms ? (
              <BrowseLink
                to="/browse"
                search={{ category: "firearms" }}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-primary/35 bg-card px-4 text-[12px] font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <ArrowLeft size={14} weight="bold" aria-hidden="true" />
                Firearms category home
              </BrowseLink>
            ) : null}
          </div>
        </div>
      </div>
      {!allCategoriesLanding && !motors && !homes && !jobs && !services && !pets && (
        <form
          className="floating-card mt-8 p-2 sm:p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onApply({ q: term.trim() || undefined });
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
      {!allCategoriesLanding && !motors && !homes && !jobs && !services && !pets && (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          <BrowsePill
            renderLink={BrowseLink}
            active={!search.group && !search.category}
            search={scopedWithoutVehicleFilters({ group: undefined, category: undefined })}
          >
            All listings
          </BrowsePill>
          <BrowsePill
            renderLink={BrowseLink}
            active={search.group === "motors" || motors}
            search={scopedWithoutVehicleFilters({ group: "motors", category: undefined })}
          >
            Vehicles
          </BrowsePill>
          {categories
            .filter((category) => category.group === "classifieds")
            .map((category) => (
              <BrowsePill
                renderLink={BrowseLink}
                key={category.slug}
                active={search.category === category.slug}
                search={scopedWithoutVehicleFilters({ category: category.slug, group: undefined })}
              >
                {category.name}
              </BrowsePill>
            ))}
        </div>
      )}
    </>
  );
}
function BrowsePill({
  renderLink: BrowseLink,
  active,
  search,
  children,
}: {
  renderLink: ComponentType<BrowseLinkProps>;
  active: boolean;
  search: Search;
  children: ReactNode;
}) {
  return (
    <BrowseLink
      to="/browse"
      search={search}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[12.5px] ${active ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-input"}`}
    >
      {children}
    </BrowseLink>
  );
}
