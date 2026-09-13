/** Keep sandbox checkout tax-free; enable automatic tax only for a known live key. */
export function automaticTaxForStripeKey(secret: string): boolean {
  const key = secret.trim();
  if (/^(sk|rk)_live_/.test(key)) return true;
  if (/^(sk|rk)_test_/.test(key)) return false;
  throw new Error("Stripe payment mode is not configured correctly.");
}
