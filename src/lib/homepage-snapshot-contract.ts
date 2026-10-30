import type { ClassifiedCard, ClassifiedsHome, ClassifiedsHomeLead } from "./classifieds.functions";
import type { ListingCardSummary } from "./listing-card-summary";

export const HOME_SNAPSHOT_VERSION = 1;
export const HOME_REFRESH_MS = 5 * 60_000;
export const HOME_MAX_STALE_MS = 6 * 60 * 60_000;
export const HOME_SOURCE_KEYS = [
  "native",
  "vehicles",
  "homes",
  "jobs",
  "services",
  "pets",
  "merchandise",
] as const;
export type HomeSourceKey = (typeof HOME_SOURCE_KEYS)[number];
export type HomeSection = {
  updatedAt: number;
  cards: ListingCardSummary[];
  total?: number;
  categoryCounts?: Record<string, number>;
};
export type HomepageSnapshot = {
  version: 1;
  generatedAt: number;
  sections: Partial<Record<HomeSourceKey, HomeSection>>;
};

/** Explicit public-card projection: never persist raw provider payloads, seller
 * accounts, evidence, descriptions, private contacts, or detail-page galleries. */
export function homepageCard(card: ClassifiedCard): ListingCardSummary {
  const {
    id,
    title,
    productId,
    productSlug,
    priceCents,
    currency,
    city,
    state,
    region,
    postalCode,
    categorySlug,
    categoryName,
    condition,
    fulfillmentMode,
    createdAt,
    isFeatured,
    imageUrl,
    vehicle,
    pet,
    home,
    dealer,
    itemDetails,
    directory,
    externalHome,
    externalJob,
    externalPet,
    externalMerchandise,
  } = card;
  return {
    id,
    title,
    productId,
    productSlug,
    priceCents,
    currency,
    city,
    state,
    region,
    postalCode,
    categorySlug,
    categoryName,
    condition,
    fulfillmentMode,
    createdAt,
    isFeatured,
    imageUrl,
    vehicle,
    pet,
    home,
    dealer,
    itemDetails,
    directory,
    externalHome,
    externalJob,
    externalPet,
    externalMerchandise,
    ...(card.externalVehicle
      ? { externalVehicle: { sourceKind: card.externalVehicle.sourceKind } }
      : {}),
    ...(card.job
      ? { job: { ...card.job, jobSummary: "", responsibilities: [], qualifications: [] } }
      : {}),
    ...(card.service ? { service: { ...card.service, reviews: [] } } : {}),
  };
}

export function validHomepageSnapshot(value: unknown): value is HomepageSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as HomepageSnapshot;
  if (
    s.version !== HOME_SNAPSHOT_VERSION ||
    !Number.isFinite(s.generatedAt) ||
    !s.sections ||
    typeof s.sections !== "object"
  )
    return false;
  return Object.entries(s.sections).every(
    ([key, section]) =>
      HOME_SOURCE_KEYS.includes(key as HomeSourceKey) &&
      section &&
      Number.isFinite(section.updatedAt) &&
      Array.isArray(section.cards) &&
      section.cards.length <= 1000 &&
      section.cards.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.priceCents === "number",
      ),
  );
}

const newest = (a: ListingCardSummary, b: ListingCardSummary) =>
  Number(b.isFeatured) - Number(a.isFeatured) ||
  (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
  a.id.localeCompare(b.id);
export function uniqueHomeCards(cards: ListingCardSummary[]) {
  return [...new Map(cards.map((card) => [card.id, card])).values()];
}

/** Expiry applies to each source's last successful read, not the last time a
 * different source refreshed. A failed source therefore cannot live forever. */
export function homepagePayload(
  snapshot: HomepageSnapshot,
  now = Date.now(),
): { home: ClassifiedsHome; lead: ClassifiedsHomeLead } {
  const rows = (key: HomeSourceKey) => {
    const section = snapshot.sections[key];
    return section && now - section.updatedAt <= HOME_MAX_STALE_MS ? section.cards : [];
  };
  const native = rows("native");
  const motors = uniqueHomeCards([...native.filter((c) => c.vehicle), ...rows("vehicles")])
    .filter((c) => c.state === "ID")
    .sort(newest);
  const recent = uniqueHomeCards([
    ...native,
    ...rows("homes"),
    ...rows("jobs"),
    ...rows("services"),
    ...rows("pets"),
  ]).sort(newest);
  const categoryCounts = {
    ...(native.length ? (snapshot.sections.native?.categoryCounts ?? {}) : {}),
  };
  const jobs = recent.filter((c) => c.job).length;
  categoryCounts.jobs = jobs;
  const totalActive =
    (native.length ? (snapshot.sections.native?.total ?? native.length) : 0) + rows("jobs").length;
  return {
    home: { categoryCounts, totalActive, motors, recent, onlineMerchandise: rows("merchandise") },
    lead: {
      categoryCounts,
      totalActive,
      motors: motors.filter((c) => c.categorySlug === "cars-trucks").slice(0, 24),
    },
  };
}
