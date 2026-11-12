/** Monthly principal-and-interest estimate in cents; APR is a percent (7.5 = 7.5%). */
export function loanPaymentCents(
  principalCents: number,
  months: number,
  aprPercent: number,
): number | null {
  if (
    !Number.isSafeInteger(principalCents) ||
    principalCents < 0 ||
    !Number.isSafeInteger(months) ||
    months <= 0 ||
    !Number.isFinite(aprPercent) ||
    aprPercent < 0 ||
    aprPercent > 100
  )
    return null;
  if (principalCents === 0) return 0;
  if (aprPercent === 0) return Math.round(principalCents / months);
  const rate = aprPercent / 1200;
  return Math.round((principalCents * rate) / -Math.expm1(-months * Math.log1p(rate)));
}
