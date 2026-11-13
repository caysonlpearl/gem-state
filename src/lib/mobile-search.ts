import { normalizeBrowsePage } from "./classifieds-pagination.ts";
import { savedSearchBrowseInput } from "./saved-search-contract.ts";
import type { ClassifiedBrowseInput } from "./classified-browse-contract.ts";

/** A separate full-filter endpoint keeps installed clients' basic discovery contract stable. */
export function mobileSearchInput(params: URLSearchParams): ClassifiedBrowseInput | null {
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw || ["includeAllMocks", "mobileCatalog", "location"].includes(key)) return null;
    raw[key] = value;
  }
  if (Object.keys(raw).length > 160 || params.toString().length > 16000) return null;
  // Use the website's safe page-number contract. Each read keeps its existing
  // fixed row budget; a later page must not make inventory unreachable.
  if (
    raw.page &&
    (!/^\d+$/.test(raw.page) ||
      Number(raw.page) < 1 ||
      normalizeBrowsePage(raw.page) !== Number(raw.page))
  )
    return null;
  const { input, unsupported } = savedSearchBrowseInput(raw);
  return unsupported.length ? null : { ...input, mobileCatalog: true };
}
