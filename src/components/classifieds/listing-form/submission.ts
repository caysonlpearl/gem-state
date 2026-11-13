import type { ClassifiedListingInput } from "@/lib/classified-listing-contracts";
import type { ListingFormState } from "./types";
import {
  buildVehicle,
  buildHome,
  buildJob,
  buildService,
  buildPet,
  priceCentsFor,
  isHomeCategory,
  isJobCategory,
  isServiceCategory,
  isPetCategory,
} from "./payload";
function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}
/** One mapping for the website and native adapters; upload/signing stays outside. */
export function listingFormSubmission(form: ListingFormState) {
  const vehicle = buildVehicle(form);
  const home = buildHome(form);
  const job = buildJob(form);
  const service = buildService(form);
  const pet = buildPet(form);
  const priceCents = priceCentsFor(form);
  const condition = (
    isHomeCategory(form.category) ||
    isJobCategory(form.category) ||
    isServiceCategory(form.category) ||
    isPetCategory(form.category)
      ? "not_applicable"
      : form.condition
  ) as ClassifiedListingInput["condition"];
  const fulfillmentMode = (
    isHomeCategory(form.category) ||
    isJobCategory(form.category) ||
    isServiceCategory(form.category)
      ? "local_pickup"
      : form.fulfillmentMode
  ) as ClassifiedListingInput["fulfillmentMode"];

  return {
    title: form.title,
    description: form.description,
    category: form.category as ClassifiedListingInput["category"],
    priceCents,
    condition,
    sellerNote: form.sellerNote || undefined,
    itemDetails: form.itemDetails,
    state: form.state,
    region: form.region,
    city: form.city,
    postalCode: form.postalCode || undefined,
    fulfillmentMode,
    parcelLengthIn: optionalNumber(form.length),
    parcelWidthIn: optionalNumber(form.width),
    parcelHeightIn: optionalNumber(form.height),
    parcelWeightLb: optionalNumber(form.weight),
    vehicle,
    home,
    job,
    service,
    pet,
  };
}
