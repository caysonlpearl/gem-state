/** Shared public destinations; query keys cannot escape into billing or catalog overrides. */
export function storefrontDestination(
  path: string,
  search: Record<string, unknown> = {},
  section?: string,
) {
  const match = /^\/(sellers|dealers)\/([a-z0-9][a-z0-9-]{0,79})$/i.exec(path);
  if (!match || (match[1].toLowerCase() === "sellers" && match[2].length > 60)) return null;
  const kind = match[1].toLowerCase(),
    slug = match[2].toLowerCase(),
    params = new URLSearchParams();
  if (Object.keys(search).some((k) => !["page", "review", "section"].includes(k))) return null;
  if (search.page != null) {
    const page = Number(search.page);
    if (kind !== "dealers" || !Number.isSafeInteger(page) || page < 1 || page > 10000) return null;
    if (page > 1) params.set("page", String(page));
  }
  if (search.review != null) {
    if (kind !== "sellers" || ![true, "true"].includes(search.review as boolean | string))
      return null;
    params.set("review", "true");
  }
  const anchor = section ?? search.section;
  if (anchor != null && anchor !== "") {
    if (kind !== "dealers" || anchor !== "dealer-inventory") return null;
    params.set("section", "dealer-inventory");
  }
  return `/${kind}/${slug}${params.size ? "?" + params : ""}`;
}
export function storefrontAuthDestination(path: string) {
  try {
    const url = new URL(path, "https://onbluebird.com");
    if (
      url.origin !== "https://onbluebird.com" ||
      url.hash ||
      url.pathname + url.search !== path ||
      new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length
    )
      return null;
    return storefrontDestination(url.pathname, Object.fromEntries(url.searchParams));
  } catch {
    return null;
  }
}
