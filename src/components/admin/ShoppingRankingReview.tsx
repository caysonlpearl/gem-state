import { useState } from "react";
import { RANKING_KEYS, type RankingWeights } from "@/lib/shopping-learning";
import { SHOPPING_RANKING_SCHEMA } from "@/lib/shopping-contract";
import { Button } from "@/components/ui/button";
export type ShoppingRankingEvaluation = {
  week: string;
  outcomes: number;
  promoted: boolean;
  baseline: { weights?: RankingWeights; accuracy?: number; schema?: string; modelVersion?: string };
  challenger: {
    weights?: RankingWeights;
    accuracy?: number;
    schema?: string;
    eligible?: boolean;
    trainingPairs?: number;
    testPairs?: number;
    reviewedVersion?: string;
  };
};
export function ShoppingRankingReview({
  evaluation: e,
  activeVersion,
  ready,
  learning,
  pending,
  onApply,
}: {
  evaluation: ShoppingRankingEvaluation;
  activeVersion: string;
  ready: boolean;
  learning: boolean;
  pending: boolean;
  onApply: (data: { week: string; expectedVersion: string }) => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const current = e.baseline.modelVersion === activeVersion;
  const eligible =
    !e.promoted &&
    e.challenger.eligible === true &&
    e.baseline.schema === SHOPPING_RANKING_SCHEMA &&
    e.challenger.schema === SHOPPING_RANKING_SCHEMA;
  const percent = (value?: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? `${(value * 100).toFixed(1)}%`
      : "Unavailable";
  return (
    <article className="border-t py-4">
      <h3 className="font-semibold">Week of {e.week}</h3>
      <p className="mt-1 text-sm">
        {e.outcomes} shoppers with verified outcomes ·{" "}
        {e.promoted
          ? e.challenger.reviewedVersion
            ? "Reviewed challenger applied"
            : "Prior challenger applied"
          : "Baseline retained"}
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer underline underline-offset-4 focus-visible:outline focus-visible:outline-2">
          Review ranking evidence
        </summary>
        <div className="mt-3 max-w-2xl space-y-3">
          <p>
            Held-out pairwise accuracy: {percent(e.baseline.accuracy)} baseline →{" "}
            {percent(e.challenger.accuracy)} challenger. {e.challenger.trainingPairs ?? 0} training
            pairs · {e.challenger.testPairs ?? 0} test pairs.
          </p>
          <p className="text-muted-foreground">
            This is an offline comparison of contacted and uncontacted listings. It does not
            establish an increase in seller contacts or sales. The live comparison group remains in
            place.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            {RANKING_KEYS.map((key) => (
              <div key={key} className="contents">
                <dt className="capitalize">{key === "engagement" ? "Viewing and photos" : key}</dt>
                <dd>
                  {e.baseline.weights?.[key]?.toFixed(2) ?? "—"} →{" "}
                  {e.challenger.weights?.[key]?.toFixed(2) ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          {e.promoted ? (
            <p>Applied as {e.challenger.reviewedVersion ?? "a prior model"}.</p>
          ) : !eligible ? (
            <p className="text-muted-foreground">
              Evidence is not sufficient for a reviewed change.
            </p>
          ) : !current ? (
            <p className="text-muted-foreground">
              The active model has changed. A new evaluation is required.
            </p>
          ) : !ready ? (
            <p className="text-muted-foreground">
              Applying a candidate is unavailable until the ranking-review database update is
              installed and verified.
            </p>
          ) : !learning ? (
            <p className="text-muted-foreground">
              Weekly ranking evaluation is paused. Resume it before applying a candidate.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (reviewed && !pending) onApply({ week: e.week, expectedVersion: activeVersion });
              }}
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={reviewed}
                  disabled={pending}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                <span>
                  I reviewed the evidence and approve these weights for the live recommendation
                  model.
                </span>
              </label>
              <Button type="submit" disabled={!reviewed || pending}>
                {pending ? "Applying reviewed challenger…" : "Apply reviewed challenger"}
              </Button>
            </form>
          )}
        </div>
      </details>
    </article>
  );
}
