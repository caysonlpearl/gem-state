import { SHOPPING_RANKING_SCHEMA, shoppingRankingVersion } from "./shopping-contract.ts";
/** Small pairwise challenger; private content and device characteristics are not inputs. */
export type RankingWeights = {
  visual: number;
  budget: number;
  location: number;
  freshness: number;
  engagement?: number;
};
export const BASELINE_WEIGHTS = {
  visual: 3,
  budget: 1,
  location: 0.5,
  freshness: 1,
  engagement: 0,
};
export const RANKING_KEYS = ["visual", "budget", "location", "freshness", "engagement"] as const;
export type RankingObservation = {
  subject: string;
  session: string;
  listing: string;
  features: number[];
  intent: number;
  batch: string;
  contact: boolean;
};
export function rankingWeights(input?: RankingWeights): Required<RankingWeights> {
  return Object.fromEntries(
    RANKING_KEYS.map((key) => {
      const value = input?.[key] ?? BASELINE_WEIGHTS[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 6)
        throw Error("Ranking weights require review.");
      return [key, value];
    }),
  ) as Required<RankingWeights>;
}
const unit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
/** Old app versions omit unknown fields. Exclude incomplete or differently ranked
 * exposures rather than manufacturing zero-valued evidence for a new feature. */
export function rankingObservations(rows: unknown[], version: string): RankingObservation[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const raw = row as Record<string, unknown>;
    if (
      typeof raw.subject !== "string" ||
      typeof raw.session !== "string" ||
      typeof raw.listing !== "string" ||
      typeof raw.contact !== "boolean" ||
      !raw.context ||
      typeof raw.context !== "object" ||
      Array.isArray(raw.context)
    )
      return [];
    const context = raw.context as Record<string, unknown>;
    if (!context || context.model !== shoppingRankingVersion(version)) return [];
    const features = RANKING_KEYS.map((key) => context[`rank_${key}`]);
    if (
      !features.every(unit) ||
      !unit(context.rank_intent) ||
      typeof context.rank_batch !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        context.rank_batch,
      )
    )
      return [];
    return [
      {
        subject: raw.subject,
        session: raw.session,
        listing: raw.listing,
        features,
        intent: context.rank_intent,
        batch: context.rank_batch,
        contact: raw.contact,
      },
    ];
  });
}
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function split(subject: string) {
  let h = 0;
  for (const c of subject) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 3 === 0;
}
function pairs(rows: RankingObservation[]) {
  const groups = new Map<string, RankingObservation[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.subject, row.session, row.batch]);
    const group = groups.get(key) ?? [];
    if (!group.some((r) => r.listing === row.listing)) group.push(row);
    groups.set(key, group);
  }
  const output: { features: number[]; intent: number }[] = [];
  for (const group of groups.values())
    for (const positive of group.filter((r) => r.contact))
      for (const negative of group.filter((r) => !r.contact).slice(0, 20))
        output.push({
          features: positive.features.map((v, i) => v - negative.features[i]),
          intent: positive.intent - negative.intent,
        });
  return output;
}
export function evaluateShoppingRanking(
  rows: RankingObservation[],
  baseline: RankingWeights = BASELINE_WEIGHTS,
) {
  rows = rows.filter(
    (row) =>
      typeof row.subject === "string" &&
      row.subject.length > 0 &&
      typeof row.session === "string" &&
      row.session.length > 0 &&
      typeof row.listing === "string" &&
      row.listing.length > 0 &&
      typeof row.contact === "boolean" &&
      typeof row.batch === "string" &&
      row.batch.length > 0 &&
      unit(row.intent) &&
      Array.isArray(row.features) &&
      row.features.length === RANKING_KEYS.length &&
      row.features.every(unit),
  );
  const train = pairs(rows.filter((r) => !split(r.subject))),
    test = pairs(rows.filter((r) => split(r.subject)));
  const contacts = new Set(rows.filter((r) => r.contact).map((r) => r.subject)).size;
  const weights = rankingWeights(baseline);
  const old = RANKING_KEYS.map((k) => weights[k]),
    candidate = [...old];
  const sufficient = train.length >= 200 && test.length >= 100 && contacts >= 30;
  if (sufficient) {
    for (let pass = 0; pass < 12; pass++)
      for (const pair of train) {
        const margin = dot(candidate, pair.features) + pair.intent;
        const step = 0.02 / (1 + Math.exp(Math.max(-20, Math.min(20, margin))));
        for (let i = 0; i < RANKING_KEYS.length; i++)
          candidate[i] = Math.max(
            0,
            Math.min(6, candidate[i] + step * pair.features[i] - 0.0001 * (candidate[i] - old[i])),
          );
      }
  }
  const accuracy = (w: number[]) =>
    test.length
      ? test.reduce((sum, pair) => {
          const margin = dot(w, pair.features) + pair.intent;
          return sum + (margin > 0 ? 1 : margin === 0 ? 0.5 : 0);
        }, 0) / test.length
      : 0;
  const before = accuracy(old),
    after = accuracy(candidate);
  return {
    baseline: { weights, accuracy: before, schema: SHOPPING_RANKING_SCHEMA },
    challenger: {
      weights: Object.fromEntries(
        RANKING_KEYS.map((key, i) => [key, candidate[i]]),
      ) as Required<RankingWeights>,
      accuracy: after,
      trainingPairs: train.length,
      testPairs: test.length,
      schema: SHOPPING_RANKING_SCHEMA,
      eligible: sufficient && after >= before + 0.03,
    },
    outcomes: contacts,
    // Eligibility is evidence for an administrator, never an automatic model change.
    promoted: false,
  };
}
