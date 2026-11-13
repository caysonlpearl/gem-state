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
  // Bound public API work. Blank fields mean no filter, never numeric zero.
  if (raw.page && (!/^\d+$/.test(raw.page) || Number(raw.page) < 1 || Number(raw.page) > 100))
    return null;
  const { input, unsupported } = savedSearchBrowseInput(raw);
  return unsupported.length ? null : { ...input, mobileCatalog: true };
}
