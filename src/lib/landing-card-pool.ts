import type { ClassifiedBrowseInput } from "./classifieds.functions";
import type { ListingCardSummary } from "./listing-card-summary";
import {
  classifiedCategories,
  hasClassifiedRadiusCenter,
  isWithinClassifiedRadius,
} from "../config/classifieds.ts";
import { normalizePetSpecies, normalizePetSubcategory } from "../config/pets.ts";
import { comparableJobPay, matchesLeaseLength } from "./classifieds-query.ts";
import { regionOfListing } from "./market-stats.ts";

const filterValues = (value: string) =>
  value
    .split("||")
    .map((v) => v.trim())
    .filter(Boolean);
function postedSince(value: ClassifiedBrowseInput["postedWithin"]) {
  if (!value) return undefined;
  const hours = { hour: 1, day: 24, week: 168, month: 720 }[value];
  return new Date(Date.now() - hours * 3600000).toISOString();
}
function matchesVehicleStyle(selected: string, actual: string | null | undefined) {
  const styles: Record<string, string[]> = {
    truck: ["truck", "pickup", "pickup truck"],
    suv: ["suv", "crossover"],
    minivan: ["minivan", "mini mpv"],
    car: ["car", "sedan", "coupe", "hatchback", "wagon", "convertible", "targa"],
  };
  return (styles[selected.toLowerCase()] ?? [selected.toLowerCase()]).includes(
    (actual ?? "").toLowerCase(),
  );
}

/** Filter saved public card data; missing evidence cannot satisfy a strict filter. */
export function matchesLandingCard(listing: ListingCardSummary, data: ClassifiedBrowseInput) {
  if (
    data.group === "motors" &&
    !classifiedCategories.some((c) => c.slug === listing.categorySlug && c.group === "motors")
  )
    return false;
  if (data.group === "classifieds" && listing.vehicle) return false;
  if (data.category && data.category !== listing.categorySlug) return false;
  if (data.category === "other-real-estate" && data.homeTab && listing.home?.mode !== data.homeTab)
    return false;
  if (
    data.group === "classifieds" &&
    !classifiedCategories.some(
      (item) => item.slug === listing.categorySlug && item.group === "classifieds",
    )
  )
    return false;
  if (data.region && regionOfListing(listing) !== data.region) return false;
  if (data.q) {
    const needle = data.q.toLowerCase();
    if (
      !`${listing.title} ${listing.job?.jobSummary ?? ""} ${listing.job?.employerName ?? ""} ${listing.service?.serviceSummary ?? ""}`
        .toLowerCase()
        .includes(needle)
    )
      return false;
  }
  if (data.state && !hasClassifiedRadiusCenter(data) && data.state !== listing.state) return false;
  if (data.postalCode && !(listing.postalCode ?? "").startsWith(data.postalCode)) return false;
  if (
    data.city &&
    !data.radiusMiles &&
    !listing.city.toLowerCase().includes(data.city.toLowerCase())
  )
    return false;
  if (
    (data.city || (data.latitude != null && data.longitude != null)) &&
    data.radiusMiles != null &&
    !isWithinClassifiedRadius({
      city: data.city,
      cityState: data.state,
      listingCity: listing.city,
      listingState: listing.state,
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMiles: data.radiusMiles,
    })
  )
    return false;
  if (data.sellerSlug || data.dealerSlug) return false;
  if (data.condition && !filterValues(data.condition).includes(listing.condition)) return false;
  if (
    data.fulfillment &&
    !filterValues(data.fulfillment).some(
      (value) =>
        value === listing.fulfillmentMode ||
        (value !== "both" && listing.fulfillmentMode === "both"),
    )
  )
    return false;
  if (
    listing.categorySlug === "services" &&
    listing.priceCents <= 0 &&
    (data.priceMin != null || data.priceMax != null)
  )
    return false;
  if (data.priceMin != null && listing.priceCents < data.priceMin * 100) return false;
  if (data.priceMax != null && listing.priceCents > data.priceMax * 100) return false;
  if (
    data.itemDetailKey &&
    data.itemDetailValue &&
    !(listing as { itemDetails?: Record<string, string> }).itemDetails?.[data.itemDetailKey]
      ?.toLowerCase()
      .includes(data.itemDetailValue.toLowerCase())
  )
    return false;
  const firearmDetails = (listing as { itemDetails?: Record<string, string> }).itemDetails;
  for (const [filter, key] of [
    [data.firearmListingType, "listingType"],
    [data.firearmType, "firearmType"],
    [data.firearmBrand, "brand"],
    [data.firearmAccessoryType, "accessoryType"],
  ] as const) {
    if (filter && firearmDetails?.[key]?.toLowerCase() !== filter.toLowerCase()) return false;
  }
  if (data.make && !filterValues(data.make).includes(listing.vehicle?.make ?? "")) return false;
  if (data.model && !filterValues(data.model).includes(listing.vehicle?.model ?? "")) return false;
  if (data.yearMin != null && (listing.vehicle?.year ?? -1) < data.yearMin) return false;
  if (
    data.yearMax != null &&
    (listing.vehicle?.year == null || listing.vehicle.year > data.yearMax)
  )
    return false;
  if (
    data.mileageMax != null &&
    (listing.vehicle?.mileage ?? Number.POSITIVE_INFINITY) > data.mileageMax
  )
    return false;
  if (
    data.bodyStyle &&
    !filterValues(data.bodyStyle).some((value) =>
      matchesVehicleStyle(value, listing.vehicle?.bodyStyle),
    )
  )
    return false;
  if (
    data.transmission &&
    !filterValues(data.transmission).includes(listing.vehicle?.transmission ?? "")
  )
    return false;
  if (data.drivetrain && !filterValues(data.drivetrain).includes(listing.vehicle?.drivetrain ?? ""))
    return false;
  if (data.fuelType && !filterValues(data.fuelType).includes(listing.vehicle?.fuelType ?? ""))
    return false;
  if (
    data.exteriorColor &&
    !filterValues(data.exteriorColor).includes(listing.vehicle?.exteriorColor ?? "")
  )
    return false;
  if (
    data.titleStatus &&
    !filterValues(data.titleStatus).includes(listing.vehicle?.titleStatus ?? "")
  )
    return false;
  if (
    data.homePropertyType &&
    !filterValues(data.homePropertyType).includes(listing.home?.propertyType ?? "")
  )
    return false;
  if (data.homeBedroomsMin != null && (listing.home?.bedrooms ?? -1) < data.homeBedroomsMin)
    return false;
  if (data.homeBathroomsMin != null && (listing.home?.bathrooms ?? -1) < data.homeBathroomsMin)
    return false;
  if (data.homeSquareFeetMin != null && (listing.home?.squareFeet ?? -1) < data.homeSquareFeetMin)
    return false;
  if (data.homeYearBuiltMin != null && (listing.home?.yearBuilt ?? -1) < data.homeYearBuiltMin)
    return false;
  const matchesAnyText = (actual: string | null | undefined, value: string | undefined) =>
    !value ||
    filterValues(value).some((item) => actual?.toLowerCase().includes(item.toLowerCase()));
  if (!matchesAnyText(listing.home?.heating, data.homeHeating)) return false;
  if (!matchesAnyText(listing.home?.cooling, data.homeCooling)) return false;
  if (!matchesAnyText(listing.home?.garageParking, data.homeGarageParking)) return false;
  if (!matchesAnyText(listing.home?.yard, data.homeYard)) return false;
  if (!matchesAnyText(listing.home?.schoolDistrict, data.homeSchoolDistrict)) return false;
  if (
    data.homeLeaseLength &&
    !filterValues(data.homeLeaseLength).some((item) =>
      matchesLeaseLength(listing.home?.leaseLength, item),
    )
  )
    return false;
  if (!matchesAnyText(listing.home?.available, data.homeAvailable)) return false;
  if (!matchesAnyText(listing.home?.pets, data.homePetsPolicy)) return false;
  if (!matchesAnyText(listing.home?.smoking, data.homeSmokingPolicy)) return false;
  if (data.homeAcresMin != null) {
    const acres = Number(listing.home?.acreage?.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] ?? NaN);
    if (!Number.isFinite(acres) || acres < data.homeAcresMin) return false;
  }
  if (data.jobCategory && !filterValues(data.jobCategory).includes(listing.job?.category ?? ""))
    return false;
  if (
    data.jobEmployer &&
    !listing.job?.employerName.toLowerCase().includes(data.jobEmployer.toLowerCase())
  )
    return false;
  if (data.jobPayType && !filterValues(data.jobPayType).includes(listing.job?.payType ?? ""))
    return false;
  if (
    data.jobEmploymentType &&
    !filterValues(data.jobEmploymentType).includes(listing.job?.employmentType ?? "")
  )
    return false;
  if (data.jobPayMin != null && (listing.job?.payMax ?? 0) < data.jobPayMin) return false;
  if (data.jobPayMax != null && (listing.job?.payMin ?? 0) > data.jobPayMax) return false;
  if (
    data.jobExperience &&
    !listing.job?.experienceRequired?.toLowerCase().includes(data.jobExperience.toLowerCase())
  )
    return false;
  if (
    data.jobEducation &&
    !listing.job?.educationLevel?.toLowerCase().includes(data.jobEducation.toLowerCase())
  )
    return false;
  if (
    data.serviceSubcategory &&
    ![listing.service?.subcategory, ...(listing.directory?.trades ?? [])].some((trade) =>
      trade?.toLowerCase().includes(data.serviceSubcategory!.toLowerCase()),
    )
  )
    return false;
  if (!matchesAnyText(listing.service?.serviceArea, data.serviceArea)) return false;
  if (!matchesAnyText(listing.service?.availability, data.serviceAvailability)) return false;
  if (data.serviceLicenseRequired && !listing.service?.licenseNumber) return false;
  if (data.hasPhotos && !listing.imageUrl) return false;
  if (data.postedWithin) {
    const createdAfter = postedSince(data.postedWithin);
    if (createdAfter && listing.createdAt < createdAfter) return false;
  }
  if (
    data.petSubcategory &&
    normalizePetSubcategory(listing.pet?.subcategory) !==
      normalizePetSubcategory(data.petSubcategory)
  )
    return false;
  if (
    data.petSpecies &&
    normalizePetSpecies(listing.pet?.species) !== normalizePetSpecies(data.petSpecies)
  )
    return false;
  if (data.petBreed && listing.pet?.breed !== data.petBreed) return false;
  if (data.petPlacementType && listing.pet?.placementType !== data.petPlacementType) return false;
  if (data.petOfferedBy && listing.pet?.offeredBy !== data.petOfferedBy) return false;
  if (data.petSex && listing.pet?.sex !== data.petSex) return false;
  if (data.petAge && !listing.pet?.age?.toLowerCase().includes(data.petAge.toLowerCase()))
    return false;
  for (const [value, actual] of [
    [data.petHypoallergenic, listing.pet?.hypoallergenic],
    [data.petVaccinated, listing.pet?.vaccinated],
    [data.petSpayedNeutered, listing.pet?.spayedNeutered],
    [data.petMicrochipped, listing.pet?.microchipped],
    [data.petRecordsAvailable, listing.pet?.recordsAvailable],
    [data.petGoodWithKids, listing.pet?.goodWithKids],
    [data.petGoodWithDogs, listing.pet?.goodWithDogs],
    [data.petGoodWithCats, listing.pet?.goodWithCats],
    [data.petIndoorOutdoor, listing.pet?.indoorOutdoor],
  ] as const) {
    if (value && actual !== value) return false;
  }
  return true;
}

/** One shared saved pool supplies every landing row. No row starts its own search. */
export function landingCards(cards: readonly ListingCardSummary[], input: ClassifiedBrowseInput) {
  const matches = [...new Map(cards.map((card) => [card.id, card])).values()].filter((card) =>
    matchesLandingCard(card, input),
  );
  return matches.sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return Number(b.isFeatured) - Number(a.isFeatured);
    if (input.sort === "price_low" || input.sort === "price_high") {
      const unpriced = (c: ListingCardSummary) =>
        (Boolean(c.externalVehicle) && c.priceCents <= 0) || Boolean(c.job && c.job.payMin == null);
      if (unpriced(a) !== unpriced(b)) return unpriced(a) ? 1 : -1;
      const price = (c: ListingCardSummary) =>
        c.job ? comparableJobPay(c.job.payType, c.job.payMin) : c.priceCents;
      const diff = input.sort === "price_low" ? price(a) - price(b) : price(b) - price(a);
      return diff || a.id.localeCompare(b.id);
    }
    if (input.sort === "mileage_low")
      return (
        (a.vehicle?.mileage ?? Infinity) - (b.vehicle?.mileage ?? Infinity) ||
        a.id.localeCompare(b.id)
      );
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
  });
}
