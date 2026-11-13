import { optionalNonNegativeNumber } from "./classifieds-query.ts";
import {
  inputFromSearch,
  parseBrowseSearch,
  postedWindow,
  thresholdValue,
} from "./browse-search.ts";
import {
  normalizeClassifiedBrowseInput,
  type ClassifiedBrowseInput,
} from "./classified-browse-contract.ts";

const canonicalKeys = new Set(Object.keys(normalizeClassifiedBrowseInput({})));
const routeKeys = new Set(Object.keys(parseBrowseSearch({}, { normalizeCategory: false })));
const presentationKeys = new Set([
  "allCategories",
  "savedSearchId",
  "view",
  "homeMode",
  "jobMode",
  "serviceMode",
  "vehicleMode",
  "petMode",
  "firearmMode",
  "mobileCatalog",
]);
// Legacy controls without a supported inventory predicate must never broaden an alert.
const unsupportedKeys = new Set([
  "sellerType",
  "serviceExpandSearch",
  "serviceVideo",
  "serviceSellerType",
  "jobVideo",
  "homeBuilder",
  "constructionType",
  "homeSellerType",
  "petsCats",
  "petsDogs",
  "homeAmenities",
  "communityAmenities",
]);
const aliases = new Set([
  "categorySlug",
  "section",
  "query",
  "keyword",
  "minPrice",
  "maxPrice",
  "location",
  "employmentType",
  "jobSalaryMin",
]);
const booleanKeys = new Set(["hasPhotos", "serviceLicenseRequired"]);
const active = (value: unknown) =>
  value !== undefined && value !== null && value !== "" && value !== false;
const defined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const dollars = (value: unknown) =>
  typeof value === "string" ? value.replace(/[$,]/g, "") : value;

/** Resolve current website names and earlier stored domain names without category-switch
 * resets or landing-page defaults. Unsupported constraints fail closed, never disappear. */
export function savedSearchBrowseInput(search: Record<string, unknown>): {
  input: ClassifiedBrowseInput;
  unsupported: string[];
} {
  const raw: Record<string, unknown> = {
    ...search,
    category: search.category ?? search.categorySlug ?? search.section,
    q: search.q ?? search.query ?? search.keyword,
    priceMin: dollars(search.priceMin ?? search.minPrice),
    priceMax: dollars(search.priceMax ?? search.maxPrice),
    jobEmploymentType: search.jobEmploymentType ?? search.employmentType,
    jobPayMin: search.jobPayMin ?? search.jobSalaryMin,
  };
  if (
    typeof search.homeMode === "string" &&
    ["buy", "rent", "build"].includes(search.homeMode) &&
    !search.homeTab
  )
    raw.homeTab = search.homeMode;
  for (const key of ["category", "q", "homeTab"])
    if (raw[key] === "all" || raw[key] === "") delete raw[key];
  const unsupported = new Set<string>();
  let invalidValue = false;
  for (const [key, value] of Object.entries(raw)) {
    if (!active(value)) continue;
    if (
      !["string", "number", "boolean"].includes(typeof value) ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      unsupported.add(key);
      invalidValue = true;
      continue;
    }
    if (
      unsupportedKeys.has(key) ||
      (!canonicalKeys.has(key) && !routeKeys.has(key) && !aliases.has(key))
    )
      unsupported.add(key);
  }
  if (invalidValue) return { input: {}, unsupported: [...unsupported] };
  const canonicalRaw = Object.fromEntries(
    Object.entries(raw).filter(([key]) => canonicalKeys.has(key)),
  );
  for (const key of booleanKeys) {
    if (raw[key] === "true" || raw[key] === "false") canonicalRaw[key] = raw[key] === "true";
    else if (raw[key] !== undefined && typeof raw[key] !== "boolean") unsupported.add(key);
  }
  const canonical = normalizeClassifiedBrowseInput(canonicalRaw as ClassifiedBrowseInput);
  for (const [key, value] of Object.entries(canonicalRaw)) {
    if (!active(value) || key === "mobileCatalog") continue;
    if (canonical[key as keyof ClassifiedBrowseInput] === undefined) unsupported.add(key);
  }
  // Results matching must retain geographic constraints even when the saved URL was a landing page.
  const parsed = parseBrowseSearch(raw, { normalizeCategory: false });
  const input = {
    ...defined(canonical),
    ...defined(inputFromSearch({ ...parsed, vehicleMode: "results", firearmMode: "results" })),
  } as ClassifiedBrowseInput;
  if (canonical.hasPhotos) input.hasPhotos = true;
  for (const [key, value] of Object.entries(raw)) {
    if (
      !active(value) ||
      !routeKeys.has(key) ||
      presentationKeys.has(key) ||
      key === "jobEmploymentType" ||
      (booleanKeys.has(key) && canonical[key as keyof ClassifiedBrowseInput] !== undefined)
    )
      continue;
    if (parsed[key as keyof typeof parsed] === undefined) unsupported.add(key);
  }
  for (const key of ["bedrooms", "bathrooms", "homeSquareFeet", "homeAcres"])
    if (active(raw[key]) && thresholdValue(String(raw[key])) === undefined) unsupported.add(key);
  for (const key of ["jobPosted", "jobTimeOnSite", "serviceTimeOnSite"])
    if (active(raw[key]) && !postedWindow(String(raw[key]))) unsupported.add(key);
  for (const key of ["jobPhotos", "servicePhotos"])
    if (active(raw[key]) && !["true", "false"].includes(String(raw[key]))) unsupported.add(key);
  if (
    active(raw.mileageBands) &&
    String(raw.mileageBands)
      .split("||")
      .some((band) => !/^Under (25,000|50,000|75,000|100,000|150,000) miles$/.test(band))
  )
    unsupported.add("mileageBands");
  if (active(raw.homePrice) && input.priceMin === undefined && input.priceMax === undefined)
    unsupported.add("homePrice");
  if (active(raw.homePrice)) {
    const bounds = String(raw.homePrice).split("||");
    if (
      bounds.length > 2 ||
      bounds.some((value) => active(value) && optionalNonNegativeNumber(value) === undefined)
    )
      unsupported.add("homePrice");
  }
  if (
    active(raw.homeMode) &&
    !["landing", "results", "buy", "rent", "build"].includes(String(raw.homeMode))
  )
    unsupported.add("homeMode");
  const mappedAliases: Record<string, string[]> = {
    homePropertyType: ["propertyType"],
    homeBedroomsMin: ["bedrooms"],
    homeBathroomsMin: ["bathrooms"],
    homeSquareFeetMin: ["homeSquareFeet"],
    homeYearBuiltMin: ["homeYearBuilt"],
    homeAcresMin: ["homeAcres"],
    homeLeaseLength: ["leaseLength"],
    jobEmploymentType: ["jobType"],
    postedWithin: ["jobPosted", "jobTimeOnSite", "serviceTimeOnSite"],
  };
  for (const [key, names] of Object.entries(mappedAliases))
    if (
      active(canonicalRaw[key]) &&
      names.some((name) => active(raw[name])) &&
      canonical[key as keyof ClassifiedBrowseInput] !== input[key as keyof ClassifiedBrowseInput]
    )
      unsupported.add(key);
  // Unlike URL category navigation, contradictory stored category filters remain active.
  const normalized = normalizeClassifiedBrowseInput(input);
  for (const [key, value] of Object.entries(input))
    if (active(value) && normalized[key as keyof ClassifiedBrowseInput] === undefined)
      unsupported.add(key);
  return { input: normalized, unsupported: [...unsupported] };
}
