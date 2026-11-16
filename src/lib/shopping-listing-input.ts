import { fieldsForClassifiedItem } from "../config/classified-item-fields.ts";
import { safeShoppingText, shoppingImageInput, type ShoppingCard } from "./shopping-contract.ts";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Public listing attributes only. Never serialize arbitrary card/provider metadata. */
export function shoppingListingInput(card: ShoppingCard) {
  const parts: string[] = [];
  const add = (label: string, value: unknown, max = 64) => {
    const text =
      typeof value === "number"
        ? Number.isFinite(value) && value >= 0
          ? String(value)
          : ""
        : safeShoppingText(value, max).replace(/\s+/g, " ");
    if (text) parts.push(label ? `${label}: ${text}` : text);
  };
  add("", card.title, 160);
  add("", card.categorySlug);
  const items = record(card.itemDetails);
  for (const field of fieldsForClassifiedItem(card.categorySlug))
    add(field.label, items[field.key]);
  const vehicle = record(card.vehicle);
  for (const [key, label] of [
    ["year", "Year"],
    ["make", "Make"],
    ["model", "Model"],
    ["trim", "Trim"],
    ["bodyStyle", "Body"],
    ["exteriorColor", "Color"],
    ["fuelType", "Fuel"],
    ["transmission", "Transmission"],
    ["drivetrain", "Drivetrain"],
    ["mileage", "Miles"],
    ["titleStatus", "Title status"],
  ])
    add(label, vehicle[key]);
  const home = record(card.home);
  for (const [key, label] of [
    ["mode", "Home listing"],
    ["propertyType", "Property"],
    ["bedrooms", "Bedrooms"],
    ["bathrooms", "Bathrooms"],
    ["squareFeet", "Square feet"],
    ["yearBuilt", "Built"],
    ["acres", "Acres"],
    ["pets", "Pets policy"],
    ["leaseLength", "Lease"],
  ])
    add(label, home[key]);
  const pet = record(card.pet);
  for (const [key, label] of [
    ["species", "Species"],
    ["breed", "Breed"],
    ["age", "Age"],
    ["sex", "Sex"],
    ["placementType", "Placement"],
    ["goodWithKids", "Good with kids"],
    ["goodWithDogs", "Good with dogs"],
    ["goodWithCats", "Good with cats"],
    ["indoorOutdoor", "Indoor or outdoor"],
  ])
    add(label, pet[key]);
  const job = record(card.job);
  for (const [key, label] of [
    ["category", "Job category"],
    ["employmentType", "Employment"],
    ["experienceRequired", "Experience"],
    ["educationLevel", "Education"],
  ])
    add(label, job[key]);
  const service = record(card.service);
  add("Service", service.subcategory);
  add("Pricing type", service.pricingType);
  add("Condition", card.condition);
  add("", card.city);
  add("", card.state);
  const text = parts.join("; ").slice(0, 1000);
  const image = shoppingImageInput(card.imageUrl);
  // Hash exactly the model input: unrelated contact/price/signature changes do not
  // spend embedding work; changed public facts or a revised photo do.
  return {
    text,
    image: image.url,
    identity: JSON.stringify(["public-facts-v1", text, image.identity]),
  };
}
