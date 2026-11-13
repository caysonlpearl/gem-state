/** Actual website category filter views. Navigation, cards and preview reads are adapters. */
import {
  PartnerHomesCredit,
  PartnerJobsCredit,
  PartnerVehiclesCredit,
} from "@/components/classifieds/ListingCardView";
import { LocationOptions } from "@/components/classifieds/LocationOptions";
import {
  type LocationPoint,
  LocationRadiusPicker,
} from "@/components/classifieds/LocationRadiusPicker";
import { ResponsiveBrowseFilters } from "@/components/classifieds/ResponsiveBrowseFilters";
import { BluebirdEmptyState } from "@/components/layout/BluebirdEmptyState";
import { classifiedSubcategoryField } from "@/config/classified-item-fields";
import {
  classifiedCategories,
  idahoRegions,
  usStates,
  vehicleModelsByMake,
  vehicleOptions,
} from "@/config/classifieds";
import { type HomeTab, type Search, type Sort } from "@/lib/browse-search";
import {
  comparableJobPay,
  isInvertedRange,
  optionalNonNegativeInteger,
  optionalNonNegativeNumber,
} from "@/lib/classifieds-query";
import type { ListingCardSummary } from "@/lib/listing-card-summary";
import { BookmarkSimple, CaretDown, Check, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type BrowseListingRenderer = (listing: ListingCardSummary, position: number) => ReactNode;
export type BrowseFilterResult = {
  listings: ListingCardSummary[];
  total: number;
  page: number;
  pageSize: number;
  incomplete?: boolean;
};

export const isPostalCode = (value: string) => /^\d{5}(?:-\d{4})?$/.test(value.trim());

export const homeTabs: { value: HomeTab; label: string; eyebrow: string }[] = [
  { value: "build", label: "Build", eyebrow: "New construction" },
  { value: "buy", label: "Buy", eyebrow: "Homes for sale" },
  { value: "rent", label: "Rent", eyebrow: "Places to rent" },
];

export const homePropertyTypes = [
  "Any property type",
  "Single-family home",
  "Townhome",
  "Condo",
  "Apartment",
  "Duplex",
  "Manufactured home",
  "Land",
];

export const homeBedroomOptions = [
  "Any bedrooms",
  "Studio",
  "1+ bedrooms",
  "2+ bedrooms",
  "3+ bedrooms",
  "4+ bedrooms",
];

export const homeBathroomOptions = [
  "Any bathrooms",
  "1+ bathrooms",
  "2+ bathrooms",
  "3+ bathrooms",
  "4+ bathrooms",
];

export const homeSquareFeetOptions = [
  "Any",
  "250+",
  "500+",
  "1000+",
  "1500+",
  "2000+",
  "3000+",
  "4000+",
  "5000+",
  "10000+",
];

export const homeAcresOptions = [
  "Any",
  ".10+",
  ".20+",
  ".25+",
  ".30+",
  ".5+",
  ".75+",
  "1+",
  "1.5+",
  "2+",
  "2.5+",
];

export const homeYearBuiltOptions = [
  "Any year",
  "Built 2025 or newer",
  "Built 2020 or newer",
  "Built 2010 or newer",
  "Built 2000 or newer",
  "Built 1990 or newer",
];

export const leaseLengthOptions = [
  "Any",
  "Month-to-month",
  "1 month",
  "2 months",
  "3 months",
  "4 months",
  "5 months",
  "6 months",
  "9 months",
  "12 months",
  "18 months",
  "24 months",
];

export const mileageBandOptions = [
  "Under 25,000 miles",
  "Under 50,000 miles",
  "Under 75,000 miles",
  "Under 100,000 miles",
  "Under 150,000 miles",
] as const;

export const splitVehicleFilter = (value: string | undefined) =>
  value?.split("||").filter(Boolean) ?? [];

export const modelsForMakes = (makes: readonly string[]) =>
  [...new Set(makes.flatMap((make) => vehicleModelsByMake[make] ?? []))].sort();

export const vehicleConditionOptions = [
  { value: "new_with_tags", label: "New" },
  { value: "used_excellent", label: "Used excellent" },
  { value: "used_good", label: "Used good" },
  { value: "broken_needs_repairs", label: "Broken/needs repairs" },
] as const;

export const jobCategoryOptions = [
  "Any category",
  "Accounting & Finance",
  "Administrative",
  "Architecture & Engineering",
  "Automotive",
  "Construction",
  "Education",
  "Healthcare",
  "Hospitality",
  "Human Resources",
  "Information Technology",
  "Retail",
] as const;

export const jobTypeOptions = [
  "Any job type",
  "Contract",
  "Full-time",
  "Part-time",
  "Seasonal",
  "Temporary",
] as const;

export const jobPayTypeOptions = [
  "All pay types",
  "Hourly",
  "Salary",
  "Commission",
  "Contract",
] as const;

export const jobExperienceOptions = [
  "Any experience",
  "1–2 years",
  "3–4 years",
  "5–7 years",
  "8–10 years",
  "10+ years",
] as const;

export const jobPostedOptions = [
  "Any time",
  "Last hour",
  "Last 24 hours",
  "Last 7 days",
  "Last 30 days",
] as const;

export const jobEducationOptions = [
  "Any education",
  "2-year Degree",
  "4-year Degree",
  "Advanced Degree",
  "High School",
  "None",
] as const;

export type ServiceCategory = { name: string; image: string };

export const allServiceCategories: ServiceCategory[] = [
  { name: "Accounting & Bookkeeping", image: "" },
  { name: "Appliance & Electronics Repair", image: "" },
  { name: "Automotive", image: "" },
  { name: "Cabinets & Countertops", image: "" },
  { name: "Carpentry", image: "" },
  { name: "Carpet & Flooring Installation", image: "" },
  { name: "Carpet Cleaning", image: "" },
  { name: "Childcare", image: "" },
  { name: "Concrete Contractors", image: "" },
  { name: "Concrete Foundations & Footings", image: "" },
  { name: "Deck & Patio Construction", image: "" },
  { name: "Drywall", image: "" },
  { name: "Electricians", image: "" },
  { name: "Excavation", image: "" },
  { name: "Fence Installation & Repair", image: "" },
  { name: "Garage Doors", image: "" },
  { name: "General Contractors", image: "" },
  { name: "Gutters & Downspouts", image: "" },
  { name: "Handyman", image: "" },
  { name: "Healthcare", image: "" },
  { name: "Heating & Air Conditioning", image: "" },
  { name: "Hot Tub & Pool", image: "" },
  { name: "House Cleaning", image: "" },
  { name: "Insulation", image: "" },
  { name: "IT Services", image: "" },
  { name: "Landscape Contractors", image: "" },
  { name: "Legal Services", image: "" },
  { name: "Masonry", image: "" },
  { name: "Miscellaneous Services", image: "" },
  { name: "Movers", image: "" },
  { name: "Other Home Services", image: "" },
  { name: "Painters", image: "" },
  { name: "Pet Care", image: "" },
  { name: "Photography", image: "" },
  { name: "Paving & Asphalt", image: "" },
  { name: "Pest Control", image: "" },
  { name: "Pet Training", image: "" },
  { name: "Plumbers", image: "" },
  { name: "Real Estate Services", image: "" },
  { name: "Remodelers", image: "" },
  { name: "Roofing", image: "" },
  { name: "RV & Boat Repair", image: "" },
  { name: "Scrap & Junk Removal", image: "" },
  { name: "Siding Installation & Repair", image: "" },
  { name: "Small Engine Repair", image: "" },
  { name: "Sprinkler Installation & Repair", image: "" },
  { name: "Tile, Marble & Granite Installation", image: "" },
  { name: "Tree Trimming & Removal", image: "" },
  { name: "Tutoring", image: "" },
  { name: "Welding & Fabrication", image: "" },
  { name: "Window Cleaning", image: "" },
  { name: "Windows & Glass Installation", image: "" },
];

export const serviceSubcategoryOptions = [
  "Any subcategory",
  ...allServiceCategories.map((category) => category.name),
] as const;

export const serviceConditionOptions = ["Any condition", "New", "Used", "Like new"] as const;

export const serviceTimeOnSiteOptions = [
  "Any time",
  "Last hour",
  "Last 24 hours",
  "Last 7 days",
  "Last 30 days",
] as const;

export function ServicesFilterPage({
  renderListing,
  search,
  listings,
  total,
  onClear,
  onApply,
  onSave,
  onPost,
}: {
  renderListing: BrowseListingRenderer;
  search: Search;
  listings: ListingCardSummary[];
  total: number;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const [subcategory, setSubcategory] = useState(search.serviceSubcategory ?? "");
  const [priceMin, setPriceMin] = useState(search.priceMin == null ? "" : String(search.priceMin));
  const [priceMax, setPriceMax] = useState(search.priceMax == null ? "" : String(search.priceMax));
  const [expandSearch, setExpandSearch] = useState(search.serviceExpandSearch === "true");
  const [photos, setPhotos] = useState(search.servicePhotos === "true");
  const [area, setArea] = useState(search.serviceArea ?? "");
  const [availability, setAvailability] = useState(search.serviceAvailability ?? "");
  const [licenseRequired, setLicenseRequired] = useState(search.serviceLicenseRequired === "true");
  const [condition, setCondition] = useState(search.serviceCondition ?? "");
  const [timeOnSite, setTimeOnSite] = useState(search.serviceTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setSubcategory(search.serviceSubcategory ?? "");
    setPriceMin(search.priceMin == null ? "" : String(search.priceMin));
    setPriceMax(search.priceMax == null ? "" : String(search.priceMax));
    setExpandSearch(search.serviceExpandSearch === "true");
    setPhotos(search.servicePhotos === "true");
    setArea(search.serviceArea ?? "");
    setAvailability(search.serviceAvailability ?? "");
    setLicenseRequired(search.serviceLicenseRequired === "true");
    setCondition(search.serviceCondition ?? "");
    setTimeOnSite(search.serviceTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    return {
      q: term.trim() || undefined,
      serviceSubcategory: subcategory || undefined,
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      serviceExpandSearch: expandSearch ? "true" : undefined,
      servicePhotos: photos ? "true" : undefined,
      serviceArea: area.trim() || undefined,
      serviceAvailability: availability.trim() || undefined,
      serviceLicenseRequired: licenseRequired ? "true" : undefined,
      serviceCondition: condition || undefined,
      serviceTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.priceMin, patch.priceMax)) {
      toast.error("Price minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  const filteredListings = listings;
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high" || search.sort === "price_low") {
      if (Boolean(a.externalJob) !== Boolean(b.externalJob)) return a.externalJob ? 1 : -1;
      const aValue = a.job ? comparableJobPay(a.job.payType, a.job.payMin) : a.priceCents;
      const bValue = b.job ? comparableJobPay(b.job.payType, b.job.payMin) : b.priceCents;
      return search.sort === "price_low" ? aValue - bValue : bValue - aValue;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Search Listings
            </button>
            <button
              type="button"
              onClick={onPost}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Post a Listing
            </button>
          </div>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search services</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search for a service, company, or description"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <ServiceOptionSelect
            label="Subcategory"
            value={subcategory}
            options={serviceSubcategoryOptions}
            onChange={setSubcategory}
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <button
              type="submit"
              className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="h-12 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              Save search
            </button>
          </div>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Service filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            <ServiceFilterGroup title="Location">
              <InlineLocationFilter search={search} onApply={onApply} />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Category">
              <ServiceOptionSelect
                label="Category"
                value="Services"
                options={["Any category", "Services"]}
                onChange={() => undefined}
              />
              <ServiceOptionSelect
                label="Subcategory"
                value={subcategory}
                options={serviceSubcategoryOptions}
                onChange={setSubcategory}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Price">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value)}
                  placeholder="$0"
                  className="filter-input"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value)}
                  placeholder="$200,000+"
                  className="filter-input"
                />
              </div>
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Expand Your Search">
              <ServiceToggle
                label="Include listing descriptions in keyword searches"
                checked={expandSearch}
                onChange={setExpandSearch}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Photos">
              <ServiceToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Service details">
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Service area"
                className="filter-input"
              />
              <input
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
                placeholder="Availability or schedule"
                className="filter-input"
              />
              <ServiceToggle
                label="Only show licensed providers"
                checked={licenseRequired}
                onChange={setLicenseRequired}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Condition" initiallyOpen={false}>
              <ServiceOptionSelect
                label="Condition"
                value={condition}
                options={serviceConditionOptions}
                onChange={setCondition}
              />
            </ServiceFilterGroup>
            <ServiceFilterGroup title="Time On Site" initiallyOpen={false}>
              <div className="space-y-2">
                {serviceTimeOnSiteOptions.slice(1).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTimeOnSite(timeOnSite === option ? "" : option)}
                    className={`h-10 w-full rounded-lg border px-3 text-[12px] font-bold ${timeOnSite === option ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}
                  >
                    {option.replace("Last ", "Last ")}
                  </button>
                ))}
              </div>
            </ServiceFilterGroup>
            <button
              type="button"
              onClick={apply}
              className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Show {total.toLocaleString()} results
            </button>
          </div>
        </ResponsiveBrowseFilters>

        <section aria-label="Service listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{total}</strong>{" "}
              {total === 1 ? "service" : "services"} in Idaho
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                value={search.sort ?? "newest"}
                onChange={(event) =>
                  onApply({
                    sort:
                      event.target.value === "newest"
                        ? undefined
                        : (event.target.value as Search["sort"]),
                  })
                }
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No services match these filters."
              description="Try widening your subcategory, price range, or search terms."
            >
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </BluebirdEmptyState>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedListings.map((listing, index) => (
                <Fragment key={listing.id}>{renderListing(listing, index)}</Fragment>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function ServiceOptionSelect({
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
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map((option, index) => (
          <option key={option} value={index === 0 ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

export function ServiceFilterGroup({
  title,
  children,
  initiallyOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="overflow-visible rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[13px] font-bold"
      >
        <span>{title}</span>
        <CaretDown
          size={15}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3.5 pb-3.5 pt-3">{children}</div>
      )}
    </section>
  );
}

export function ServiceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] leading-tight">
      <span>{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-1.5 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-7" : "translate-x-1.5"}`}
        />
      </button>
    </label>
  );
}

export function JobsFilterPage({
  renderListing,
  search,
  listings,
  total,
  onClear,
  onApply,
  onSave,
  onPost,
}: {
  renderListing: BrowseListingRenderer;
  search: Search;
  listings: ListingCardSummary[];
  total: number;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onPost: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const [category, setCategory] = useState(search.jobCategory ?? "");
  const [employer, setEmployer] = useState(search.jobEmployer ?? "");
  const [jobType, setJobType] = useState(search.jobType ?? "");
  const [payType, setPayType] = useState(search.jobPayType ?? "");
  const [payMin, setPayMin] = useState(search.jobPayMin == null ? "" : String(search.jobPayMin));
  const [payMax, setPayMax] = useState(search.jobPayMax == null ? "" : String(search.jobPayMax));
  const [experience, setExperience] = useState(search.jobExperience ?? "");
  const [posted, setPosted] = useState(search.jobPosted ?? "");
  const [education, setEducation] = useState(search.jobEducation ?? "");
  const [photos, setPhotos] = useState(search.jobPhotos === "true");
  const [timeOnSite, setTimeOnSite] = useState(search.jobTimeOnSite ?? "");

  useEffect(() => {
    setTerm(search.q ?? "");
    setCategory(search.jobCategory ?? "");
    setEmployer(search.jobEmployer ?? "");
    setJobType(search.jobType ?? "");
    setPayType(search.jobPayType ?? "");
    setPayMin(search.jobPayMin == null ? "" : String(search.jobPayMin));
    setPayMax(search.jobPayMax == null ? "" : String(search.jobPayMax));
    setExperience(search.jobExperience ?? "");
    setPosted(search.jobPosted ?? "");
    setEducation(search.jobEducation ?? "");
    setPhotos(search.jobPhotos === "true");
    setTimeOnSite(search.jobTimeOnSite ?? "");
  }, [search]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    const integerValue = (value: string) => optionalNonNegativeInteger(value);
    return {
      q: term.trim() || undefined,
      jobCategory: category || undefined,
      jobEmployer: employer.trim() || undefined,
      jobType: jobType || undefined,
      jobPayType: payType || undefined,
      jobPayMin: numberValue(payMin),
      jobPayMax: numberValue(payMax),
      jobExperience: experience || undefined,
      jobPosted: posted || undefined,
      jobEducation: education || undefined,
      jobPhotos: photos ? "true" : undefined,
      jobTimeOnSite: timeOnSite || undefined,
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.jobPayMin, patch.jobPayMax)) {
      toast.error("Pay minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  const filteredListings = listings;
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (search.sort === "price_high" || search.sort === "price_low") {
      if (Boolean(a.externalJob) !== Boolean(b.externalJob)) return a.externalJob ? 1 : -1;
      const aValue = a.job ? comparableJobPay(a.job.payType, a.job.payMin) : a.priceCents;
      const bValue = b.job ? comparableJobPay(b.job.payType, b.job.payMin) : b.priceCents;
      return search.sort === "price_low" ? aValue - bValue : bValue - aValue;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="grid w-full max-w-[390px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Search Jobs
            </button>
            <button
              type="button"
              onClick={onPost}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Post a Job
            </button>
          </div>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.65fr_repeat(3,minmax(0,1fr))_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search jobs</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search for a job, company, or title"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <JobChecklist
            label="Category"
            value={category}
            options={jobCategoryOptions}
            onChange={setCategory}
          />
          <JobChecklist
            label="Job type"
            value={jobType}
            options={jobTypeOptions}
            onChange={setJobType}
          />
          <JobSelect
            label="Job pay range"
            value={payType}
            options={jobPayTypeOptions}
            onChange={setPayType}
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <button
              type="submit"
              className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="h-12 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              Save search
            </button>
          </div>
        </form>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Job filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            <JobFilterGroup title="Category">
              <JobChecklist
                label="Category"
                value={category}
                options={jobCategoryOptions}
                onChange={setCategory}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Employer">
              <input
                value={employer}
                onChange={(event) => setEmployer(event.target.value)}
                placeholder="Company or employer"
                className="filter-input"
              />
            </JobFilterGroup>
            <JobFilterGroup title="Job type">
              <JobChecklist
                label="Job type"
                value={jobType}
                options={jobTypeOptions}
                onChange={setJobType}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Education level">
              <JobChecklist
                label="Education level"
                value={education}
                options={jobEducationOptions}
                onChange={setEducation}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Years of experience">
              <JobChecklist
                label="Years of experience"
                value={experience}
                options={jobExperienceOptions}
                onChange={setExperience}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Job pay range">
              <div className="grid grid-cols-3 gap-1.5">
                {jobPayTypeOptions.map((option, index) => {
                  const value = index === 0 ? "" : option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPayType(value)}
                      className={`rounded-lg border px-2 py-2 text-[11px] font-semibold ${payType === value ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-secondary"}`}
                    >
                      {index === 0 ? "All" : option}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  inputMode="numeric"
                  value={payMin}
                  onChange={(event) => setPayMin(event.target.value)}
                  placeholder="$ From"
                  className="filter-input"
                />
                <input
                  inputMode="numeric"
                  value={payMax}
                  onChange={(event) => setPayMax(event.target.value)}
                  placeholder="$ To"
                  className="filter-input"
                />
              </div>
            </JobFilterGroup>
            <JobFilterGroup title="Photos">
              <JobToggle
                label="Only show listings with photos"
                checked={photos}
                onChange={setPhotos}
              />
            </JobFilterGroup>
            <JobFilterGroup title="Time on site">
              <JobSelect
                label="Time on site"
                value={timeOnSite}
                options={jobPostedOptions}
                onChange={setTimeOnSite}
              />
            </JobFilterGroup>
          </div>
        </ResponsiveBrowseFilters>

        <section aria-label="Job listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{total}</strong>{" "}
              {total === 1 ? "job" : "jobs"} in{" "}
              {[search.city, search.state ?? "Idaho"].filter(Boolean).join(", ")}
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                value={search.sort ?? "newest"}
                onChange={(event) =>
                  onApply({
                    sort:
                      event.target.value === "newest"
                        ? undefined
                        : (event.target.value as Search["sort"]),
                  })
                }
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
              >
                <option value="newest">Newest to oldest</option>
                <option value="price_high">Highest pay</option>
                <option value="price_low">Lowest pay</option>
              </select>
            </label>
          </div>
          {sortedListings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No jobs match these filters."
              description="Try widening your job type, pay range, or search terms."
            >
              <button
                type="button"
                onClick={onClear}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </BluebirdEmptyState>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {sortedListings.map((listing, index) => (
                  <Fragment key={listing.id}>{renderListing(listing, index)}</Fragment>
                ))}
              </div>
              <PartnerJobsCredit listings={sortedListings} />
              <PartnerHomesCredit listings={sortedListings} />
              <PartnerVehiclesCredit listings={sortedListings} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function JobSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  onChange?: (value: string) => void;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options.map((option, index) => (
          <option key={option} value={index === 0 ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

export function JobChecklist({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split("|").filter(Boolean) : [];
  const anyOption = options[0] ?? "Any";
  const displayValue =
    selected.length === 0
      ? anyOption
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  function toggle(option: string) {
    if (option === anyOption) {
      onChange("");
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join("||"));
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="truncate">{displayValue}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
        >
          {[anyOption, ...options.slice(1)].map((option) => {
            const checked =
              option === anyOption ? selected.length === 0 : selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="size-4 accent-primary"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function JobFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function JobToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] leading-tight">
      <span>{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-card shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </label>
  );
}

export function HomesFilterPage({
  activeTab,
  search,
  resultCount,
  onClear,
  onTabChange,
  onApply,
  onSave,
}: {
  activeTab: HomeTab;
  search: Search;
  resultCount: number;
  onClear: () => void;
  onTabChange: (tab: HomeTab) => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
}) {
  const [location, setLocation] = useState(search.homeLocation ?? search.q ?? "");
  const [propertyType, setPropertyType] = useState(search.propertyType ?? "");
  const [homePrice, setHomePrice] = useState(search.homePrice ?? "");
  const [bedrooms, setBedrooms] = useState(search.bedrooms ?? "");
  const [bathrooms, setBathrooms] = useState(search.bathrooms ?? "");
  const [extra, setExtra] = useState<Record<string, string>>({
    homeSquareFeet: search.homeSquareFeet ?? "",
    homeAcres: search.homeAcres ?? "",
    homeYearBuilt: search.homeYearBuilt == null ? "" : String(search.homeYearBuilt),
    homeHeating: search.homeHeating ?? "",
    homeCooling: search.homeCooling ?? "",
    homeGarageParking: search.homeGarageParking ?? "",
    homeSchoolDistrict: search.homeSchoolDistrict ?? "",
    homePetsPolicy: search.homePetsPolicy ?? "",
    homeSmokingPolicy: search.homeSmokingPolicy ?? "",
    leaseLength: search.leaseLength ?? "",
  });

  useEffect(() => {
    setLocation(search.homeLocation ?? search.q ?? "");
    setPropertyType(search.propertyType ?? "");
    setHomePrice(search.homePrice ?? "");
    setBedrooms(search.bedrooms ?? "");
    setBathrooms(search.bathrooms ?? "");
    setExtra({
      homeSquareFeet: search.homeSquareFeet ?? "",
      homeAcres: search.homeAcres ?? "",
      homeYearBuilt: search.homeYearBuilt == null ? "" : String(search.homeYearBuilt),
      homeHeating: search.homeHeating ?? "",
      homeCooling: search.homeCooling ?? "",
      homeGarageParking: search.homeGarageParking ?? "",
      homeSchoolDistrict: search.homeSchoolDistrict ?? "",
      homePetsPolicy: search.homePetsPolicy ?? "",
      homeSmokingPolicy: search.homeSmokingPolicy ?? "",
      leaseLength: search.leaseLength ?? "",
    });
  }, [
    search.homeLocation,
    search.q,
    search.homePrice,
    search.propertyType,
    search.bedrooms,
    search.bathrooms,
    search.homeYearBuilt,
    search.homeHeating,
    search.homeCooling,
    search.homeGarageParking,
    search.homeSchoolDistrict,
    search.homePetsPolicy,
    search.homeSmokingPolicy,
    search.homeAcres,
    search.homeSquareFeet,
    search.leaseLength,
  ]);

  const extraFields =
    activeTab === "build"
      ? [
          {
            key: "homeSquareFeet",
            label: "Square feet",
            options: homeSquareFeetOptions,
            multi: false,
          },
          {
            key: "homeYearBuilt",
            label: "Year built",
            options: homeYearBuiltOptions,
            multi: false,
          },
          {
            key: "homeGarageParking",
            label: "Garage / parking",
            options: ["Any parking", "Attached garage", "Detached garage", "Carport", "No garage"],
            multi: true,
          },
        ]
      : activeTab === "buy"
        ? [
            {
              key: "homeSquareFeet",
              label: "Square feet",
              options: homeSquareFeetOptions,
              multi: false,
            },
            {
              key: "homeYearBuilt",
              label: "Year built",
              options: homeYearBuiltOptions,
              multi: false,
            },
            { key: "homeAcres", label: "Acres", options: homeAcresOptions, multi: false },
            {
              key: "homeGarageParking",
              label: "Garage / parking",
              options: [
                "Any parking",
                "Attached garage",
                "Detached garage",
                "Carport",
                "No garage",
              ],
              multi: true,
            },
            {
              key: "homeSchoolDistrict",
              label: "School district",
              options: ["Any district", "West Ada", "Boise", "Nampa", "Vallivue", "Twin Falls"],
              multi: true,
            },
          ]
        : [
            {
              key: "homePetsPolicy",
              label: "Pet policy",
              options: ["Any pet policy", "Cats", "Dogs", "Pets allowed", "No pets"],
              multi: false,
            },
            {
              key: "homeSmokingPolicy",
              label: "Smoking policy",
              options: ["Any smoking policy", "No smoking", "Smoking allowed"],
              multi: false,
            },
            {
              key: "leaseLength",
              label: "Lease length",
              options: leaseLengthOptions,
              multi: false,
            },
            {
              key: "homeSquareFeet",
              label: "Square feet",
              options: homeSquareFeetOptions,
              multi: false,
            },
          ];

  function currentPatch(): Partial<Search> {
    const [minPrice, maxPrice] = homePrice.split("||");
    const parsedPrice = (value: string | undefined) => {
      return optionalNonNegativeNumber(value);
    };
    return {
      q: location.trim() || undefined,
      homeLocation: location.trim() || undefined,
      propertyType: propertyType || undefined,
      homePrice: homePrice || undefined,
      priceMin: parsedPrice(minPrice),
      priceMax: parsedPrice(maxPrice),
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      homeSquareFeet: undefined,
      homeAcres: undefined,
      homeYearBuilt: undefined,
      homeHeating: undefined,
      homeCooling: undefined,
      homeGarageParking: undefined,
      homeYard: undefined,
      homeSchoolDistrict: undefined,
      homeAvailable: undefined,
      homePetsPolicy: undefined,
      homeSmokingPolicy: undefined,
      leaseLength: undefined,
      ...Object.fromEntries(extraFields.map(({ key }) => [key, extra[key] || undefined])),
    };
  }

  function apply() {
    const patch = currentPatch();
    if (isInvertedRange(patch.priceMin, patch.priceMax)) {
      toast.error("Price minimum cannot exceed maximum.");
      return;
    }
    onApply(patch);
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Bluebird Marketplace Homes
          </p>
          <h1 className="mt-2 text-[22px] font-bold tracking-tight">Find a gem to call home.</h1>
          <p className="mt-1 max-w-[55ch] text-[13px] text-muted-foreground">
            Search new builds, homes for sale, and rentals across Idaho.
          </p>
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
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <HomeFilterControl
          label="County, city, neighborhood, or ZIP"
          value={location}
          onChange={setLocation}
          input
        />
        <HomeFilterControl
          label="Property type"
          value={propertyType}
          options={homePropertyTypes}
          multi
          onChange={setPropertyType}
        />
        <HomePriceRangeControl value={homePrice} onChange={setHomePrice} />
        <HomeFilterControl
          label="Bedrooms"
          value={bedrooms}
          options={homeBedroomOptions}
          multi={false}
          onChange={setBedrooms}
        />
        <HomeFilterControl
          label={activeTab === "rent" ? "Bathrooms" : "Bathrooms"}
          value={bathrooms}
          options={homeBathroomOptions}
          multi={false}
          onChange={setBathrooms}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => onSave(currentPatch())}
            className="h-11 rounded-xl border border-primary px-4 text-[12px] font-bold text-primary hover:bg-secondary"
          >
            Save search
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-[12px] text-muted-foreground">
          <strong className="numeric text-foreground">{resultCount.toLocaleString()}</strong>{" "}
          {homeTabs.find((tab) => tab.value === activeTab)?.eyebrow.toLowerCase()}
        </span>

        <button
          type="button"
          onClick={onClear}
          className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        {extraFields.map((field) => (
          <div key={field.key} className="min-w-0">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {field.label}
            </p>
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
      <button
        type="button"
        onClick={apply}
        className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Apply filters
      </button>
    </section>
  );
}

export function HomeFilterControl({
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
  if (!input && options) {
    return (
      <HomeMultiSelectControl
        label={label}
        value={value}
        options={options}
        multi={multi}
        onChange={onChange}
      />
    );
  }

  return input ? (
    <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
      <MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  ) : (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-8 text-[12px] text-foreground outline-none focus:border-primary"
      >
        {options?.map((option) => (
          <option key={option} value={option === options[0] ? "" : option}>
            {option}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}

export function HomePriceRangeControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [min, max] = value.split("||");
  const summary = min || max ? `$${min || "0"} – ${max ? `$${max}` : "No max"}` : "Any price";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Price"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-full min-w-[260px] rounded-xl border border-border bg-card p-3 shadow-xl">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Min price
              </span>
              <span className="flex h-12 items-center gap-1 rounded-lg border border-input px-2">
                <span className="text-muted-foreground">$</span>
                <input
                  aria-label="Minimum price"
                  inputMode="numeric"
                  value={min ?? ""}
                  onChange={(event) => onChange(`${event.target.value}||${max ?? ""}`)}
                  placeholder="0"
                  className="min-w-0 w-full bg-transparent text-[12px] outline-none"
                />
              </span>
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Max price
              </span>
              <span className="flex h-12 items-center gap-1 rounded-lg border border-input px-2">
                <span className="text-muted-foreground">$</span>
                <input
                  aria-label="Maximum price"
                  inputMode="numeric"
                  value={max ?? ""}
                  onChange={(event) => onChange(`${min ?? ""}||${event.target.value}`)}
                  placeholder="No max"
                  className="min-w-0 w-full bg-transparent text-[12px] outline-none"
                />
              </span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 h-10 w-full rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export function HomeMultiSelectControl({
  label,
  value,
  options,
  multi = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  multi?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = value ? value.split(/\|{1,2}/).filter(Boolean) : [];
  const visibleSelected = multi ? selected : selected.slice(0, 1);
  const summary =
    visibleSelected.length === 0
      ? options[0]
      : visibleSelected.length === 1
        ? visibleSelected[0]
        : `${visibleSelected.length} selected`;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function toggle(option: string) {
    if (option === options[0]) {
      onChange("");
      return;
    }
    if (!multi) {
      onChange(visibleSelected[0] === option ? "" : option);
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join("||"));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-input bg-card px-3 text-left text-[12px] text-foreground outline-none focus:border-primary"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <CaretDown
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-72 w-full min-w-[230px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {options.map((option) => {
            const checked =
              option === options[0]
                ? visibleSelected.length === 0
                : visibleSelected.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                onClick={() => toggle(option)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12px] hover:bg-secondary"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                >
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

export function VehicleResultsPage({
  renderListing,
  loadPreview,
  search,
  result,
  onClear,
  onApply,
  onSave,
  onSell,
}: {
  renderListing: BrowseListingRenderer;
  loadPreview: (search: Search, signal: AbortSignal) => Promise<{ total: number }>;
  search: Search;
  result: BrowseFilterResult;
  onClear: () => void;
  onApply: (patch: Partial<Search>) => void;
  onSave: (patch?: Partial<Search>) => void;
  onSell: () => void;
}) {
  const [term, setTerm] = useState(search.q ?? "");
  const subtypeField = classifiedSubcategoryField(search.category ?? "cars-trucks");
  const [subtype, setSubtype] = useState(search.itemDetailValue ?? "");
  const [make, setMake] = useState(search.make ?? "");
  const [model, setModel] = useState(search.model ?? "");
  const [yearMin, setYearMin] = useState(search.yearMin == null ? "" : String(search.yearMin));
  const [yearMax, setYearMax] = useState(search.yearMax == null ? "" : String(search.yearMax));
  const [priceMin, setPriceMin] = useState(search.priceMin == null ? "" : String(search.priceMin));
  const [priceMax, setPriceMax] = useState(search.priceMax == null ? "" : String(search.priceMax));
  const [mileageBands, setMileageBands] = useState(
    splitVehicleFilter(search.mileageBands)[0] ?? "",
  );
  const [bodyStyle, setBodyStyle] = useState(search.bodyStyle ?? "");
  const [condition, setCondition] = useState(search.condition ?? "");
  const [fulfillment, setFulfillment] = useState(search.fulfillment ?? "");
  const [drivetrain, setDrivetrain] = useState(search.drivetrain ?? "");
  const [transmission, setTransmission] = useState(search.transmission ?? "");
  const [fuelType, setFuelType] = useState(search.fuelType ?? "");
  const [exteriorColor, setExteriorColor] = useState(search.exteriorColor ?? "");
  const [titleStatus, setTitleStatus] = useState(search.titleStatus ?? "");
  const [region, setRegion] = useState(search.region ?? "");
  const [state, setState] = useState(search.state ?? "");
  const [city, setCity] = useState(search.city ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingResultCount, setPendingResultCount] = useState<number | null>(null);
  const previewRequest = useRef(0);
  const selectedMakes = splitVehicleFilter(make);
  const availableModels = modelsForMakes(selectedMakes);

  useEffect(() => {
    setTerm(search.q ?? "");
    setSubtype(search.itemDetailValue ?? "");
    setMake(search.make ?? "");
    setModel(search.model ?? "");
    setYearMin(search.yearMin == null ? "" : String(search.yearMin));
    setYearMax(search.yearMax == null ? "" : String(search.yearMax));
    setPriceMin(search.priceMin == null ? "" : String(search.priceMin));
    setPriceMax(search.priceMax == null ? "" : String(search.priceMax));
    setMileageBands(splitVehicleFilter(search.mileageBands)[0] ?? "");
    setBodyStyle(search.bodyStyle ?? "");
    setCondition(search.condition ?? "");
    setFulfillment(search.fulfillment ?? "");
    setDrivetrain(search.drivetrain ?? "");
    setTransmission(search.transmission ?? "");
    setFuelType(search.fuelType ?? "");
    setExteriorColor(search.exteriorColor ?? "");
    setTitleStatus(search.titleStatus ?? "");
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [search]);

  useEffect(() => {
    const available = new Set(modelsForMakes(splitVehicleFilter(make)));
    setModel((current) =>
      splitVehicleFilter(current)
        .filter((value) => available.has(value))
        .join("||"),
    );
  }, [make]);

  function currentPatch(): Partial<Search> {
    const numberValue = (value: string) => optionalNonNegativeNumber(value);
    const integerValue = (value: string) => optionalNonNegativeInteger(value);
    return {
      q: term.trim() || undefined,
      itemDetailKey: subtype.trim() ? subtypeField.key : undefined,
      itemDetailValue: subtype.trim() || undefined,
      make: make || undefined,
      model: model || undefined,
      yearMin: integerValue(yearMin),
      yearMax: integerValue(yearMax),
      priceMin: numberValue(priceMin),
      priceMax: numberValue(priceMax),
      mileageBands: mileageBands || undefined,
      bodyStyle: bodyStyle || undefined,
      condition: condition || undefined,
      fulfillment: fulfillment || undefined,
      drivetrain: drivetrain || undefined,
      transmission: transmission || undefined,
      fuelType: fuelType || undefined,
      exteriorColor: exteriorColor || undefined,
      titleStatus: titleStatus || undefined,
      region: region || undefined,
      state: state || undefined,
      city: isPostalCode(city) ? undefined : city.trim() || undefined,
      postalCode: isPostalCode(city) ? city.trim() : undefined,
      radiusMiles: isPostalCode(city)
        ? undefined
        : city.trim() || mapPoint
          ? radiusMiles
          : undefined,
      latitude: mapPoint?.latitude,
      longitude: mapPoint?.longitude,
    };
  }

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++previewRequest.current;
    const timer = setTimeout(() => {
      const pendingSearch = {
        ...search,
        ...currentPatch(),
        page: undefined,
        vehicleMode: "results" as const,
      };
      void loadPreview(pendingSearch, controller.signal)
        .then((preview) => {
          if (!controller.signal.aborted && requestId === previewRequest.current)
            setPendingResultCount(preview.total);
        })
        .catch(() => {
          if (!controller.signal.aborted && requestId === previewRequest.current)
            setPendingResultCount(null);
        });
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    loadPreview,
    subtype,
    bodyStyle,
    city,
    condition,
    drivetrain,
    exteriorColor,
    fuelType,
    fulfillment,
    make,
    mileageBands,
    model,
    priceMax,
    priceMin,
    region,
    search,
    state,
    term,
    titleStatus,
    transmission,
    yearMax,
    yearMin,
    radiusMiles,
    mapPoint,
  ]);

  function apply() {
    const patch = currentPatch();
    if (
      isInvertedRange(patch.yearMin, patch.yearMax) ||
      isInvertedRange(patch.priceMin, patch.priceMax)
    ) {
      toast.error("Minimum cannot exceed maximum.");
      return;
    }
    setPendingResultCount(null);
    onApply(patch);
  }

  return (
    <div className="mt-8">
      <section className="floating-card overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              Bluebird motors
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">
              {classifiedCategories.find((category) => category.slug === search.category)?.name ??
                "Vehicles"}
            </h1>
          </div>
          <div className="grid w-full max-w-[330px] grid-cols-2 rounded-2xl bg-secondary p-1.5 ring-1 ring-border/70">
            <button
              type="button"
              aria-pressed="true"
              className="rounded-xl bg-primary px-3 py-3 text-[13px] font-bold text-primary-foreground shadow-sm"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={onSell}
              className="rounded-xl px-3 py-3 text-[13px] font-bold hover:bg-card"
            >
              Sell
            </button>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
        <form
          className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Search cars</span>
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search cars, trucks, and more"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            className="h-12 rounded-xl bg-primary px-5 text-[12px] font-bold text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </form>
        <div className="mt-5 flex justify-end border-t border-border pt-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onSave(currentPatch())}
              className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 text-[12px] font-bold text-primary hover:bg-secondary"
            >
              <BookmarkSimple size={15} aria-hidden="true" />
              Save this search
            </button>
          </div>
        </div>
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ResponsiveBrowseFilters title="Vehicle filters" resetKey={JSON.stringify(search)}>
          <div className="space-y-3">
            {search.category && (
              <VehicleFilterGroup title="Category details">
                <VehicleTextField
                  label={subtypeField.label}
                  value={subtype}
                  onChange={setSubtype}
                  placeholder="Any subcategory"
                />
              </VehicleFilterGroup>
            )}
            <VehicleFilterGroup title="Make / model">
              <VehicleCheckboxList
                label="Makes"
                value={make}
                options={vehicleOptions.makes}
                onChange={setMake}
              />
              {selectedMakes.length > 0 && (
                <VehicleCheckboxList
                  label="Models"
                  value={model}
                  options={availableModels}
                  onChange={setModel}
                />
              )}
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Year">
              <div className="grid grid-cols-2 gap-2">
                <VehicleTextField
                  label="Year from"
                  value={yearMin}
                  onChange={setYearMin}
                  placeholder="From"
                  numeric
                />
                <VehicleTextField
                  label="Year to"
                  value={yearMax}
                  onChange={setYearMax}
                  placeholder="To"
                  numeric
                />
              </div>
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Price">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <VehicleTextField
                  label="Minimum price"
                  value={priceMin}
                  onChange={setPriceMin}
                  placeholder="$ From"
                  numeric
                />
                <span className="text-muted-foreground">–</span>
                <VehicleTextField
                  label="Maximum price"
                  value={priceMax}
                  onChange={setPriceMax}
                  placeholder="$ To"
                  numeric
                />
              </div>
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Mileage">
              <VehicleSingleSelectList
                label="Mileage"
                value={mileageBands}
                options={mileageBandOptions}
                onChange={setMileageBands}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Body type">
              <VehicleCheckboxList
                label="Body type"
                value={bodyStyle}
                options={vehicleOptions.bodyStyles}
                onChange={setBodyStyle}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Condition">
              <VehicleCheckboxList
                label="Condition"
                value={condition}
                options={vehicleConditionOptions}
                onChange={setCondition}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Delivery">
              <VehicleCheckboxList
                label="Delivery"
                value={fulfillment}
                options={[
                  { value: "local_pickup", label: "Local pickup" },
                  { value: "shipping", label: "Ships" },
                  { value: "both", label: "Pickup or shipping" },
                ]}
                onChange={setFulfillment}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Drive type">
              <VehicleCheckboxList
                label="Drive type"
                value={drivetrain}
                options={vehicleOptions.drivetrains}
                onChange={setDrivetrain}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Transmission">
              <VehicleCheckboxList
                label="Transmission"
                value={transmission}
                options={vehicleOptions.transmissions}
                onChange={setTransmission}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Fuel type">
              <VehicleCheckboxList
                label="Fuel type"
                value={fuelType}
                options={vehicleOptions.fuelTypes}
                onChange={setFuelType}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Exterior color">
              <VehicleCheckboxList
                label="Exterior color"
                value={exteriorColor}
                options={vehicleOptions.exteriorColors}
                onChange={setExteriorColor}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Title type">
              <VehicleCheckboxList
                label="Title type"
                value={titleStatus}
                options={vehicleOptions.titleStatuses}
                onChange={setTitleStatus}
              />
            </VehicleFilterGroup>
            <VehicleFilterGroup title="Location">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Start with a city or ZIP code. Region and state are optional broader browsing
                controls.
              </p>
              <select
                aria-label="Region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="filter-input w-full"
              >
                <option value="">Any region (optional)</option>
                {idahoRegions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                aria-label="State"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="filter-input w-full"
              >
                <option value="">Any state (optional)</option>
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <VehicleTextField
                label="City or ZIP code"
                value={city}
                onChange={(value) => {
                  setCity(value);
                  setMapPoint(undefined);
                }}
                placeholder="Boise or 83702"
                list="vehicle-location-options"
              />
              <button
                type="button"
                onClick={() => setMapOpen((open) => !open)}
                className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                aria-expanded={mapOpen}
              >
                {mapOpen ? "Hide map" : "Choose anywhere on map"}
              </button>
              {mapOpen ? (
                <LocationRadiusPicker
                  city={city}
                  latitude={mapPoint?.latitude}
                  longitude={mapPoint?.longitude}
                  radiusMiles={radiusMiles}
                  onChange={(point) => {
                    setMapPoint(point);
                    setCity(point.city ?? "");
                  }}
                />
              ) : null}
              <label className="block text-[11px] font-medium text-muted-foreground">
                Distance radius:{" "}
                <span className="font-semibold text-foreground">{radiusMiles} miles</span>
                <input
                  type="range"
                  min="5"
                  max="500"
                  step="5"
                  value={radiusMiles}
                  onChange={(event) => setRadiusMiles(Number(event.target.value))}
                  className="mt-2 w-full accent-primary"
                  disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
                />
                {isPostalCode(city) ? (
                  <span className="mt-1 block font-normal">
                    ZIP searches match that ZIP; use a city for distance.
                  </span>
                ) : null}
              </label>
            </VehicleFilterGroup>
            <button
              type="button"
              onClick={apply}
              className="h-11 w-full rounded-xl bg-primary text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              Show {(pendingResultCount ?? result.total).toLocaleString()} results
            </button>
          </div>
        </ResponsiveBrowseFilters>

        <section id="results" aria-label="Car listings" className="min-w-0 lg:col-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <p className="text-[13px] text-muted-foreground">
              <strong className="numeric text-foreground">{result.total}</strong> cars and trucks
            </p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Sort by
              <select
                className="select-chevron h-9 rounded-lg border border-input bg-card pl-2 pr-7 text-[12px] text-foreground"
                value={search.sort ?? "newest"}
                onChange={(event) => onApply({ sort: event.target.value as Sort })}
              >
                <option value="newest">Newest first</option>
                <option value="price_low">Lowest price</option>
                <option value="price_high">Highest price</option>
              </select>
            </label>
          </div>
          {result.listings.length === 0 ? (
            <BluebirdEmptyState
              className="mt-5"
              title="No cars match these filters."
              description="Try widening your year, price, make, model, or location choices."
            />
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 xl:grid-cols-3">
              {result.listings.map((listing, index) => (
                <li key={listing.id}>{renderListing(listing, index)}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export type VehicleFilterOption = string | { value: string; label: string };

export function VehicleCheckboxList({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly VehicleFilterOption[];
  onChange: (value: string) => void;
}) {
  const selected = value.split("||").filter(Boolean);
  const toggle = (option: VehicleFilterOption) => {
    const optionValue = typeof option === "string" ? option : option.value;
    onChange(
      selected.includes(optionValue)
        ? selected.filter((item) => item !== optionValue).join("||")
        : [...selected, optionValue].join("||"),
    );
  };
  return (
    <div role="group" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        const checked = selected.includes(optionValue);
        return (
          <label
            key={optionValue}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"
          >
            <span>{optionLabel}</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(option)}
              className="size-4 accent-primary"
            />
          </label>
        );
      })}
    </div>
  );
}

export function VehicleSingleSelectList({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly VehicleFilterOption[];
  onChange: (value: string) => void;
}) {
  const selected = splitVehicleFilter(value)[0] ?? "";
  const radioName = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div role="radiogroup" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        return (
          <label
            key={optionValue}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-secondary"
          >
            <span>{optionLabel}</span>
            <input
              type="radio"
              name={radioName}
              value={optionValue}
              checked={selected === optionValue}
              onChange={() => onChange(optionValue)}
              className="size-4 accent-primary"
            />
          </label>
        );
      })}
    </div>
  );
}

export function VehicleTextField({
  label,
  value,
  onChange,
  placeholder,
  numeric = false,
  list,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
  list?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="filter-input w-full"
        list={list}
      />
      {list ? <LocationOptions id={list} query={value} /> : null}
    </label>
  );
}

export function VehicleFilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function InlineLocationFilter({
  search,
  onApply,
}: {
  search: Search;
  onApply: (patch: Partial<Search>) => void;
}) {
  const [region, setRegion] = useState(search.region ?? "");
  const [state, setState] = useState(search.state ?? "");
  const [city, setCity] = useState(search.city ?? "");
  const [radiusMiles, setRadiusMiles] = useState(search.radiusMiles ?? 25);
  const [mapPoint, setMapPoint] = useState<LocationPoint | undefined>(
    search.latitude != null && search.longitude != null
      ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
      : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setRegion(search.region ?? "");
    setState(search.state ?? "");
    setCity(search.city ?? search.postalCode ?? "");
    setRadiusMiles(search.radiusMiles ?? 25);
    setMapPoint(
      search.latitude != null && search.longitude != null
        ? { latitude: search.latitude, longitude: search.longitude, city: search.city }
        : undefined,
    );
  }, [
    search.region,
    search.state,
    search.city,
    search.postalCode,
    search.radiusMiles,
    search.latitude,
    search.longitude,
  ]);

  return (
    <div className="w-full space-y-2.5">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Choose a city or ZIP first. Region and state are optional broader browsing controls.
      </p>
      <select
        value={region}
        onChange={(event) => setRegion(event.target.value)}
        className="filter-input w-full"
      >
        <option value="">Any region (optional)</option>
        {idahoRegions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        value={state}
        onChange={(event) => setState(event.target.value)}
        className="filter-input w-full"
      >
        <option value="">Any state (optional)</option>
        {usStates.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <input
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
          setMapPoint(undefined);
        }}
        placeholder="City or ZIP code, e.g. Boise or 83702"
        aria-label="City or ZIP code"
        className="filter-input w-full"
        list="bluebird-city-options"
      />
      <LocationOptions id="bluebird-city-options" query={city} />
      <button
        type="button"
        onClick={() => setMapOpen((open) => !open)}
        className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
        aria-expanded={mapOpen}
      >
        {mapOpen ? "Hide map" : "Choose anywhere on map"}
      </button>
      {mapOpen ? (
        <LocationRadiusPicker
          city={city}
          latitude={mapPoint?.latitude}
          longitude={mapPoint?.longitude}
          radiusMiles={radiusMiles}
          onChange={(point) => {
            setMapPoint(point);
            setCity(point.city ?? "");
          }}
        />
      ) : null}
      {city.trim() && !isPostalCode(city) ? (
        <span className="sr-only">Within {radiusMiles} miles</span>
      ) : null}
      {isPostalCode(city) ? (
        <p className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          ZIP searches match <strong className="text-foreground">{city.trim()}</strong>. Use a city
          when you want a distance radius.
        </p>
      ) : null}
      <label className="block text-[11px] font-medium text-muted-foreground">
        Search radius: <span className="font-semibold text-foreground">{radiusMiles} miles</span>
        <input
          type="range"
          min="5"
          max="500"
          step="5"
          value={radiusMiles}
          onChange={(event) => setRadiusMiles(Number(event.target.value))}
          className="mt-2 w-full accent-primary"
          disabled={(!city.trim() && !mapPoint) || isPostalCode(city)}
        />
      </label>
      <InlineApplyButton
        onClick={() =>
          onApply({
            region: region || undefined,
            state: state || undefined,
            city: isPostalCode(city) ? undefined : city.trim() || undefined,
            postalCode: isPostalCode(city) ? city.trim() : undefined,
            radiusMiles: isPostalCode(city)
              ? undefined
              : city.trim() || mapPoint
                ? radiusMiles
                : undefined,
            latitude: mapPoint?.latitude,
            longitude: mapPoint?.longitude,
          })
        }
      />
    </div>
  );
}

export function InlineApplyButton({ onClick }: { onClick: () => void }) {
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
