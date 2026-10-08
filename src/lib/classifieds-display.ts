import { classifiedCategories } from "@/config/classifieds";
import { formatUsd } from "@/config/fees";

export const conditionLabels: Record<string, string> = {
  new_with_tags: "New",
  new_without_tags: "New, no tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

export const fulfillmentLabels: Record<string, string> = {
  local_pickup: "Local pickup",
  shipping: "Ships",
  both: "Pickup or shipping",
  pickup_or_shipping: "Pickup or shipping",
};

/** Marketplace-facing fulfillment copy. Vehicle transport is clearer than the
 * generic shipping language used for ordinary classifieds. */
export function formatFulfillmentLabel(mode: string | null | undefined, isVehicle = false) {
  if (isVehicle) {
    if (mode === "shipping") return "Vehicle transport available";
    if (mode === "both" || mode === "pickup_or_shipping") return "Pickup or vehicle transport";
  }
  return fulfillmentLabels[mode ?? ""] ?? "Contact seller";
}

/** Category-aware price copy for cards and listing headers. */
export function formatClassifiedPrice(
  cents: number,
  options: { wholeDollars?: boolean; monthly?: boolean } = {},
) {
  const value = options.wholeDollars
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(cents / 100)
    : formatUsd(cents);
  return options.monthly ? `${value}/month` : value;
}

export const petPlacementLabels: Record<string, string> = {
  sale: "For sale",
  adoption: "Adoption",
  rehoming: "Rehoming",
  free: "Free to a good home",
  stud_breeding: "Stud / breeding",
  lost_found: "Lost or found",
  wanted: "Wanted / ISO",
};

const savedSearchFilterLabels: Record<string, string> = {
  q: "Keywords",
  category: "Category",
  group: "Collection",
  priceMin: "Minimum price",
  priceMax: "Maximum price",
  jobType: "Job type",
  jobEmploymentType: "Employment type",
  jobPayType: "Pay type",
  make: "Make",
  model: "Model",
  bodyStyle: "Body type",
  titleStatus: "Title",
  drivetrain: "Drive type",
  transmission: "Transmission",
  fuelType: "Fuel type",
  exteriorColor: "Exterior color",
  homeTab: "Home mode",
  petSubcategory: "Pet category",
  petSpecies: "Animal",
  petPlacementType: "Placement",
  fulfillment: "Fulfillment",
  condition: "Condition",
  serviceSubcategory: "Service type",
};

export function formatSavedSearchFilter(key: string, value: unknown) {
  const label =
    savedSearchFilterLabels[key] ??
    key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase());
  const raw = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const formatted = raw
    .split(/\|\||,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (key === "condition") return conditionLabels[item] ?? item;
      if (key === "fulfillment") return fulfillmentLabels[item] ?? item;
      if (key === "petPlacementType") return petPlacementLabels[item] ?? item;
      if (item === "both" || item === "pickup_or_shipping") return "Pickup or shipping";
      if (item === "message") return "Message seller";
      return item;
    })
    .join(", ");
  return `${label}: ${formatted}`;
}

export function formatSavedSearchScope(search: Record<string, unknown>) {
  const category = typeof search.category === "string" ? search.category : "";
  const categoryLabel = classifiedCategories.find((item) => item.slug === category)?.name;
  if (categoryLabel) return categoryLabel;
  return search.group === "motors" ? "Cars & motors" : "All classifieds";
}

export function isMotorsCategory(slug: string | null | undefined) {
  return classifiedCategories.some(
    (category) => category.slug === slug && category.group === "motors",
  );
}

export function formatMileage(miles: number | null | undefined) {
  if (miles == null) return null;
  return `${new Intl.NumberFormat("en-US").format(miles)} mi`;
}

/** Compact posting age: classifieds shoppers scan for freshness first. */
export function postedAge(iso: string) {
  const posted = new Date(iso).getTime();
  if (!Number.isFinite(posted)) return "";
  const days = Math.floor((Date.now() - posted) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function vehicleHeadline(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

export function formatJobPay(job: { payType: string; payMin: number; payMax: number }) {
  const { payType, payMin, payMax } = job;
  if (payType === "Salary") {
    const fmt = (value: number) =>
      value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value.toLocaleString()}`;
    return payMin === payMax ? `${fmt(payMin)}/yr` : `${fmt(payMin)}–${fmt(payMax)}/yr`;
  }
  if (payType === "Commission") return "Commission";
  const suffix = payType === "Contract" ? "/hr contract" : "/hr";
  return payMin === payMax ? `$${payMin}${suffix}` : `$${payMin}–$${payMax}${suffix}`;
}
