import { isMotorsCategory } from "../../../src/lib/classifieds-display.ts";
import { parseBrowseSearch, type Search } from "../../../src/lib/browse-search.ts";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract.ts";

export function browseLocation(hash: string) {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const raw = Object.fromEntries(params);
  const category = raw.category ?? raw.categorySlug ?? raw.section;
  return {
    path,
    params,
    raw,
    search: parseBrowseSearch(raw),
    eligible: !category || category === "all" || mobileCategoryAllowed(category),
  };
}
/** Preserve every stored condition, including conditions a newer client cannot edit.
 * Only an explicit Clear action can discard those unknown fields. */
export function browseDestination(
  patch: Partial<Search> | Record<string, unknown>,
  current?: URLSearchParams,
) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const aliases: Record<string, string[]> = {
    category: ["categorySlug", "section"],
    bedrooms: ["homeBedroomsMin", "homeBedroomsMax"],
    bathrooms: ["homeBathroomsMin"],
    propertyType: ["homePropertyType"],
    homeSquareFeet: ["homeSquareFeetMin"],
    homeAcres: ["homeAcresMin"],
    homeYearBuilt: ["homeYearBuiltMin"],
    leaseLength: ["homeLeaseLength"],
    jobType: ["jobEmploymentType", "employmentType"],
    jobPayMin: ["jobSalaryMin"],
    serviceExpandSearch: ["searchDescriptions"],
    q: ["query", "keyword"],
    priceMin: ["minPrice"],
    priceMax: ["maxPrice"],
  };
  for (const [key, names] of Object.entries(aliases))
    if (current && Object.hasOwn(patch, key)) names.forEach((name) => params.delete(name));
  params.delete("page");
  if (patch.page != null) params.set("page", String(patch.page));
  const previous = current ? parseBrowseSearch(Object.fromEntries(current)) : {};
  if (
    current &&
    ((Object.hasOwn(patch, "category") && patch.category !== previous.category) ||
      (Object.hasOwn(patch, "group") && patch.group !== previous.group))
  ) {
    const normalized = parseBrowseSearch(Object.fromEntries(params));
    for (const [key, names] of Object.entries(aliases))
      if (normalized[key as keyof Search] === undefined)
        names.forEach((name) => params.delete(name));
    for (const key of Object.keys(normalized)) {
      if (key === "savedSearchId") continue;
      const value = normalized[key as keyof Search];
      if (value === undefined) params.delete(key);
      else params.set(key, String(value));
    }
  }
  return `/search${params.size ? `?${params}` : ""}`;
}
export function browseApiQuery(params: URLSearchParams, page?: number) {
  const query = new URLSearchParams(params);
  // Metadata describes the saved resource; catalog scope is always server-owned.
  query.delete("savedSearchId");
  query.delete("mobileCatalog");
  const effective = parseBrowseSearch(Object.fromEntries(query));
  if (effective.category === "other-real-estate" && !query.get("homeTab"))
    query.set("homeTab", effective.homeTab ?? "buy");
  if (page !== undefined) query.set("page", String(page));
  return query;
}

/** Save the effective inventory scope, including defaults that were not in the URL. */
export function browseSavedSearchFilters(params: URLSearchParams, patch: Partial<Search> = {}) {
  const next = browseLocation("#" + browseDestination(patch, params));
  const raw = Object.fromEntries(browseApiQuery(next.params));
  const category = next.search.category;
  if (category === "other-real-estate") raw.homeMode = "results";
  if (category === "jobs") raw.jobMode = "results";
  if (category === "services") raw.serviceMode = "results";
  if (category === "pets") raw.petMode = "results";
  if (isMotorsCategory(category) || next.search.group === "motors") raw.vehicleMode = "results";
  delete raw.page;
  delete raw.view;
  return raw;
}

export function savedSearchDestination(search: Record<string, unknown>, id: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (
      ["mobileCatalog", "page", "savedSearchId"].includes(key) ||
      value === undefined ||
      value === null ||
      value === ""
    )
      continue;
    if (!["string", "number", "boolean"].includes(typeof value))
      throw Error("Some saved filters cannot be opened yet. Edit this search on the website.");
    params.set(key, String(value));
  }
  params.set("savedSearchId", id);
  return "/search?" + params;
}
