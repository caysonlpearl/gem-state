import { MOBILE_POLICY_VERSION } from "./mobile-contract.ts";

/** Website acceptance alone cannot opt an existing member into phone alerts.
 * The projection keeps the API shape understood by already-installed apps. */
export function mobileShoppingConsent(account: Record<string, unknown> | null | undefined) {
  const accepted =
    account?.terms_version === MOBILE_POLICY_VERSION &&
    account.mobile_terms_version === MOBILE_POLICY_VERSION &&
    typeof account.mobile_terms_accepted_at === "string" &&
    Number.isFinite(Date.parse(account.mobile_terms_accepted_at));
  return {
    terms_version: accepted ? MOBILE_POLICY_VERSION : null,
    shopping_alerts: Boolean(
      accepted && account?.shopping_alerts === true && account.mobile_shopping_alerts === true,
    ),
  };
}
