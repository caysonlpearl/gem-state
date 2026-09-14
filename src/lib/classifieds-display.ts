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
