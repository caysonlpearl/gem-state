import { isMotorsCategory } from "@/lib/classifieds-display";
import type { ClassifiedListingInput } from "@/lib/classified-listing-contracts";
import type { ClassifiedListingEditor } from "@/lib/classifieds.functions";
import { linesToList, listToLines } from "./shared";
import { initialListingForm, type ListingFormState } from "./types";

export function isHomeCategory(category: string) {
  return category === "other-real-estate";
}
export function isJobCategory(category: string) {
  return category === "jobs";
}
export function isServiceCategory(category: string) {
  return category === "services";
}

export type ListingKind = "item" | "vehicle" | "home" | "job" | "service";

/** Which top-level listing-type tab a category belongs to. Drives the tab bar
 * at the top of the form so choosing "Home"/"Job"/"Service" is an explicit,
 * visible action instead of a side effect of a generic category dropdown. */
export function kindForCategory(category: string): ListingKind {
  if (isHomeCategory(category)) return "home";
  if (isJobCategory(category)) return "job";
  if (isServiceCategory(category)) return "service";
  if (isMotorsCategory(category)) return "vehicle";
  return "item";
}

export function dollarsToCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

/** Jobs don't collect a standalone price; derive one from pay minimum so the
 * shared price/sort columns still have a sensible value. */
export function priceCentsFor(form: ListingFormState): number {
  if (isJobCategory(form.category)) {
    return Math.max(100, Math.round((Number(form.payMin) || 0) * 100));
  }
  return dollarsToCents(form.price);
}

export function buildVehicle(
  form: ListingFormState,
): ClassifiedListingInput["vehicle"] | undefined {
  if (!isMotorsCategory(form.category)) return undefined;
  return {
    make: form.make,
    model: form.model,
    year: Number(form.year),
    trim: form.trim || undefined,
    mileage: Number(form.mileage),
    bodyStyle: form.bodyStyle as NonNullable<ClassifiedListingInput["vehicle"]>["bodyStyle"],
    transmission: form.transmission as NonNullable<
      ClassifiedListingInput["vehicle"]
    >["transmission"],
    drivetrain: form.drivetrain as NonNullable<ClassifiedListingInput["vehicle"]>["drivetrain"],
    fuelType: form.fuelType as NonNullable<ClassifiedListingInput["vehicle"]>["fuelType"],
    exteriorColor: form.exteriorColor || undefined,
    titleStatus: form.titleStatus as NonNullable<ClassifiedListingInput["vehicle"]>["titleStatus"],
    vin: form.vin || undefined,
  };
}

export function buildHome(form: ListingFormState): ClassifiedListingInput["home"] | undefined {
  if (!isHomeCategory(form.category)) return undefined;
  return {
    mode: form.homeMode as NonNullable<ClassifiedListingInput["home"]>["mode"],
    propertyType: form.propertyType,
    bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
    bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
    squareFeet: form.squareFeet ? Number(form.squareFeet) : undefined,
    yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
    acreage: form.acreage || undefined,
    heating: form.heating || undefined,
    cooling: form.cooling || undefined,
    garageParking: form.garageParking || undefined,
    yard: form.yard || undefined,
    appliancesIncluded: form.appliancesIncluded || undefined,
    floorCoverings: form.floorCoverings || undefined,
    basementType: form.basementType || undefined,
    exteriorMaterial: form.exteriorMaterial || undefined,
    specialFeatures: form.specialFeatures || undefined,
    hoaFees: form.hoaFees || undefined,
    schoolDistrict: form.schoolDistrict || undefined,
    leaseLength: form.leaseLength || undefined,
    available: form.available || undefined,
    pets: form.petsPolicy || undefined,
    smoking: form.smokingPolicy || undefined,
    openHouse: form.openHouse || undefined,
  };
}

export function buildJob(form: ListingFormState): ClassifiedListingInput["job"] | undefined {
  if (!isJobCategory(form.category)) return undefined;
  return {
    employerName: form.employerName,
    employerAddress: form.employerAddress || undefined,
    payType: form.payType as NonNullable<ClassifiedListingInput["job"]>["payType"],
    payMin: Number(form.payMin),
    payMax: Number(form.payMax) || Number(form.payMin),
    employmentType: form.employmentType as NonNullable<
      ClassifiedListingInput["job"]
    >["employmentType"],
    experienceRequired: form.experienceRequired || undefined,
    educationLevel: form.educationLevel || undefined,
    responsibilities: linesToList(form.responsibilities),
    qualifications: linesToList(form.qualifications).length
      ? linesToList(form.qualifications)
      : undefined,
  };
}

export function buildService(
  form: ListingFormState,
): ClassifiedListingInput["service"] | undefined {
  if (!isServiceCategory(form.category)) return undefined;
  return {
    subcategory: form.subcategory,
    serviceArea: form.serviceArea,
    availability: form.availability || undefined,
    businessAddress: form.businessAddress || undefined,
    licenseNumber: form.licenseNumber || undefined,
    licenseLookupUrl: form.licenseLookupUrl || undefined,
    offerings: linesToList(form.offerings).length ? linesToList(form.offerings) : undefined,
  };
}

export function fromEditor(listing: ClassifiedListingEditor): ListingFormState {
  return {
    ...initialListingForm,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    price: (listing.priceCents / 100).toFixed(2),
    condition: listing.condition,
    sellerNote: listing.sellerNote,
    state: listing.state,
    region: listing.region,
    city: listing.city,
    postalCode: listing.postalCode,
    fulfillmentMode: listing.fulfillmentMode,
    length: listing.parcelLengthIn,
    width: listing.parcelWidthIn,
    height: listing.parcelHeightIn,
    weight: listing.parcelWeightLb,

    make: listing.vehicle?.make ?? "",
    model: listing.vehicle?.model ?? "",
    year: listing.vehicle?.year == null ? "" : String(listing.vehicle.year),
    trim: listing.vehicle?.trim ?? "",
    mileage: listing.vehicle?.mileage == null ? "" : String(listing.vehicle.mileage),
    bodyStyle: listing.vehicle?.bodyStyle ?? "",
    transmission: listing.vehicle?.transmission ?? "Automatic",
    drivetrain: listing.vehicle?.drivetrain ?? "",
    fuelType: listing.vehicle?.fuelType ?? "Gasoline",
    exteriorColor: listing.vehicle?.exteriorColor ?? "",
    titleStatus: listing.vehicle?.titleStatus ?? "Clean",
    vin: listing.vehicle?.vin ?? "",

    homeMode: listing.home?.mode ?? "buy",
    propertyType: listing.home?.propertyType ?? "Single-family home",
    bedrooms: listing.home?.bedrooms == null ? "" : String(listing.home.bedrooms),
    bathrooms: listing.home?.bathrooms == null ? "" : String(listing.home.bathrooms),
    squareFeet: listing.home?.squareFeet == null ? "" : String(listing.home.squareFeet),
    yearBuilt: listing.home?.yearBuilt == null ? "" : String(listing.home.yearBuilt),
    acreage: listing.home?.acreage ?? "",
    heating: listing.home?.heating ?? "",
    cooling: listing.home?.cooling ?? "",
    garageParking: listing.home?.garageParking ?? "",
    yard: listing.home?.yard ?? "",
    appliancesIncluded: listing.home?.appliancesIncluded ?? "",
    floorCoverings: listing.home?.floorCoverings ?? "",
    basementType: listing.home?.basementType ?? "",
    exteriorMaterial: listing.home?.exteriorMaterial ?? "",
    specialFeatures: listing.home?.specialFeatures ?? "",
    hoaFees: listing.home?.hoaFees ?? "",
    schoolDistrict: listing.home?.schoolDistrict ?? "",
    leaseLength: listing.home?.leaseLength ?? "",
    available: listing.home?.available ?? "",
    petsPolicy: listing.home?.pets ?? "",
    smokingPolicy: listing.home?.smoking ?? "",
    openHouse: listing.home?.openHouse ?? "",

    employerName: listing.job?.employerName ?? "",
    employerAddress: listing.job?.employerAddress ?? "",
    payType: listing.job?.payType ?? "Hourly",
    payMin: listing.job?.payMin == null ? "" : String(listing.job.payMin),
    payMax: listing.job?.payMax == null ? "" : String(listing.job.payMax),
    employmentType: listing.job?.employmentType ?? "Full-time",
    experienceRequired: listing.job?.experienceRequired ?? "",
    educationLevel: listing.job?.educationLevel ?? "",
    responsibilities: listToLines(listing.job?.responsibilities),
    qualifications: listToLines(listing.job?.qualifications),

    subcategory: listing.service?.subcategory ?? "",
    serviceArea: listing.service?.serviceArea ?? "",
    availability: listing.service?.availability ?? "",
    businessAddress: listing.service?.businessAddress ?? "",
    licenseNumber: listing.service?.licenseNumber ?? "",
    licenseLookupUrl: listing.service?.licenseLookupUrl ?? "",
    offerings: listToLines(listing.service?.offerings),
  };
}
