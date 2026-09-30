/**
 * Normalize optional numeric query values at the browser/server boundary.
 * Empty form controls must stay absent; Number("") would otherwise turn them
 * into zero and silently narrow a search.
 */
export function optionalNonNegativeNumber(value: unknown): number | undefined {
  if (value == null || (typeof value === "string" && value.trim() === "")) return undefined;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function isInvertedRange(min: number | undefined, max: number | undefined) {
  return min != null && max != null && min > max;
}

/**
 * Job pay mixes units. For sorting only, hourly pay is annualized at 2,080
 * hours; salary and commission are treated as stated annual amounts, while a
 * contract amount remains a one-time stated amount. The UI labels the source
 * unit, so this ordering is predictable without pretending the units are
 * identical.
 */
export function comparableJobPay(payType: unknown, payMin: unknown) {
  const amount = optionalNonNegativeNumber(payMin);
  if (amount == null) return Number.POSITIVE_INFINITY;
  return payType === "Hourly" ? amount * 2080 : amount;
}
