/** Shared website/app browse input validation; no server or provider adapters. */
import { normalizeBrowsePage } from "./classifieds-pagination.ts";
import { optionalNonNegativeNumber, optionalNonNegativeInteger } from "./classifieds-query.ts";
import { normalizePetSpecies, normalizePetSubcategory } from "../config/pets.ts";
import {
  firearmAccessoryTypes,
  firearmBrands,
  firearmListingTypes,
  firearmTypes,
} from "../config/classified-item-fields.ts";

export const conditionValues = [
  "new_with_tags",
  "new_without_tags",
  "used_excellent",
  "used_good",
  "broken_needs_repairs",
  "not_applicable",
] as const;

export type ClassifiedBrowseInput = {
  /** Store-client catalog boundary; normal website inventory is unaffected. */
  mobileCatalog?: boolean;
  /** Internal homepage read: keep the full mock catalog available for curation. */
  includeAllMocks?: boolean | undefined;
  q?: string | undefined;
  category?: string | undefined;
  homeTab?: "buy" | "rent" | "build" | undefined;
  homePropertyType?: string | undefined;
  homeBedroomsMin?: number | undefined;
  homeBathroomsMin?: number | undefined;
  homeSquareFeetMin?: number | undefined;
  homeYearBuiltMin?: number | undefined;
  homeAcresMin?: number | undefined;
  homeHeating?: string | undefined;
  homeCooling?: string | undefined;
  homeGarageParking?: string | undefined;
  homeYard?: string | undefined;
  homeSchoolDistrict?: string | undefined;
  homeLeaseLength?: string | undefined;
  homeAvailable?: string | undefined;
  homePetsPolicy?: string | undefined;
  homeSmokingPolicy?: string | undefined;
  jobCategory?: string | undefined;
  jobEmployer?: string | undefined;
  jobPayType?: string | undefined;
  jobEmploymentType?: string | undefined;
  jobPayMin?: number | undefined;
  jobPayMax?: number | undefined;
  jobExperience?: string | undefined;
  jobEducation?: string | undefined;
  serviceSubcategory?: string | undefined;
  serviceArea?: string | undefined;
  serviceAvailability?: string | undefined;
  serviceLicenseRequired?: boolean | undefined;
  postedWithin?: "hour" | "day" | "week" | "month" | undefined;
  hasPhotos?: boolean | undefined;
  group?: string | undefined;
  region?: string | undefined;
  state?: string | undefined;
  city?: string | undefined;
  radiusMiles?: number | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  postalCode?: string | undefined;
  sellerSlug?: string | undefined;
  dealerSlug?: string | undefined;
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
  firearmListingType?: string | undefined;
  firearmType?: string | undefined;
  firearmBrand?: string | undefined;
  firearmAccessoryType?: string | undefined;
  itemDetailKey?: string | undefined;
  itemDetailValue?: string | undefined;
  sort?: "newest" | "price_low" | "price_high" | "mileage_low" | undefined;
  page?: number | undefined;
};

export const text = (value: unknown, max = 80) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
export const filterValues = (value: string | undefined) =>
  value
    ?.split(/\|{1,2}/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
export const num = (value: unknown) => {
  return optionalNonNegativeNumber(value);
};
export const integerNum = (value: unknown) => {
  return optionalNonNegativeInteger(value);
};
export const listedValue = (value: unknown, options: readonly string[], max = 80) => {
  const parsed = text(value, max);
  return parsed && options.includes(parsed) ? parsed : undefined;
};

export const normalizeClassifiedBrowseInput = (
  input: ClassifiedBrowseInput,
): ClassifiedBrowseInput => ({
  mobileCatalog: input?.mobileCatalog === true,
  q: text(input?.q),
  category: text(input?.category, 60),
  homeTab:
    input?.homeTab === "buy" || input?.homeTab === "rent" || input?.homeTab === "build"
      ? input.homeTab
      : undefined,
  homePropertyType: text(input?.homePropertyType, 120),
  homeBedroomsMin: num(input?.homeBedroomsMin),
  homeBathroomsMin: num(input?.homeBathroomsMin),
  homeSquareFeetMin: num(input?.homeSquareFeetMin),
  homeYearBuiltMin: integerNum(input?.homeYearBuiltMin),
  homeAcresMin: num(input?.homeAcresMin),
  homeHeating: text(input?.homeHeating, 80),
  homeCooling: text(input?.homeCooling, 80),
  homeGarageParking: text(input?.homeGarageParking, 120),
  homeYard: text(input?.homeYard, 120),
  homeSchoolDistrict: text(input?.homeSchoolDistrict, 120),
  homeLeaseLength: text(input?.homeLeaseLength, 60),
  homeAvailable: text(input?.homeAvailable, 60),
  homePetsPolicy: text(input?.homePetsPolicy, 120),
  homeSmokingPolicy: text(input?.homeSmokingPolicy, 60),
  jobCategory: text(input?.jobCategory, 80),
  jobEmployer: text(input?.jobEmployer, 120),
  jobPayType: text(input?.jobPayType, 80),
  jobEmploymentType: text(input?.jobEmploymentType, 120),
  jobPayMin: num(input?.jobPayMin),
  jobPayMax: num(input?.jobPayMax),
  jobExperience: text(input?.jobExperience, 80),
  jobEducation: text(input?.jobEducation, 80),
  serviceSubcategory: text(input?.serviceSubcategory, 100),
  serviceArea: text(input?.serviceArea, 200),
  serviceAvailability: text(input?.serviceAvailability, 120),
  serviceLicenseRequired: input?.serviceLicenseRequired === true ? true : undefined,
  postedWithin: ["hour", "day", "week", "month"].includes(input?.postedWithin as never)
    ? input.postedWithin
    : undefined,
  hasPhotos: input?.hasPhotos === true ? true : undefined,
  group: text(input?.group, 20),
  region: text(input?.region),
  state: text(input?.state, 2)?.toUpperCase(),
  city: text(input?.city),
  radiusMiles:
    input?.radiusMiles == null
      ? undefined
      : Math.min(500, Math.max(1, Math.round(Number(input.radiusMiles)))) || undefined,
  latitude:
    input?.latitude == null || !Number.isFinite(Number(input.latitude))
      ? undefined
      : Math.max(-90, Math.min(90, Number(input.latitude))),
  longitude:
    input?.longitude == null || !Number.isFinite(Number(input.longitude))
      ? undefined
      : Math.max(-180, Math.min(180, Number(input.longitude))),
  postalCode: text(input?.postalCode, 12)?.replace(/[^0-9-]/g, ""),
  sellerSlug: text(input?.sellerSlug, 60),
  dealerSlug: text(input?.dealerSlug, 80),
  condition:
    filterValues(text(input?.condition, 120))
      .filter((value) => conditionValues.includes(value as never))
      .join("||") || undefined,
  fulfillment: text(input?.fulfillment, 20),
  priceMin: num(input?.priceMin),
  priceMax: num(input?.priceMax),
  make: text(input?.make),
  model: text(input?.model),
  yearMin: integerNum(input?.yearMin),
  yearMax: integerNum(input?.yearMax),
  mileageMax: integerNum(input?.mileageMax),
  bodyStyle: text(input?.bodyStyle, 30),
  transmission: text(input?.transmission, 30),
  drivetrain: text(input?.drivetrain, 20),
  fuelType: text(input?.fuelType, 30),
  exteriorColor: text(input?.exteriorColor, 30),
  titleStatus: text(input?.titleStatus, 30),
  petSubcategory: normalizePetSubcategory(text(input?.petSubcategory, 80)),
  petSpecies: normalizePetSpecies(text(input?.petSpecies, 40)),
  petBreed: text(input?.petBreed, 100),
  petPlacementType: text(input?.petPlacementType, 30),
  petOfferedBy: text(input?.petOfferedBy, 30),
  petSex: text(input?.petSex, 30),
  petAge: text(input?.petAge, 60),
  petHypoallergenic: text(input?.petHypoallergenic, 20),
  petVaccinated: text(input?.petVaccinated, 20),
  petSpayedNeutered: text(input?.petSpayedNeutered, 20),
  petMicrochipped: text(input?.petMicrochipped, 20),
  petRecordsAvailable: text(input?.petRecordsAvailable, 20),
  petGoodWithKids: text(input?.petGoodWithKids, 20),
  petGoodWithDogs: text(input?.petGoodWithDogs, 20),
  petGoodWithCats: text(input?.petGoodWithCats, 20),
  petIndoorOutdoor: text(input?.petIndoorOutdoor, 30),
  firearmListingType: listedValue(input?.firearmListingType, firearmListingTypes, 30),
  firearmType: listedValue(input?.firearmType, firearmTypes, 60),
  firearmBrand: listedValue(input?.firearmBrand, firearmBrands, 80),
  firearmAccessoryType: listedValue(input?.firearmAccessoryType, firearmAccessoryTypes, 80),
  itemDetailKey: text(input?.itemDetailKey, 60),
  itemDetailValue: text(input?.itemDetailValue, 200),
  sort: (["newest", "price_low", "price_high", "mileage_low"] as const).includes(
    input?.sort as never,
  )
    ? input.sort
    : "newest",
  page: normalizeBrowsePage(input?.page),
});
