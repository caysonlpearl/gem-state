export const sellerShippingMethods = [
  {
    value: "usps_ground_advantage",
    label: "USPS Ground Advantage",
    transitLabel: "Typically 2–5 business days in transit",
  },
  {
    value: "usps_priority_mail",
    label: "USPS Priority Mail",
    transitLabel: "Typically 2–3 business days in transit",
  },
  {
    value: "ups_ground",
    label: "UPS Ground",
    transitLabel: "Typically 1–5 business days in transit",
  },
  {
    value: "fedex_ground",
    label: "FedEx Ground / Home Delivery",
    transitLabel: "Typically 1–5 business days in transit",
  },
] as const;

export type SellerShippingMethod = (typeof sellerShippingMethods)[number]["value"];

export function getSellerShippingMethod(value: string | null | undefined) {
  return sellerShippingMethods.find((method) => method.value === value) ?? null;
}

export function formatShippingOrigin(
  city: string | null | undefined,
  region: string | null | undefined,
  country: string | null | undefined,
) {
  const locality = [city, region].filter(Boolean).join(", ");
  if (!locality) return country || "Not provided";
  return country && country !== "US" ? `${locality}, ${country}` : locality;
}

export function formatHandlingTime(days: number | null | undefined) {
  if (!days) return "Not provided";
  return `Ships within ${days} business day${days === 1 ? "" : "s"}`;
}
