import { listingCardImageUrl } from "./listing-card-image.ts";

// These are image-only hosts already used by the vehicle feed. Never turn
// provider-supplied URLs into unrestricted server-side network requests.
const PHOTO_HOSTS = new Set([
  "images.craigslist.org",
  "prelogin.privateauto.com",
  "platform.cstatic-images.com",
  "assets.cai-media-management.com",
]);
type Verdict = "available" | "missing" | "unknown";
const checks = new Map<string, { until: number; verdict: Promise<Verdict> }>();

function hasCardSizedPhoto(card: { imageUrl: string | null; externalVehicle?: unknown }) {
  if (!card.externalVehicle) return true; // native covers are signed at card width
  try {
    const host = new URL(card.imageUrl ?? "").hostname;
    // These feeds have verified card variants. Other dealer hosts can send
    // multi-megabyte originals; keep them behind working thumbnail sources.
    return host === "images.craigslist.org" || host === "platform.cstatic-images.com";
  } catch {
    return false;
  }
}

export async function checkHomepagePhoto(url: string): Promise<Verdict> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unknown";
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    !PHOTO_HOSTS.has(parsed.hostname)
  )
    return "unknown";
  const cached = checks.get(url);
  if (cached && cached.until > Date.now()) return cached.verdict;
  const verdict = (async (): Promise<Verdict> => {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(800),
      });
      if (response.status === 404 || response.status === 410) return "missing";
      if (response.ok && response.headers.get("content-type")?.startsWith("image/"))
        return "available";
    } catch {
      /* An unavailable host is not proof its photo was deleted. */
    }
    return "unknown";
  })();
  checks.delete(url);
  const entry = { until: Date.now() + 10 * 60_000, verdict };
  checks.set(url, entry);
  void verdict.then((result) => {
    if (result === "unknown") entry.until = Date.now() + 10_000;
  });
  if (checks.size > 300) checks.delete(checks.keys().next().value!);
  return verdict;
}

/** Only the featured selection changes; browse records and ownership stay intact. */
export async function selectHomepagePhotoCards<
  T extends { imageUrl: string | null; externalVehicle?: unknown },
>(cards: T[], probe: (url: string) => Promise<Verdict> = checkHomepagePhoto): Promise<T[]> {
  // Check a bounded candidate pool in parallel, without reading photo bodies.
  const candidates = cards.slice(0, 12);
  const statuses = await Promise.all(
    candidates.map((card) =>
      !card.imageUrl
        ? Promise.resolve("unknown" as const)
        : !card.externalVehicle
          ? Promise.resolve("available" as const)
          : probe(listingCardImageUrl(card.imageUrl)),
    ),
  );
  return [
    ...candidates.filter(
      (card, index) => statuses[index] === "available" && hasCardSizedPhoto(card),
    ),
    ...candidates.filter(
      (card, index) => statuses[index] === "available" && !hasCardSizedPhoto(card),
    ),
    ...candidates.filter((_, index) => statuses[index] === "unknown"),
    ...cards.slice(candidates.length),
  ];
}
