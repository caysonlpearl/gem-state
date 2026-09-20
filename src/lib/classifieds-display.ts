import { classifiedCategories } from "@/config/classifieds";

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
};

export const petPlacementLabels: Record<string, string> = {
  sale: "For sale",
  adoption: "Adoption",
  rehoming: "Rehoming",
  free: "Free to a good home",
  stud_breeding: "Stud / breeding",
  lost_found: "Lost or found",
  wanted: "Wanted / ISO",
};

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
      value >= 1000 ? `${Math.round(value / 1000)}k` : `$${value.toLocaleString()}`;
    return payMin === payMax ? `$${fmt(payMin)}/yr` : `$${fmt(payMin)}–$${fmt(payMax)}/yr`;
  }
  if (payType === "Commission") return "Commission";
  const suffix = payType === "Contract" ? "/hr contract" : "/hr";
  return payMin === payMax ? `$${payMin}${suffix}` : `$${payMin}–$${payMax}${suffix}`;
}
