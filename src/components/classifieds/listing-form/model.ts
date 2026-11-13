import { classifiedCategories } from "@/config/classifieds";
import type { ListingKind } from "./payload";

export const conditions = [
  ["new_with_tags", "New"],
  ["new_without_tags", "New, no tags"],
  ["used_excellent", "Used — excellent"],
  ["used_good", "Used — good"],
  ["not_applicable", "Not applicable"],
] as const;
export const fulfillmentModes = [
  ["local_pickup", "Local pickup"],
  ["shipping", "Shipping"],
  ["both", "Pickup or shipping"],
] as const;
export const kindTabs: { key: ListingKind; label: string }[] = [
  { key: "item", label: "Item" },
  { key: "vehicle", label: "Vehicle" },
  { key: "home", label: "Home" },
  { key: "job", label: "Job" },
  { key: "service", label: "Service" },
  { key: "pet", label: "Pet" },
];
export const motorsCategorySlugs: Set<string> = new Set(
  classifiedCategories.filter((category) => category.group === "motors").map((c) => c.slug),
);
export const itemCategorySlugs: Set<string> = new Set(
  classifiedCategories
    .filter(
      (category) =>
        category.group === "classifieds" &&
        !["other-real-estate", "jobs", "services", "pets"].includes(category.slug),
    )
    .map((c) => c.slug),
);

export const listingTypeCopy: Record<
  ListingKind,
  {
    basicsTitle: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
  }
> = {
  item: {
    basicsTitle: "Item details",
    titlePlaceholder: "Example: Solid oak dining table",
    descriptionLabel: "Item description",
    descriptionPlaceholder:
      "Describe the item honestly, including condition, dimensions, and anything a buyer should know.",
  },
  vehicle: {
    basicsTitle: "Vehicle basics",
    titlePlaceholder: "Example: 2019 Toyota Tacoma TRD Off-Road",
    descriptionLabel: "Vehicle description",
    descriptionPlaceholder:
      "Describe the vehicle's condition, history, features, and anything a buyer should know.",
  },
  home: {
    basicsTitle: "Property basics",
    titlePlaceholder: "Example: 3-bedroom home with a fenced yard",
    descriptionLabel: "Property description",
    descriptionPlaceholder:
      "Describe the property, location, features, and anything a buyer or renter should know.",
  },
  job: {
    basicsTitle: "Job basics",
    titlePlaceholder: "Example: Front Desk Associate",
    descriptionLabel: "Job description",
    descriptionPlaceholder:
      "Describe the role, day-to-day work, schedule, and what makes this opportunity a good fit.",
  },
  service: {
    basicsTitle: "Service basics",
    titlePlaceholder: "Example: Boise Home Works | Handyman services",
    descriptionLabel: "Service description",
    descriptionPlaceholder:
      "Describe the service, what is included, where you work, and what customers should expect.",
  },
  pet: {
    basicsTitle: "Pet basics",
    titlePlaceholder: "Example: Golden Retriever puppies",
    descriptionLabel: "Pet description",
    descriptionPlaceholder:
      "Describe the animal honestly, including temperament, care needs, and anything a new home should know.",
  },
};
