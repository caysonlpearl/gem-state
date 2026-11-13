import { z } from "zod";
import {
  mobileCategories,
  mobileCategoryAllowed,
  mobileListingAllowed,
} from "./mobile-contract.ts";
import { savedSearchBrowseInput } from "./saved-search-contract.ts";

const filters = z.record(
  z.string(),
  z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
);
const name = z.string().trim().min(1).max(80);
export const mobileCreateSearch = z
  .object({ name, search: filters, emailAlerts: z.boolean().default(false) })
  .strict();
export const mobileUpdateSearch = z
  .object({
    name: name.optional(),
    search: filters.optional(),
    paused: z.boolean().optional(),
    emailAlerts: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export function mobileSavedSearchAllowed(value: {
  name: unknown;
  search: Record<string, unknown>;
}) {
  const search = value.search;
  if (!search || typeof search !== "object" || Array.isArray(search)) return false;
  const category = search.category ?? search.categorySlug ?? search.section;
  if (category && category !== "all" && !mobileCategoryAllowed(category)) return false;
  if (
    Object.entries(search).some(
      ([key, value]) =>
        key.startsWith("firearm") &&
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== false,
    )
  )
    return false;
  return mobileListingAllowed({
    categorySlug: mobileCategories[0]!.slug,
    title: [value.name, search.q, search.query, search.keyword]
      .filter((x) => typeof x === "string")
      .join(" "),
  });
}
export function mobileSavedFilters(search: Record<string, unknown>) {
  const clean = { ...search };
  delete clean.savedSearchId;
  delete clean.mobileCatalog;
  delete clean.page;
  delete clean.view;
  if (
    !mobileSavedSearchAllowed({ name: "", search: clean }) ||
    savedSearchBrowseInput(clean).unsupported.length
  )
    return null;
  return { ...clean, mobileCatalog: true };
}
export function mobileSearchPrivacyUpdate(input: Record<string, unknown>) {
  return (
    Object.keys(input).length > 0 &&
    Object.entries(input).every(
      ([key, value]) =>
        (key === "paused" && value === true) || (key === "emailAlerts" && value === false),
    )
  );
}
