import type { Search } from "./browse-search.ts";
import { classifiedCategories, usStates, nearestClassifiedCity } from "../config/classifieds.ts";
import { fieldsForClassifiedItem } from "../config/classified-item-fields.ts";
import { formatSavedSearchFilter } from "./classifieds-display.ts";
import { petSubcategories, petSpecies, petPlacementTypes, petOfferedBy } from "../config/pets.ts";
export function countActiveFilters(
  search: Search,
  motors: boolean,
  pets: boolean,
  firearms: boolean,
) {
  const keys: (keyof Search)[] = [
    "category",
    "group",
    "state",
    "region",
    "city",
    "radiusMiles",
    "postalCode",
    "condition",
    "fulfillment",
    "priceMin",
    "priceMax",
  ];
  if (motors)
    keys.push(
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
    );
  if (pets)
    keys.push(
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
    );
  if (firearms)
    keys.push("firearmListingType", "firearmType", "firearmBrand", "firearmAccessoryType");
  const detailCount = search.itemDetailKey && search.itemDetailValue ? 1 : 0;
  return keys.filter((key) => search[key] !== undefined && search[key] !== "").length + detailCount;
}

export function activeFilterLabels(
  search: Search,
  motors: boolean,
  pets: boolean,
  firearms: boolean,
) {
  const labels: string[] = [];
  if (search.category)
    labels.push(
      classifiedCategories.find((category) => category.slug === search.category)?.name ??
        search.category,
    );
  if (search.group === "motors" && !search.category) labels.push("Vehicles");
  if (search.region) labels.push(`Region · ${search.region}`);
  if (search.state) {
    const stateName = usStates.find(([code]) => code === search.state)?.[1];
    labels.push(`State · ${stateName ?? search.state}`);
  }
  if (search.latitude != null && search.longitude != null && search.radiusMiles != null) {
    const nearest = nearestClassifiedCity(search.latitude, search.longitude);
    labels.push(`${nearest?.city ?? "Map point"} · within ${search.radiusMiles} miles`);
  } else if (search.city && search.radiusMiles != null)
    labels.push(`${search.city} · within ${search.radiusMiles} miles`);
  else if (search.city) labels.push(`City · ${search.city}`);
  if (search.postalCode) labels.push(`ZIP · ${search.postalCode}`);
  if (search.itemDetailKey && search.itemDetailValue) {
    const field = fieldsForClassifiedItem(search.category ?? "general").find(
      (entry) => entry.key === search.itemDetailKey,
    );
    labels.push(`${field?.label ?? "Subcategory"} · ${search.itemDetailValue}`);
  }
  if (search.condition) labels.push(formatSavedSearchFilter("condition", search.condition));
  if (search.fulfillment) labels.push(formatSavedSearchFilter("fulfillment", search.fulfillment));
  if (search.priceMin != null || search.priceMax != null)
    labels.push(
      search.priceMin != null && search.priceMax != null
        ? `$${search.priceMin}–$${search.priceMax}`
        : search.priceMin != null
          ? `$${search.priceMin}+`
          : `Up to $${search.priceMax}`,
    );
  if (motors) {
    if (search.make) labels.push(formatSavedSearchFilter("make", search.make));
    if (search.model) labels.push(formatSavedSearchFilter("model", search.model));
    if (search.yearMin != null || search.yearMax != null)
      labels.push(`${search.yearMin ?? "Any"}–${search.yearMax ?? "Any"}`);
    if (search.bodyStyle) labels.push(formatSavedSearchFilter("bodyStyle", search.bodyStyle));
    if (search.titleStatus) labels.push(formatSavedSearchFilter("titleStatus", search.titleStatus));
    if (search.transmission)
      labels.push(formatSavedSearchFilter("transmission", search.transmission));
    if (search.drivetrain) labels.push(formatSavedSearchFilter("drivetrain", search.drivetrain));
    if (search.fuelType) labels.push(formatSavedSearchFilter("fuelType", search.fuelType));
    if (search.exteriorColor)
      labels.push(formatSavedSearchFilter("exteriorColor", search.exteriorColor));
    if (search.mileageMax != null) labels.push(`≤ ${search.mileageMax.toLocaleString()} mi`);
  }
  if (pets) {
    if (search.petSubcategory)
      labels.push(
        petSubcategories.find(([slug]) => slug === search.petSubcategory)?.[1] ??
          search.petSubcategory,
      );
    if (search.petSpecies) labels.push(formatSavedSearchFilter("petSpecies", search.petSpecies));
    if (search.petBreed) labels.push(search.petBreed);
    if (search.petPlacementType)
      labels.push(
        petPlacementTypes.find(([value]) => value === search.petPlacementType)?.[1] ??
          search.petPlacementType,
      );
    if (search.petOfferedBy) labels.push(search.petOfferedBy);
    if (search.petSex) labels.push(search.petSex);
    if (search.petAge) labels.push(search.petAge);
    if (search.petHypoallergenic === "Yes") labels.push("Hypoallergenic");
    if (search.petVaccinated === "Yes") labels.push("Vaccinated");
    if (search.petSpayedNeutered === "Yes") labels.push("Spayed / neutered");
    if (search.petMicrochipped === "Yes") labels.push("Microchipped");
    if (search.petGoodWithKids === "Yes") labels.push("Good with children");
    if (search.petGoodWithDogs === "Yes") labels.push("Good with dogs");
    if (search.petGoodWithCats === "Yes") labels.push("Good with cats");
  }
  if (firearms) {
    if (search.firearmListingType) labels.push(search.firearmListingType);
    if (search.firearmType) labels.push(search.firearmType);
    if (search.firearmBrand) labels.push(search.firearmBrand);
    if (search.firearmAccessoryType) labels.push(search.firearmAccessoryType);
  }
  return labels;
}
