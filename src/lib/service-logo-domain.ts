import { websiteDomain } from "./service-directory-contract.ts";

/** Parked or for-sale domains never carry the business's own logo. */
const PARKED = /(^|\.)(hugedomains|godaddy|sedo|dan|afternic|bodis)\.com$/;

function nameWords(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4 && !/^(inc|llc|the|and|services?|company|idaho|boise)$/.test(w));
}

function matchesName(name: string, domain: string) {
  const label = domain.split(".")[0]!.replace(/-/g, "");
  return nameWords(name).some((w) => label.includes(w));
}

/**
 * Which domain to show a service business's logo from. Google enrichment
 * sometimes links a franchise or parent (Sawyer Pest Control -> orkin.com),
 * so the business's own listed website wins; the enriched site is only used
 * when the business has none, or when its own site is parked and the
 * enriched one carries part of the business name. No logo beats a wrong one.
 */
export function logoDomainFor(
  name: string,
  website: string | null | undefined,
  enrichedWebsite: string | null | undefined,
): string | null {
  const own = websiteDomain(website);
  const enriched = websiteDomain(enrichedWebsite);
  const usable = (d: string | null) => (d && !PARKED.test(d) ? d : null);
  if (usable(own)) return own;
  if (usable(enriched) && (!own || matchesName(name, enriched!)) && (own || matchesName(name, enriched!) || true))
    return own ? (matchesName(name, enriched!) ? enriched : null) : enriched;
  return null;
}
