import type { ClassifiedBrowseInput } from "./classifieds.functions";
import { canonicalHomePropertyType } from "./openwebninja-contract.ts";

type CollectionFilters = Pick<
  ClassifiedBrowseInput,
  "category" | "homeTab" | "homePropertyType" | "serviceSubcategory" | "jobEmploymentType"
>;
type CollectionEvidence = {
  categorySlug?: string | null;
  home?: { mode?: string | null; propertyType?: string | null } | null;
  service?: { subcategory?: string | null } | null;
  directory?: { trades?: string[] } | null;
  job?: { employmentType?: string | null } | null;
};

export type SeoCollection = {
  slug: string;
  category: string;
  heading: string;
  noun: string;
  filters: CollectionFilters;
  cities: readonly string[];
  advice: { heading: string; text: string }[];
};
const rentalCities = ["Boise", "Meridian", "Nampa", "Twin Falls", "Idaho Falls", "Pocatello"];
/** A finite researched collection set, not every possible filter permutation.
 * Supply and freshness gates still decide which pages enter the sitemap. */
export const seoCollections: SeoCollection[] = [
  {
    slug: "homes-for-sale",
    category: "other-real-estate",
    heading: "Homes for sale",
    noun: "homes for sale",
    filters: { category: "other-real-estate", homeTab: "buy" },
    cities: [],
    advice: [
      {
        heading: "Compare a home, not just its asking price",
        text: "Review the property type, living area, lot size and available heating, cooling and parking details. Asking prices and automated estimates are different measures; confirm current terms with the listing contact.",
      },
      {
        heading: "Plan your next visit",
        text: "Use the address and photos to shortlist homes, then confirm availability, an appointment and any HOA obligations with the listing agent or owner. A property listing does not replace an inspection or title review.",
      },
    ],
  },
  {
    slug: "rentals",
    category: "other-real-estate",
    heading: "Homes and apartments for rent",
    noun: "rental homes and apartments",
    filters: { category: "other-real-estate", homeTab: "rent" },
    cities: [],
    advice: [
      {
        heading: "Compare the full monthly cost",
        text: "Compare rent with any stated deposits, utilities, parking and pet charges. When a listing leaves those details out, ask the property contact before applying; missing information does not mean a fee is zero.",
      },
      {
        heading: "Verify the home before sending money",
        text: "Confirm the address, availability, lease length and who manages the property. Arrange a viewing or a verified live tour and read the actual lease before paying a deposit.",
      },
    ],
  },
  {
    slug: "houses-for-rent",
    category: "other-real-estate",
    heading: "Houses for rent",
    noun: "rental houses",
    filters: {
      category: "other-real-estate",
      homeTab: "rent",
      homePropertyType: "Single-family home||Townhome||Duplex",
    },
    cities: rentalCities,
    advice: [
      {
        heading: "Check what comes with the house",
        text: "Compare bedrooms, bathrooms, usable living area, parking and any stated yard or appliance details. Confirm who maintains the lawn and handles snow removal, along with any pet or occupancy terms.",
      },
      {
        heading: "Keep the rental search focused",
        text: "These results include houses, townhomes and duplexes marked for rent. Use the matching-listings link for price and bedroom filters; nearby results can include other towns within the stated search radius.",
      },
    ],
  },
  {
    slug: "apartments-for-rent",
    category: "other-real-estate",
    heading: "Apartments for rent",
    noun: "rental apartments",
    filters: { category: "other-real-estate", homeTab: "rent", homePropertyType: "Apartment" },
    cities: ["Boise", "Nampa", "Idaho Falls"],
    advice: [
      {
        heading: "Ask about the specific unit",
        text: "Confirm the unit's availability, floor plan, lease length, parking and move-in costs. A building's advertised price or photo may represent one unit or layout; verify which one the property contact is offering.",
      },
      {
        heading: "Compare rules and recurring charges",
        text: "Review stated pet policies, utilities and laundry arrangements. Ask about recurring charges and application requirements before paying, especially when those terms are absent from the listing.",
      },
    ],
  },
  {
    slug: "plumbers",
    category: "services",
    heading: "Plumbers",
    noun: "plumbing services",
    filters: { category: "services", serviceSubcategory: "Plumbers" },
    cities: ["Boise", "Meridian", "Nampa"],
    advice: [
      {
        heading: "Describe the plumbing job before requesting a quote",
        text: "Tell the business whether you need leak repair, a fixture replacement, drain work or another service. Ask about service-area coverage, call-out charges and whether the estimate includes parts, labor and cleanup.",
      },
      {
        heading: "Confirm credentials and availability",
        text: "Verify the qualifications and insurance appropriate to your job with the business and the relevant Idaho authority. A directory listing is not Bluebird's endorsement, a license check or a promise of emergency availability.",
      },
    ],
  },
  {
    slug: "house-cleaning",
    category: "services",
    heading: "House cleaning services",
    noun: "house cleaning services",
    filters: { category: "services", serviceSubcategory: "House Cleaning" },
    cities: ["Boise"],
    advice: [
      {
        heading: "Make cleaning quotes comparable",
        text: "Describe the home's size and whether you need recurring, deep or move-out cleaning. Ask which rooms and tasks are included and whether appliances, windows, supplies or extra visits cost more.",
      },
      {
        heading: "Agree on access and scope",
        text: "Confirm appointment times, cancellation terms, insurance and how the cleaner will enter the property. Keep the written scope and quote so both sides understand the work.",
      },
    ],
  },
  {
    slug: "landscaping",
    category: "services",
    heading: "Landscaping services",
    noun: "landscaping services",
    filters: { category: "services", serviceSubcategory: "Landscape Contractors" },
    cities: ["Boise", "Twin Falls"],
    advice: [
      {
        heading: "Match the contractor to the project",
        text: "Separate routine lawn care from irrigation repairs, planting, grading or a larger landscape installation. Share photos and measurements and ask whether the business serves your address and handles the kind of work you need.",
      },
      {
        heading: "Compare the same scope",
        text: "Ask for the proposed materials, disposal, schedule, payment stages and any maintenance obligations in writing. Confirm credentials appropriate to the work instead of relying on a directory category alone.",
      },
    ],
  },
  {
    slug: "part-time-jobs",
    category: "jobs",
    heading: "Part-time jobs",
    noun: "part-time jobs",
    filters: { category: "jobs", jobEmploymentType: "Part-time" },
    cities: ["Boise", "Idaho Falls"],
    advice: [
      {
        heading: "Check the actual schedule and workplace",
        text: "Confirm weekly hours, shifts and the worksite in the employer's job description. An employer's headquarters or a search-area label may differ from where you would work.",
      },
      {
        heading: "Compare the terms before applying",
        text: "Review the stated pay unit, employment type, qualifications and application destination. Treat estimates as estimates and confirm that the employer is still accepting applications.",
      },
    ],
  },
];

export function seoCollectionFromSlug(slug: string) {
  return seoCollections.find((collection) => collection.slug === slug) ?? null;
}
export function collectionAvailableIn(collection: SeoCollection, city?: string) {
  return !city || collection.cities.includes(city);
}
export function collectionMatches(collection: SeoCollection, card: CollectionEvidence) {
  const filter = collection.filters;
  return (
    card.categorySlug === collection.category &&
    (!filter.homeTab || card.home?.mode === filter.homeTab) &&
    (!filter.homePropertyType ||
      filter.homePropertyType
        .split("||")
        .includes(canonicalHomePropertyType(card.home?.propertyType) ?? "")) &&
    (!filter.jobEmploymentType ||
      filter.jobEmploymentType.split("||").includes(card.job?.employmentType ?? "")) &&
    (!filter.serviceSubcategory ||
      [card.service?.subcategory, ...(card.directory?.trades ?? [])].some((trade) =>
        trade?.toLowerCase().includes(filter.serviceSubcategory!.toLowerCase()),
      ))
  );
}

/** Rotate a bounded pair through researched public destinations on the
 * maintenance runs and homepage background work. These reads never refresh providers. */
export function seoPrewarmTargets(slot: number) {
  const citySlug = (city: string) =>
    city
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-");
  const targets = [
    { place: "boise", category: "cars-trucks" },
    { place: "idaho-falls", category: "cars-trucks" },
    { place: "homes", category: "" },
    { place: "services", category: "" },
    ...seoCollections.flatMap((collection) => [
      { place: collection.slug, category: "" },
      ...collection.cities.map((city) => ({ place: citySlug(city), category: collection.slug })),
    ]),
  ];
  const start = (((Math.floor(slot) * 2) % targets.length) + targets.length) % targets.length;
  return [targets[start], targets[(start + 1) % targets.length]];
}
