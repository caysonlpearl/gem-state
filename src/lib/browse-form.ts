import type { Search } from "./browse-search.ts";
import { optionalNonNegativeNumber, optionalNonNegativeInteger } from "./classifieds-query.ts";
import { isMotorsCategory } from "./classifieds-display.ts";
import { classifiedCategories } from "../config/classifieds.ts";
import { fieldsForClassifiedItem } from "../config/classified-item-fields.ts";
import {
  normalizePetSpecies,
  normalizePetSubcategory,
  isPetSelectionCompatible,
} from "../config/pets.ts";
const isPostalCode = (value: string) => /^\d{5}(?:-\d{4})?$/.test(value.trim());
const itemCategorySlugs = new Set<string>(
  classifiedCategories
    .filter(
      (category) =>
        (category.group === "classifieds" || category.group === "motors") &&
        !["other-real-estate", "jobs", "services", "pets"].includes(category.slug),
    )
    .map((category) => category.slug),
);
export function browseSearchPatchFromForm(search: Search, form: HTMLFormElement): Partial<Search> {
  const values = new FormData(form);
  const value = (key: string) => {
    const raw = values.get(key);
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  };
  const numeric = (key: string) => {
    return optionalNonNegativeNumber(value(key));
  };
  const coordinate = (key: string) => {
    const raw = value(key);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const category = value("category");
  const nextMotors = value("group") === "motors" || isMotorsCategory(category);
  const nextPets = category === "pets";
  const nextFirearms = category === "firearms";
  const nextPetSpecies = nextPets ? normalizePetSpecies(value("petSpecies")) : undefined;
  const nextPetSubcategory = nextPets
    ? normalizePetSubcategory(value("petSubcategory"))
    : undefined;
  const compatiblePetSubcategory = isPetSelectionCompatible(nextPetSpecies, nextPetSubcategory)
    ? nextPetSubcategory
    : undefined;

  return {
    category,
    vehicleMode: nextMotors ? "results" : undefined,
    homeMode: category === "other-real-estate" ? "results" : undefined,
    jobMode: category === "jobs" ? "results" : undefined,
    serviceMode: category === "services" ? "results" : undefined,
    group: category ? undefined : value("group") === "motors" ? "motors" : undefined,
    state: value("state")?.toUpperCase(),
    region: value("region"),
    city: isPostalCode(value("city") ?? "") ? undefined : value("city"),
    postalCode: isPostalCode(value("city") ?? "") ? value("city") : undefined,
    radiusMiles: isPostalCode(value("city") ?? "")
      ? undefined
      : optionalNonNegativeInteger(value("radiusMiles")),
    latitude: coordinate("latitude"),
    longitude: coordinate("longitude"),
    condition: value("condition"),
    fulfillment: value("fulfillment"),
    priceMin: numeric("priceMin"),
    priceMax: numeric("priceMax"),
    make: nextMotors ? value("make") : undefined,
    model: nextMotors ? value("model") : undefined,
    yearMin: nextMotors ? optionalNonNegativeInteger(value("yearMin")) : undefined,
    yearMax: nextMotors ? optionalNonNegativeInteger(value("yearMax")) : undefined,
    mileageMax: nextMotors ? optionalNonNegativeInteger(value("mileageMax")) : undefined,
    bodyStyle: nextMotors ? value("bodyStyle") : undefined,
    transmission: nextMotors ? value("transmission") : undefined,
    drivetrain: nextMotors ? value("drivetrain") : undefined,
    fuelType: nextMotors ? value("fuelType") : undefined,
    exteriorColor: nextMotors ? value("exteriorColor") : undefined,
    titleStatus: nextMotors ? value("titleStatus") : undefined,
    petMode: nextPets ? "results" : undefined,
    firearmMode: nextFirearms ? "results" : undefined,
    petSubcategory: compatiblePetSubcategory,
    petSpecies: nextPetSpecies,
    petBreed: nextPets && compatiblePetSubcategory ? value("petBreed") : undefined,
    petPlacementType: nextPets ? value("petPlacementType") : undefined,
    petOfferedBy: nextPets ? value("petOfferedBy") : undefined,
    petSex: nextPets ? value("petSex") : undefined,
    petAge: nextPets ? value("petAge") : undefined,
    petHypoallergenic: nextPets ? value("petHypoallergenic") : undefined,
    petVaccinated: nextPets ? value("petVaccinated") : undefined,
    petSpayedNeutered: nextPets ? value("petSpayedNeutered") : undefined,
    petMicrochipped: nextPets ? value("petMicrochipped") : undefined,
    petRecordsAvailable: nextPets ? value("petRecordsAvailable") : undefined,
    petGoodWithKids: nextPets ? value("petGoodWithKids") : undefined,
    petGoodWithDogs: nextPets ? value("petGoodWithDogs") : undefined,
    petGoodWithCats: nextPets ? value("petGoodWithCats") : undefined,
    petIndoorOutdoor: nextPets ? value("petIndoorOutdoor") : undefined,
    firearmListingType: nextFirearms ? value("firearmListingType") : undefined,
    firearmType:
      nextFirearms && value("firearmListingType") !== "Accessory"
        ? value("firearmType")
        : undefined,
    firearmBrand: nextFirearms ? value("firearmBrand") : undefined,
    firearmAccessoryType:
      nextFirearms && value("firearmListingType") !== "Firearm"
        ? value("firearmAccessoryType")
        : undefined,
    itemDetailKey:
      category === search.category && category && itemCategorySlugs.has(category) && !nextFirearms
        ? value("itemDetailKey")
        : undefined,
    itemDetailValue:
      category === search.category && category && itemCategorySlugs.has(category) && !nextFirearms
        ? value("itemDetailValue")
        : undefined,
  };
}
