/** Browse emits mutually exclusive nonempty and empty result-page events. */
export function searchOutcomeSummary(withResults: number, withoutResults: number) {
  const count = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  const nonempty = count(withResults);
  const empty = count(withoutResults);
  const total = nonempty + empty;
  return {
    total,
    emptyRate:
      total > 0 ? `${Math.round((empty / total) * 1000) / 10}% (${empty} of ${total})` : null,
  };
}
