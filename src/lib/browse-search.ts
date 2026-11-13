/** One website/app search contract. No router, server-function or tracking adapters. */
import { normalizeBrowsePage } from "./classifieds-pagination.ts";
import {
  isPetSelectionCompatible,
  normalizePetSpecies,
  normalizePetSubcategory,
} from "../config/pets.ts";
import {
  firearmAccessoryTypes,
  firearmBrands,
  firearmListingTypes,
  firearmTypes,
} from "../config/classified-item-fields.ts";
import { isMotorsCategory } from "./classifieds-display.ts";
import { type ClassifiedBrowseInput } from "./classified-browse-contract.ts";
import { optionalNonNegativeInteger, optionalNonNegativeNumber } from "./classifieds-query.ts";

export type Sort = NonNullable<ClassifiedBrowseInput["sort"]>;

export type View = "grid" | "list";

export type HomeTab = "build" | "buy" | "rent";

export type JobMode = "landing" | "results";

export type ServiceMode = "landing" | "results";

export type PetMode = "landing" | "results";

export type FirearmMode = "landing" | "results";

export type Search = {
  dealerSlug?: string | undefined;
  allCategories?: boolean | undefined;
  q?: string | undefined;
  savedSearchId?: string | undefined;
  category?: string | undefined;
  group?: "motors" | "classifieds" | undefined;
  state?: string | undefined;
  region?: string | undefined;
  city?: string | undefined;
  radiusMiles?: number | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  postalCode?: string | undefined;
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
  sellerType?: string | undefined;
  mileageBands?: string | undefined;
  sort?: Sort | undefined;
  view?: View | undefined;
  page?: number | undefined;
  homeMode?: "landing" | "results" | undefined;
  homeTab?: HomeTab | undefined;
  homeYearBuilt?: number | undefined;
  homeHeating?: string | undefined;
  homeCooling?: string | undefined;
  homeGarageParking?: string | undefined;
  homeYard?: string | undefined;
  homeSchoolDistrict?: string | undefined;
  homeAvailable?: string | undefined;
  homePetsPolicy?: string | undefined;
  homeSmokingPolicy?: string | undefined;
  jobMode?: JobMode | undefined;
  serviceMode?: ServiceMode | undefined;
  vehicleMode?: "landing" | "results" | undefined;
  petMode?: PetMode | undefined;
  firearmMode?: FirearmMode | undefined;
  firearmListingType?: string | undefined;
  firearmType?: string | undefined;
  firearmBrand?: string | undefined;
  firearmAccessoryType?: string | undefined;
  petSubcategory?: string | undefined;
  petSpecies?: string | undefined;
  petBreed?: string | undefined;
  petPlacementType?: string | undefined;
  petOfferedBy?: string | undefined;
  petSex?: string | undefined;
  petAge?: string | undefined;
  petHypoallergenic?: string | undefined;
  petVaccinated?: string | undefined;
  petSpayedNeutered?: string | undefined;
  petMicrochipped?: string | undefined;
  petRecordsAvailable?: string | undefined;
  petGoodWithKids?: string | undefined;
  petGoodWithDogs?: string | undefined;
  petGoodWithCats?: string | undefined;
  petIndoorOutdoor?: string | undefined;
  itemDetailKey?: string | undefined;
  itemDetailValue?: string | undefined;
  serviceSubcategory?: string | undefined;
  serviceExpandSearch?: string | undefined;
  servicePhotos?: string | undefined;
  serviceVideo?: string | undefined;
  serviceSellerType?: string | undefined;
  serviceCondition?: string | undefined;
  serviceTimeOnSite?: string | undefined;
  serviceArea?: string | undefined;
  serviceAvailability?: string | undefined;
  serviceLicenseRequired?: string | undefined;
  jobCategory?: string | undefined;
  jobEmployer?: string | undefined;
  jobEmploymentType?: string | undefined;
  jobType?: string | undefined;
  jobPayType?: string | undefined;
  jobPayMin?: number | undefined;
  jobPayMax?: number | undefined;
  jobExperience?: string | undefined;
  jobPosted?: string | undefined;
  jobEducation?: string | undefined;
  jobPhotos?: string | undefined;
  jobVideo?: string | undefined;
  jobTimeOnSite?: string | undefined;
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

export const savedSearchFilterKeys: readonly (keyof Search)[] = [
  "allCategories",
  "q",
  "category",
  "group",
  "state",
  "region",
  "city",
  "radiusMiles",
  "latitude",
  "longitude",
  "postalCode",
  "condition",
  "fulfillment",
  "priceMin",
  "priceMax",
  "make",
  "model",
  "yearMin",
  "yearMax",
  "mileageMax",
  "mileageBands",
  "bodyStyle",
  "transmission",
  "drivetrain",
  "fuelType",
  "exteriorColor",
  "titleStatus",
  "sellerType",
  "homeTab",
  "homeMode",
  "homeYearBuilt",
  "homeHeating",
  "homeCooling",
  "homeGarageParking",
  "homeYard",
  "homeSchoolDistrict",
  "homeAvailable",
  "homePetsPolicy",
  "homeSmokingPolicy",
  "jobMode",
  "serviceMode",
  "vehicleMode",
  "petMode",
  "firearmMode",
  "firearmListingType",
  "firearmType",
  "firearmBrand",
  "firearmAccessoryType",
  "serviceSubcategory",
  "serviceExpandSearch",
  "servicePhotos",
  "serviceVideo",
  "serviceSellerType",
  "serviceCondition",
  "serviceTimeOnSite",
  "serviceArea",
  "serviceAvailability",
  "serviceLicenseRequired",
  "jobCategory",
  "jobEmployer",
  "jobEmploymentType",
  "jobType",
  "jobPayType",
  "jobPayMin",
  "jobPayMax",
  "jobExperience",
  "jobPosted",
  "jobEducation",
  "jobPhotos",
  "jobVideo",
  "jobTimeOnSite",
  "homeLocation",
  "homePrice",
  "propertyType",
  "bedrooms",
  "bathrooms",
  "homeSquareFeet",
  "homeBuilder",
  "constructionType",
  "homeAcres",
  "homeSellerType",
  "petsCats",
  "petsDogs",
  "homeAmenities",
  "communityAmenities",
  "leaseLength",
  "petSubcategory",
  "petSpecies",
  "petBreed",
  "petPlacementType",
  "petOfferedBy",
  "petSex",
  "petAge",
  "petHypoallergenic",
  "petVaccinated",
  "petSpayedNeutered",
  "petMicrochipped",
  "petRecordsAvailable",
  "petGoodWithKids",
  "petGoodWithDogs",
  "petGoodWithCats",
  "petIndoorOutdoor",
  "itemDetailKey",
  "itemDetailValue",
];

export const sortOptions: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "mileage_low", label: "Mileage: low to high" },
];

export const normalizeMultiSelect = (value: string | undefined) =>
  value
    ?.split(/\|\||,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("||") ?? "";

export const hasSearchValue = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

export function stringParam(search: Record<string, unknown>, key: string, max = 80) {
  const value = search[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export function numberParam(search: Record<string, unknown>, key: string) {
  return optionalNonNegativeNumber(search[key]);
}

export function coordinateParam(search: Record<string, unknown>, key: string) {
  const value = search[key];
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function integerParam(search: Record<string, unknown>, key: string) {
  return optionalNonNegativeInteger(search[key]);
}

export function thresholdValue(value: string | undefined) {
  const match = value?.replaceAll(",", "").match(/[0-9]+(?:\.[0-9]+)?/);
  const parsed = match ? Number(match[0]) : undefined;
  return parsed != null && Number.isFinite(parsed) ? parsed : undefined;
}

export function postedWindow(value: string | undefined): ClassifiedBrowseInput["postedWithin"] {
  if (!value) return undefined;
  if (value === "Last hour") return "hour";
  if (value === "Last 24 hours") return "day";
  if (value === "Last 7 days") return "week";
  if (value === "Last 30 days") return "month";
  return undefined;
}

export function normalizedCondition(value: string | undefined) {
  if (!value) return undefined;
  if (value === "New") return "new_with_tags||new_without_tags";
  if (value === "Used") return "used_excellent||used_good";
  if (value === "Like new") return "used_excellent";
  return value;
}

/** Bands are alternatives; an explicit maximum remains an additional constraint. */
export function mileageCeiling(search: Pick<Search, "mileageBands" | "mileageMax">) {
  const bands =
    search.mileageBands
      ?.split("||")
      .map(thresholdValue)
      .filter((value): value is number => value !== undefined) ?? [];
  const bandMaximum = bands.length ? Math.max(...bands) : undefined;
  return search.mileageMax === undefined
    ? bandMaximum
    : bandMaximum === undefined
      ? search.mileageMax
      : Math.min(search.mileageMax, bandMaximum);
}

export function inputFromSearch(search: Search): ClassifiedBrowseInput {
  // Landing pages have no location controls. Keep carried location in URL
  // state for results navigation, but never let it hide landing inventory.
  if (search.category === "firearms" && search.firearmMode !== "results") {
    search = {
      ...search,
      state: undefined,
      region: undefined,
      city: undefined,
      postalCode: undefined,
      radiusMiles: undefined,
      latitude: undefined,
      longitude: undefined,
    };
  }
  const hasExplicitVehicleLocation = Boolean(
    search.state ||
    search.region ||
    search.city ||
    search.postalCode ||
    search.latitude != null ||
    search.longitude != null,
  );
  const defaultVehicleLandingState =
    (search.group === "motors" || isMotorsCategory(search.category)) &&
    search.vehicleMode !== "results" &&
    !hasExplicitVehicleLocation
      ? "ID"
      : search.state;
  const selectedWindows = [search.jobPosted, search.jobTimeOnSite, search.serviceTimeOnSite].map(
    postedWindow,
  );
  const postedWithin = (["hour", "day", "week", "month"] as const).find((window) =>
    selectedWindows.includes(window),
  );
  return {
    dealerSlug: search.dealerSlug,
    q: search.q ?? search.homeLocation,
    searchDescriptions:
      search.category === "services" ? search.serviceExpandSearch === "true" : undefined,
    category: search.category,
    homeTab: search.homeTab,
    group: search.group,
    state: defaultVehicleLandingState,
    region: search.region,
    city: search.city,
    radiusMiles: search.radiusMiles,
    latitude: search.latitude,
    longitude: search.longitude,
    postalCode: search.postalCode,
    condition: search.condition ?? normalizedCondition(search.serviceCondition),
    fulfillment: search.fulfillment,
    priceMin: search.priceMin ?? optionalNonNegativeNumber(search.homePrice?.split("||")[0]),
    priceMax: search.priceMax ?? optionalNonNegativeNumber(search.homePrice?.split("||")[1]),
    make: search.make,
    model: search.model,
    yearMin: search.yearMin,
    yearMax: search.yearMax,
    mileageMax: mileageCeiling(search),
    bodyStyle: search.bodyStyle,
    transmission: search.transmission,
    drivetrain: search.drivetrain,
    fuelType: search.fuelType,
    exteriorColor: search.exteriorColor,
    titleStatus: search.titleStatus,
    homePropertyType: search.propertyType,
    homeBedroomsMin: thresholdValue(search.bedrooms),
    homeBedroomsMax: search.bedrooms === "Studio" ? 0 : undefined,
    homeBathroomsMin: thresholdValue(search.bathrooms),
    homeSquareFeetMin: thresholdValue(search.homeSquareFeet),
    homeYearBuiltMin: search.homeYearBuilt,
    homeAcresMin: thresholdValue(search.homeAcres),
    homeHeating: search.homeHeating,
    homeCooling: search.homeCooling,
    homeGarageParking: search.homeGarageParking,
    homeYard: search.homeYard,
    homeSchoolDistrict: search.homeSchoolDistrict,
    homeLeaseLength: search.leaseLength,
    homeAvailable: search.homeAvailable,
    homePetsPolicy: search.homePetsPolicy,
    homeSmokingPolicy: search.homeSmokingPolicy,
    jobCategory: search.jobCategory,
    jobEmployer: search.jobEmployer,
    jobEmploymentType: search.jobEmploymentType ?? search.jobType,
    jobPayType: search.jobPayType,
    jobPayMin: search.jobPayMin,
    jobPayMax: search.jobPayMax,
    jobExperience: search.jobExperience,
    jobEducation: search.jobEducation,
    serviceSubcategory: search.serviceSubcategory,
    serviceArea: search.serviceArea,
    serviceAvailability: search.serviceAvailability,
    serviceLicenseRequired: search.serviceLicenseRequired === "true" ? true : undefined,
    postedWithin,
    hasPhotos: search.jobPhotos === "true" || search.servicePhotos === "true",
    petSubcategory: search.petSubcategory,
    petSpecies: search.petSpecies,
    petBreed: search.petBreed,
    petPlacementType: search.petPlacementType,
    petOfferedBy: search.petOfferedBy,
    petSex: search.petSex,
    petAge: search.petAge,
    petHypoallergenic: search.petHypoallergenic,
    petVaccinated: search.petVaccinated,
    petSpayedNeutered: search.petSpayedNeutered,
    petMicrochipped: search.petMicrochipped,
    petRecordsAvailable: search.petRecordsAvailable,
    petGoodWithKids: search.petGoodWithKids,
    petGoodWithDogs: search.petGoodWithDogs,
    petGoodWithCats: search.petGoodWithCats,
    petIndoorOutdoor: search.petIndoorOutdoor,
    firearmListingType: search.firearmListingType,
    firearmType: search.firearmType,
    firearmBrand: search.firearmBrand,
    firearmAccessoryType: search.firearmAccessoryType,
    itemDetailKey: search.itemDetailKey,
    itemDetailValue: search.itemDetailValue,
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
  };
}

export function latestListingsInput(search: Search): ClassifiedBrowseInput {
  const input = inputFromSearch(search);
  return search.category === "firearms" && search.firearmMode !== "results"
    ? {
        ...input,
        firearmListingType: "Firearm",
        firearmType: undefined,
        firearmBrand: undefined,
        firearmAccessoryType: undefined,
        page: 1,
      }
    : input;
}

export const vehicleSearchKeys: readonly (keyof Search)[] = [
  "make",
  "model",
  "yearMin",
  "yearMax",
  "mileageMax",
  "mileageBands",
  "bodyStyle",
  "transmission",
  "drivetrain",
  "fuelType",
  "exteriorColor",
  "titleStatus",
];

export const petSearchKeys: readonly (keyof Search)[] = [
  "petMode",
  "petSubcategory",
  "petSpecies",
  "petBreed",
  "petPlacementType",
  "petOfferedBy",
  "petSex",
  "petAge",
  "petHypoallergenic",
  "petVaccinated",
  "petSpayedNeutered",
  "petMicrochipped",
  "petRecordsAvailable",
  "petGoodWithKids",
  "petGoodWithDogs",
  "petGoodWithCats",
  "petIndoorOutdoor",
];

export const firearmSearchKeys: readonly (keyof Search)[] = [
  "firearmMode",
  "firearmListingType",
  "firearmType",
  "firearmBrand",
  "firearmAccessoryType",
];

export const jobSearchKeys: readonly (keyof Search)[] = [
  "jobMode",
  "jobCategory",
  "jobEmployer",
  "jobEmploymentType",
  "jobType",
  "jobPayType",
  "jobPayMin",
  "jobPayMax",
  "jobExperience",
  "jobPosted",
  "jobEducation",
  "jobPhotos",
  "jobVideo",
  "jobTimeOnSite",
];

export const serviceSearchKeys: readonly (keyof Search)[] = [
  "serviceMode",
  "serviceSubcategory",
  "serviceExpandSearch",
  "servicePhotos",
  "serviceVideo",
  "serviceSellerType",
  "serviceCondition",
  "serviceTimeOnSite",
  "serviceArea",
  "serviceAvailability",
  "serviceLicenseRequired",
];

export const homeSearchKeys: readonly (keyof Search)[] = [
  "homeMode",
  "homeTab",
  "homeLocation",
  "homePrice",
  "propertyType",
  "bedrooms",
  "bathrooms",
  "homeSquareFeet",
  "homeBuilder",
  "constructionType",
  "homeAcres",
  "homeSellerType",
  "petsCats",
  "petsDogs",
  "homeAmenities",
  "communityAmenities",
  "leaseLength",
  "homeYearBuilt",
  "homeHeating",
  "homeCooling",
  "homeGarageParking",
  "homeYard",
  "homeSchoolDistrict",
  "homeAvailable",
  "homePetsPolicy",
  "homeSmokingPolicy",
];

export function normalizeBrowseSearch(search: Search): Search {
  const next = { ...search };
  const clear = (keys: readonly (keyof Search)[]) => {
    for (const key of keys) next[key] = undefined;
  };
  const motors = next.group === "motors" || isMotorsCategory(next.category);
  const pets = next.category === "pets";
  const jobs = next.category === "jobs";
  const services = next.category === "services";
  const homes = next.category === "other-real-estate";
  const firearms = next.category === "firearms";

  if (motors && next.itemDetailKey && next.itemDetailValue) next.vehicleMode = "results";
  if (!motors) clear(vehicleSearchKeys);
  if (!pets) clear(petSearchKeys);
  if (!jobs) clear(jobSearchKeys);
  if (!services) clear(serviceSearchKeys);
  if (!homes) clear(homeSearchKeys);
  if (!firearms) clear(firearmSearchKeys);

  if (pets) {
    if (
      next.petMode === undefined &&
      petSearchKeys.some((key) => key !== "petMode" && hasSearchValue(next[key]))
    ) {
      next.petMode = "results";
    }
    const species = normalizePetSpecies(next.petSpecies);
    const subcategory = normalizePetSubcategory(next.petSubcategory);
    next.petSpecies = species;
    next.petSubcategory = isPetSelectionCompatible(species, subcategory) ? subcategory : undefined;
    if (!next.petSubcategory) next.petBreed = undefined;
  }
  if (jobs) {
    // Older shared links used jobEmploymentType. Consume that alias into the
    // canonical jobType field so the constraint is never silently discarded.
    next.jobType = next.jobType ?? next.jobEmploymentType;
    next.jobEmploymentType = undefined;
  }
  if (firearms) {
    const hasFirearmFilter = firearmSearchKeys.some(
      (key) => key !== "firearmMode" && hasSearchValue(next[key]),
    );
    if (next.firearmMode === undefined && hasFirearmFilter) next.firearmMode = "results";
    if (next.firearmListingType === "Accessory") {
      next.firearmType = undefined;
    } else if (next.firearmListingType === "Firearm") {
      next.firearmAccessoryType = undefined;
    }
  }
  if (homes && next.homeTab === undefined) next.homeTab = "buy";
  return next;
}

/** Earlier saved records used domain names; display and edit them through the same URL fields. */
export function browseSearchAliases(input: Record<string, unknown>) {
  const search = { ...input };
  const scalar = (value: unknown) => ["string", "number", "boolean"].includes(typeof value);
  const aliases: Record<string, string[]> = {
    category: ["categorySlug", "section"],
    q: ["query", "keyword"],
    propertyType: ["homePropertyType"],
    homeYearBuilt: ["homeYearBuiltMin"],
    leaseLength: ["homeLeaseLength"],
    jobType: ["jobEmploymentType", "employmentType"],
    jobPayMin: ["jobSalaryMin"],
  };
  for (const [key, names] of Object.entries(aliases))
    if (search[key] === undefined) {
      const name = names.find((name) => search[name] !== undefined);
      if (name) search[key] = search[name];
    }
  for (const [key, old] of [
    ["bedrooms", "homeBedroomsMin"],
    ["bathrooms", "homeBathroomsMin"],
    ["homeSquareFeet", "homeSquareFeetMin"],
    ["homeAcres", "homeAcresMin"],
  ])
    if (search[key] === undefined && search[old] !== undefined && scalar(search[old]))
      search[key] = String(search[old]) + "+";
  if (
    search.bedrooms === undefined &&
    scalar(search.homeBedroomsMax) &&
    Number(search.homeBedroomsMax) === 0 &&
    search.homeBedroomsMax !== undefined
  )
    search.bedrooms = "Studio";
  for (const [key, old] of [
    ["priceMin", "minPrice"],
    ["priceMax", "maxPrice"],
  ])
    if (search[key] === undefined && search[old] !== undefined && scalar(search[old]))
      search[key] = String(search[old]).replace(/[$,]/g, "");
  if (
    search.homeTab === undefined &&
    typeof search.homeMode === "string" &&
    ["buy", "rent", "build"].includes(search.homeMode)
  )
    search.homeTab = search.homeMode;
  for (const key of ["serviceLicenseRequired", "jobPhotos", "servicePhotos", "serviceExpandSearch"])
    if (typeof search[key] === "boolean") search[key] = String(search[key]);
  if (search.serviceExpandSearch === undefined && typeof search.searchDescriptions === "boolean")
    search.serviceExpandSearch = String(search.searchDescriptions);
  return search;
}

export function parseBrowseSearch(
  search: Record<string, unknown>,
  options: { normalizeCategory?: boolean } = {},
): Search {
  search = browseSearchAliases(search);
  const group = stringParam(search, "group", 20);
  const sort = stringParam(search, "sort", 20);
  const view = stringParam(search, "view", 10);
  const homeMode = stringParam(search, "homeMode", 10);
  const homeTab = stringParam(search, "homeTab", 10);
  const jobMode = stringParam(search, "jobMode", 10);
  const serviceMode = stringParam(search, "serviceMode", 10);
  const vehicleMode = stringParam(search, "vehicleMode", 10);
  const petMode = stringParam(search, "petMode", 10);
  const firearmMode = stringParam(search, "firearmMode", 10);
  const firearmListingType = stringParam(search, "firearmListingType", 30);
  const firearmType = stringParam(search, "firearmType", 60);
  const firearmBrand = stringParam(search, "firearmBrand", 80);
  const firearmAccessoryType = stringParam(search, "firearmAccessoryType", 80);
  const category = stringParam(search, "category", 60);
  const savedSearchId = stringParam(search, "savedSearchId", 64);
  const page = normalizeBrowsePage(search["page"]);
  const parsed: Search = {
    // Undefined rather than false when absent: a false value gets written
    // back into the URL, which redirected every category link once.
    allCategories:
      search["allCategories"] === true || stringParam(search, "allCategories", 5) === "true"
        ? true
        : undefined,
    dealerSlug: stringParam(search, "dealerSlug", 80),
    q: stringParam(search, "q"),
    savedSearchId,
    category,
    group: group === "motors" || group === "classifieds" ? group : undefined,
    state: stringParam(search, "state", 2)?.toUpperCase(),
    region: stringParam(search, "region"),
    city: stringParam(search, "city"),
    radiusMiles: integerParam(search, "radiusMiles"),
    latitude: coordinateParam(search, "latitude"),
    longitude: coordinateParam(search, "longitude"),
    postalCode: stringParam(search, "postalCode", 12),
    condition: stringParam(search, "condition", 120),
    fulfillment: stringParam(search, "fulfillment", 20),
    priceMin: numberParam(search, "priceMin"),
    priceMax: numberParam(search, "priceMax"),
    make: stringParam(search, "make"),
    model: stringParam(search, "model"),
    yearMin: integerParam(search, "yearMin"),
    yearMax: integerParam(search, "yearMax"),
    mileageMax: integerParam(search, "mileageMax"),
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
    homeTab:
      homeTab === "build" || homeTab === "rent" ? homeTab : homeTab === "buy" ? "buy" : undefined,
    jobMode: jobMode === "results" ? "results" : jobMode === "landing" ? "landing" : undefined,
    serviceMode:
      serviceMode === "results" ? "results" : serviceMode === "landing" ? "landing" : undefined,
    vehicleMode:
      vehicleMode === "results" ? "results" : vehicleMode === "landing" ? "landing" : undefined,
    petMode: petMode === "results" ? "results" : petMode === "landing" ? "landing" : undefined,
    firearmMode:
      category === "firearms"
        ? firearmMode === "results"
          ? "results"
          : firearmMode === "landing"
            ? "landing"
            : undefined
        : undefined,
    firearmListingType: firearmListingTypes.includes(firearmListingType as never)
      ? firearmListingType
      : undefined,
    firearmType: firearmTypes.includes(firearmType as never) ? firearmType : undefined,
    firearmBrand: firearmBrands.includes(firearmBrand as never) ? firearmBrand : undefined,
    firearmAccessoryType: firearmAccessoryTypes.includes(firearmAccessoryType as never)
      ? firearmAccessoryType
      : undefined,
    sellerType: stringParam(search, "sellerType", 30),
    mileageBands: stringParam(search, "mileageBands", 300),
    serviceSubcategory: stringParam(search, "serviceSubcategory", 80),
    serviceExpandSearch: stringParam(search, "serviceExpandSearch", 10),
    servicePhotos: stringParam(search, "servicePhotos", 10),
    serviceVideo: stringParam(search, "serviceVideo", 10),
    serviceSellerType: stringParam(search, "serviceSellerType", 30),
    serviceCondition: stringParam(search, "serviceCondition", 30),
    serviceTimeOnSite: stringParam(search, "serviceTimeOnSite", 30),
    serviceArea: stringParam(search, "serviceArea", 200),
    serviceAvailability: stringParam(search, "serviceAvailability", 120),
    serviceLicenseRequired: stringParam(search, "serviceLicenseRequired", 10),
    jobCategory: stringParam(search, "jobCategory", 60),
    jobEmployer: stringParam(search, "jobEmployer", 120),
    jobEmploymentType: undefined,
    jobType:
      normalizeMultiSelect(
        stringParam(search, "jobType", 40) ?? stringParam(search, "jobEmploymentType", 40),
      ) || undefined,
    jobPayType: stringParam(search, "jobPayType", 30),
    jobPayMin: numberParam(search, "jobPayMin"),
    jobPayMax: numberParam(search, "jobPayMax"),
    jobExperience: stringParam(search, "jobExperience", 30),
    jobPosted: stringParam(search, "jobPosted", 30),
    jobEducation: stringParam(search, "jobEducation", 30),
    jobPhotos: stringParam(search, "jobPhotos", 10),
    jobVideo: stringParam(search, "jobVideo", 10),
    jobTimeOnSite: stringParam(search, "jobTimeOnSite", 30),
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
    homeAmenities: stringParam(search, "homeAmenities", 600),
    communityAmenities: stringParam(search, "communityAmenities", 800),
    leaseLength: stringParam(search, "leaseLength", 30),
    homeYearBuilt: integerParam(search, "homeYearBuilt"),
    homeHeating: stringParam(search, "homeHeating", 80),
    homeCooling: stringParam(search, "homeCooling", 80),
    homeGarageParking: stringParam(search, "homeGarageParking", 120),
    homeYard: stringParam(search, "homeYard", 120),
    homeSchoolDistrict: stringParam(search, "homeSchoolDistrict", 120),
    homeAvailable: stringParam(search, "homeAvailable", 60),
    homePetsPolicy: stringParam(search, "homePetsPolicy", 120),
    homeSmokingPolicy: stringParam(search, "homeSmokingPolicy", 60),
    petSubcategory: normalizePetSubcategory(stringParam(search, "petSubcategory", 80)),
    petSpecies: normalizePetSpecies(stringParam(search, "petSpecies", 40)),
    petBreed: stringParam(search, "petBreed", 100),
    petPlacementType: stringParam(search, "petPlacementType", 30),
    petOfferedBy: stringParam(search, "petOfferedBy", 30),
    petSex: stringParam(search, "petSex", 30),
    petAge: stringParam(search, "petAge", 60),
    petHypoallergenic: stringParam(search, "petHypoallergenic", 20),
    petVaccinated: stringParam(search, "petVaccinated", 20),
    petSpayedNeutered: stringParam(search, "petSpayedNeutered", 20),
    petMicrochipped: stringParam(search, "petMicrochipped", 20),
    petRecordsAvailable: stringParam(search, "petRecordsAvailable", 20),
    petGoodWithKids: stringParam(search, "petGoodWithKids", 20),
    petGoodWithDogs: stringParam(search, "petGoodWithDogs", 20),
    petGoodWithCats: stringParam(search, "petGoodWithCats", 20),
    petIndoorOutdoor: stringParam(search, "petIndoorOutdoor", 30),
    itemDetailKey: stringParam(search, "itemDetailKey", 60),
    itemDetailValue: stringParam(search, "itemDetailValue", 200),
  };
  return options.normalizeCategory === false ? parsed : normalizeBrowseSearch(parsed);
}
