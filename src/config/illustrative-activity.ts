// Presentation-only data. Never import this module into transaction/server code.
// This switch controls BOTH the disclosure and all illustrative records.
export const ILLUSTRATIVE_ACTIVITY = true;
const AS_OF = Date.UTC(2026, 8, 6, 12);
const DAY = 86400000;
const iso = (time: number) => new Date(time).toISOString();
export function illustrativeActivity(input: {
  id: string;
  releaseDate: string | null;
  retailPriceCents: number | null;
  resorts: { code: string; name: string }[];
}) {
  if (!ILLUSTRATIVE_ACTIVITY) return null;
  let seed = 0;
  for (const char of input.id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const count = 10 + (seed % 21);
  const base = input.retailPriceCents && input.retailPriceCents > 0 ? input.retailPriceCents : 4500;
  const release = input.releaseDate ? Date.parse(input.releaseDate) : NaN;
  const start = Number.isFinite(release)
    ? Math.min(AS_OF, Math.max(release, AS_OF - 60 * DAY))
    : AS_OF - 60 * DAY;
  const sales = Array.from({ length: count }, (_, i) => ({
    priceCents: Math.round(base * (1.05 + ((seed + i * 17) % 41) / 100)),
    currency: "USD",
    origin: "in_hand" as const,
    soldAt: iso(AS_OF - ((AS_OF - start) * i) / Math.max(1, count - 1)),
  }));
  const history = sales
    .slice()
    .reverse()
    .map((sale) => ({
      capturedOn: sale.soldAt.slice(0, 10),
      lowestAskCents: sale.priceCents + 200,
      highestBidCents: Math.max(100, sale.priceCents - 500),
      lowestSourcingAskCents: base + 1000,
      lastSaleCents: sale.priceCents,
    }));
  const resort = input.resorts[0];
  const recentRelease =
    Number.isFinite(release) && release <= AS_OF && release >= AS_OF - 730 * DAY;
  const end = Math.min(AS_OF, release + 45 * DAY);
  const sightings =
    recentRelease && resort
      ? Array.from({ length: 3 + (seed % 4) }, (_, i) => ({
          id: `illustrative-${input.id}-${i}`,
          locationName: resort.name,
          parkName: "",
          resortCode: resort.code,
          seenAt: iso(release + ((end - release) * i) / 6),
          availability: "in_stock" as const,
          priceCents: base,
          confirmationCount: 0,
          note: null,
        })).reverse()
      : [];
  return { sales, history, sightings };
}
export type IllustrativeActivity = NonNullable<ReturnType<typeof illustrativeActivity>>;
