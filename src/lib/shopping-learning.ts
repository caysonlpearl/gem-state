/** Small, testable pairwise ranker; no LLM, demographic attributes or private content. */
export type RankingWeights = {
  visual: number;
  budget: number;
  location: number;
  freshness: number;
};
export const BASELINE_WEIGHTS: RankingWeights = {
  visual: 3,
  budget: 1,
  location: 0.5,
  freshness: 1,
};
export type RankingObservation = {
  subject: string;
  session: string;
  listing: string;
  features: number[];
  contact: boolean;
};
const keys = ["visual", "budget", "location", "freshness"] as const;
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function split(subject: string) {
  let h = 0;
  for (const c of subject) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 3 === 0;
}
function pairs(rows: RankingObservation[]) {
  const groups = new Map<string, RankingObservation[]>();
  for (const row of rows) {
    const key = `${row.subject}:${row.session}`;
    const group = groups.get(key) ?? [];
    if (!group.some((r) => r.listing === row.listing)) group.push(row);
    groups.set(key, group);
  }
  const output: number[][] = [];
  for (const group of groups.values())
    for (const positive of group.filter((r) => r.contact))
      for (const negative of group.filter((r) => !r.contact).slice(0, 20))
        output.push(positive.features.map((v, i) => v - negative.features[i]));
  return output;
}
export function evaluateShoppingRanking(
  rows: RankingObservation[],
  baseline: RankingWeights = BASELINE_WEIGHTS,
) {
  const train = pairs(rows.filter((r) => !split(r.subject))),
    test = pairs(rows.filter((r) => split(r.subject)));
  const contacts = new Set(rows.filter((r) => r.contact).map((r) => r.subject)).size;
  const old = keys.map((k) => baseline[k]),
    candidate = [...old];
  if (train.length >= 200 && test.length >= 100 && contacts >= 30) {
    for (let pass = 0; pass < 12; pass++)
      for (const features of train) {
        const step = 0.02 / (1 + Math.exp(Math.max(-20, Math.min(20, dot(candidate, features)))));
        for (let i = 0; i < 4; i++)
          candidate[i] = Math.max(
            0.1,
            Math.min(6, candidate[i] + step * features[i] - 0.0001 * (candidate[i] - old[i])),
          );
      }
  }
  const accuracy = (w: number[]) =>
    test.length
      ? test.reduce((sum, f) => sum + (dot(w, f) > 0 ? 1 : dot(w, f) === 0 ? 0.5 : 0), 0) /
        test.length
      : 0;
  const before = accuracy(old),
    after = accuracy(candidate),
    sufficient = train.length >= 200 && test.length >= 100 && contacts >= 30;
  return {
    baseline: { weights: baseline, accuracy: before },
    challenger: {
      weights: Object.fromEntries(keys.map((key, i) => [key, candidate[i]])) as RankingWeights,
      accuracy: after,
      trainingPairs: train.length,
      testPairs: test.length,
    },
    outcomes: contacts,
    promoted: sufficient && after >= before + 0.03,
  };
}
