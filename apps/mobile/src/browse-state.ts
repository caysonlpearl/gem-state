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
  if (
    query.get("category") === "other-real-estate" &&
    !query.has("homeTab") &&
    !["buy", "rent", "build"].includes(query.get("homeMode") ?? "")
  )
    query.set("homeTab", "buy");
  if (page !== undefined) query.set("page", String(page));
  return query;
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
