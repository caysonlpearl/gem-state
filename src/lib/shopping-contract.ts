import { matchesLandingCard } from "./landing-card-pool.ts";
import type { ClassifiedBrowseInput } from "./classifieds.functions";
import type { ListingCardSummary } from "./listing-card-summary";
/** Public listing facts and private shopping intent only; never payment or message bodies. */
export const SHOPPING_POLICY_VERSION = "2026-11-12";
export const SHOPPING_MODEL = "siglip2-base-patch16-224-v1";
export const SHOPPING_WEIGHTS = {
  purchase: 20,
  inquiry: 12,
  save: 10,
  repeat: 3,
  search: 2,
  view: 1,
};
export const SHOPPING_KINDS = [
  "impression",
  "view",
  "active",
  "photo",
  "search",
  "save",
  "unsave",
  "follow",
  "unfollow",
  "contact_open",
  "contact",
  "inquiry",
  "cart",
  "offer",
  "purchase",
  "dismiss",
  "recommendation_click",
  "notification_click",
] as const;
export type ShoppingKind = (typeof SHOPPING_KINDS)[number];
export type ShoppingEvent = {
  id: string;
  kind: ShoppingKind;
  listingId?: string;
  session: string;
  search?: Record<string, string | number>;
  context?: Record<string, string | number | boolean>;
  at?: string;
};
export type ShoppingCard = {
  id: string;
  title: string;
  categorySlug: string;
  priceCents: number;
  imageUrl?: string | null;
  city?: string | null;
  state?: string | null;
  createdAt: string;
  [key: string]: unknown;
};
export type Interest = {
  listingId: string;
  score: number;
  favorite: boolean;
  lastAt: number;
  sessions: Set<string>;
  recentSessions: Set<string>;
  contactAt: number;
  purchased: boolean;
  dismissed: boolean;
};
export type ShoppingPrivacy = { personalization: boolean; advertising: boolean; version: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validShoppingId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(id);
const searchKeys = new Set([
  "q",
  "category",
  "group",
  "city",
  "state",
  "region",
  "postalCode",
  "radiusMiles",
  "priceMin",
  "priceMax",
  "make",
  "model",
  "yearMin",
  "yearMax",
  "bodyStyle",
  "fuelType",
  "mileageMax",
  "transmission",
  "drivetrain",
  "exteriorColor",
  "titleStatus",
  "homeTab",
  "bedrooms",
  "bathrooms",
  "propertyType",
  "homeSquareFeet",
  "leaseLength",
  "homePetsPolicy",
  "petsCats",
  "petsDogs",
  "condition",
  "sort",
  "itemDetailKey",
  "itemDetailValue",
  "fulfillment",
  "postedWithin",
  "petSpecies",
  "petBreed",
  "petAge",
  "petSex",
  "serviceSubcategory",
  "employmentType",
  "jobEmployer",
  "jobSalaryMin",
]);
const contextKeys = new Set([
  "os",
  "device",
  "memory",
  "cores",
  "rtt",
  "downlink",
  "country",
  "region",
  "rank_visual",
  "rank_budget",
  "rank_location",
  "rank_freshness",
  "placement",
  "position",
  "model",
  "source",
  "method",
  "seconds",
  "photo",
  "visible",
  "language",
  "timezone",
  "viewport",
  "platform",
  "connection",
  "referrer",
  "campaign",
  "fingerprint",
  "city",
  "state",
]);
export function safeShoppingText(value: unknown, max = 160): string {
  if (typeof value !== "string") return "";
  // Free text may accidentally contain contact data, tokens or credentials.
  if (/@|https?:|bearer\s|password|secret|token=|\b\d[\d ()+.-]{8,}\d\b/i.test(value)) return "";
  return (
    value
      // eslint-disable-next-line no-control-regex -- strip nonprinting search input
      .replace(/[\u0000-\u001f<>]/g, " ")
      .trim()
      .slice(0, max)
  );
}
export function shoppingFields(
  input: unknown,
  context = false,
): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(context ? contextKeys : searchKeys).has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value))
      output[key] = Math.max(-1e10, Math.min(1e10, value));
    else if (typeof value === "boolean" && context) output[key] = value;
    else {
      const text = safeShoppingText(value);
      if (text) output[key] = text;
    }
  }
  return output;
}
export function shoppingEvent(input: unknown, trusted = false): ShoppingEvent | null {
  if (!input || typeof input !== "object") return null;
  const e = input as ShoppingEvent;
  if (!uuid.test(e.id) || !uuid.test(e.session) || !SHOPPING_KINDS.includes(e.kind)) return null;
  if (!trusted && ["purchase", "inquiry", "offer"].includes(e.kind)) return null;
  if (e.kind !== "search" && !validShoppingId(e.listingId)) return null;
  return {
    id: e.id,
    kind: e.kind,
    session: e.session,
    at: new Date(
      Math.min(
        Date.now(),
        Number.isFinite(Date.parse(e.at ?? "")) ? Date.parse(e.at!) : Date.now(),
      ),
    ).toISOString(),
    ...(e.listingId ? { listingId: e.listingId } : {}),
    search: shoppingFields(e.search) as ShoppingEvent["search"],
    context: shoppingFields(e.context, true),
  };
}
export function interests(events: ShoppingEvent[], now = Date.now()): Map<string, Interest> {
  const result = new Map<string, Interest>();
  const seen = new Set<string>();
  for (const e of [...events].sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""))) {
    if (!e.listingId || seen.has(e.id)) continue;
    seen.add(e.id);
    const at = Date.parse(e.at ?? "");
    if (!Number.isFinite(at) || at > now + 60_000) continue;
    const row = result.get(e.listingId) ?? {
      listingId: e.listingId,
      score: 0,
      favorite: false,
      lastAt: 0,
      sessions: new Set<string>(),
      recentSessions: new Set<string>(),
      contactAt: 0,
      purchased: false,
      dismissed: false,
    };
    const age = now - at,
      decay = 2 ** (-age / (14 * 86400000));
    if (e.kind === "save") {
      row.favorite = true;
      row.dismissed = false;
      row.lastAt = at;
    }
    if (e.kind === "unsave") row.favorite = false;
    if (e.kind === "dismiss") row.dismissed = true;
    if (["contact", "inquiry"].includes(e.kind)) row.contactAt = Math.max(at, row.contactAt);
    if (e.kind === "purchase") row.purchased = true;
    if (
      age <= 30 * 86400000 &&
      ["view", "save", "inquiry", "purchase", "recommendation_click"].includes(e.kind)
    ) {
      if (e.kind !== "view" || !row.sessions.has(e.session)) {
        row.score +=
          (e.kind === "purchase"
            ? SHOPPING_WEIGHTS.purchase
            : e.kind === "inquiry"
              ? SHOPPING_WEIGHTS.inquiry
              : e.kind === "save"
                ? 0
                : e.kind === "view" && row.sessions.size
                  ? SHOPPING_WEIGHTS.repeat
                  : SHOPPING_WEIGHTS.view) * decay;
      }
      if (e.kind === "view") {
        row.sessions.add(e.session);
        if (age <= 7 * 86400000) row.recentSessions.add(e.session);
      }
      row.lastAt = Math.max(at, row.lastAt);
    }
    result.set(e.listingId, row);
  }
  for (const row of result.values()) {
    row.score += row.favorite ? SHOPPING_WEIGHTS.save : 0;
    row.recentSessions = new Set(
      events
        .filter(
          (e) =>
            e.listingId === row.listingId &&
            e.kind === "view" &&
            Date.parse(e.at ?? "") >= row.lastAt - 7 * 86400000 &&
            Date.parse(e.at ?? "") <= row.lastAt,
        )
        .map((e) => e.session),
    );
  }
  return result;
}
export function reminderStep(interest: Interest, now = Date.now()): number | null {
  if (
    interest.dismissed ||
    interest.purchased ||
    (!interest.favorite && interest.recentSessions.size < 2) ||
    now - interest.contactAt < 7 * 86400000
  )
    return null;
  const age = now - interest.lastAt;
  return age >= 7 * 86400000 ? 7 : age >= 72 * 3600000 ? 3 : age >= 24 * 3600000 ? 1 : null;
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function matchesShoppingSearch(
  card: ShoppingCard,
  search: Record<string, unknown>,
): boolean {
  const filters = {
    ...search,
    category: search.category ?? search.categorySlug ?? search.section,
    q: search.q ?? search.query ?? search.keyword,
    homeTab: search.homeTab ?? search.homeMode,
    priceMin: search.priceMin ?? search.minPrice,
    priceMax: search.priceMax ?? search.maxPrice,
  } as Record<string, unknown>;
  for (const key of ["category", "q", "homeTab"])
    if (filters[key] === "all" || filters[key] === "") delete filters[key];
  for (const key of ["priceMin", "priceMax"])
    if (filters[key] !== undefined) {
      const n = Number(String(filters[key]).replace(/[$,]/g, ""));
      if (Number.isFinite(n)) filters[key] = n;
      else delete filters[key];
    }
  if (
    search.location &&
    !`${card.city ?? ""} ${card.state ?? ""} ${card.region ?? ""}`
      .toLowerCase()
      .includes(String(search.location).toLowerCase())
  )
    return false;
  if (
    filters.homeTab &&
    card.home &&
    (card.home as Record<string, unknown>).mode !== filters.homeTab
  )
    return false;
  return matchesLandingCard(
    { ...card, city: card.city ?? "" } as unknown as ListingCardSummary,
    filters as ClassifiedBrowseInput,
  );
}
export function rankShopping(
  cards: ShoppingCard[],
  activity: ShoppingEvent[],
  vectors: Map<string, number[]> = new Map(),
  now = Date.now(),
  weights = { visual: 3, budget: 1, location: 0.5, freshness: 1 },
  similarities = new Map<string, number>(),
) {
  const profile = interests(activity, now);
  const seeds = [...profile.values()].filter((x) => !x.dismissed && x.score > 0);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const searches = activity.filter(
    (e) => e.kind === "search" && now - Date.parse(e.at ?? "") < 30 * 86400000,
  );
  return cards
    .filter((c) => !profile.get(c.id)?.dismissed && !profile.get(c.id)?.purchased)
    .map((card) => {
      let score = 0,
        total = 0,
        visual = 0,
        budget = 0,
        location = 0;
      for (const seed of seeds) {
        const reference = byId.get(seed.listingId);
        if (
          !reference ||
          reference.categorySlug !== card.categorySlug ||
          (reference.home as { mode?: string } | undefined)?.mode !==
            (card.home as { mode?: string } | undefined)?.mode
        )
          continue;
        const ratio =
          Math.min(reference.priceCents, card.priceCents) /
          Math.max(1, reference.priceCents, card.priceCents);
        const similar =
          similarities.get(`${reference.id}:${card.id}`) ??
          cosine(vectors.get(reference.id) ?? [], vectors.get(card.id) ?? []);
        total += seed.score;
        visual += Math.max(0, similar) * seed.score;
        budget += ratio * seed.score;
        location += (reference.city && reference.city === card.city ? 1 : 0) * seed.score;
        score +=
          seed.score *
          (1 +
            ratio * weights.budget +
            (reference.city && reference.city === card.city ? weights.location : 0) +
            Math.max(0, similar) * weights.visual);
      }
      for (const search of searches)
        if (matchesShoppingSearch(card, search.search ?? {}))
          score +=
            SHOPPING_WEIGHTS.search * 2 ** (-(now - Date.parse(search.at!)) / (14 * 86400000));
      score +=
        weights.freshness * Math.max(0, 1 - (now - Date.parse(card.createdAt)) / (30 * 86400000));
      return {
        card,
        score,
        features: {
          rank_visual: visual / Math.max(1, total),
          rank_budget: budget / Math.max(1, total),
          rank_location: location / Math.max(1, total),
          rank_freshness: Math.max(0, 1 - (now - Date.parse(card.createdAt)) / (30 * 86400000)),
        },
        reason: "Based on your shopping activity",
      };
    })
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
}
