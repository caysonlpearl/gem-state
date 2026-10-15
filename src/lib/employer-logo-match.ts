/**
 * Matching an employer name from a job feed to a logo.dev search result.
 * A wrong company's logo on a job is worse than none, so only a candidate
 * whose name is the same company name (ignoring case, punctuation, a leading
 * "The" and legal suffixes like Inc/LLC) is accepted.
 */

const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "lp",
  "llp",
  "pc",
  "pllc",
]);

// Feed placeholders that aren't a company.
const NOT_A_COMPANY = new Set(["", "confidential", "unknown", "private", "anonymous", "na", "n a"]);

export function employerKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words[0] === "the") words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(" ");
}

const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function pickLogoDomain(
  employer: string,
  candidates: readonly { name?: unknown; domain?: unknown }[],
): string | null {
  const key = employerKey(employer);
  if (key.length < 3 || NOT_A_COMPANY.has(key)) return null;
  for (const candidate of candidates) {
    if (typeof candidate.name !== "string" || typeof candidate.domain !== "string") continue;
    const domain = candidate.domain.toLowerCase();
    if (employerKey(candidate.name) === key && DOMAIN.test(domain)) return domain;
  }
  return null;
}

export function logoImageUrl(domain: string, publishableKey: string): string {
  const params = new URLSearchParams({
    token: publishableKey,
    size: "128",
    format: "webp",
    // A 404 lets the page fall back to the employer's initials.
    fallback: "404",
  });
  return `https://img.logo.dev/${domain}?${params}`;
}
