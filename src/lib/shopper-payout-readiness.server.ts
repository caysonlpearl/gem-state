import {
  stripeAccountMatchesCurrentMode,
  getParkVaultConnectedAccount,
} from "./stripe-connect.server";

// The DB gate enforces stored readiness; this check also verifies the account
// with Stripe in the deployment's current mode before collecting payment.
export async function requireShopperPayoutReady(admin: any, shopperId: string) {
  const { data: profile, error } = await admin
    .from("shopper_service_profiles")
    .select("stripe_account_id,stripe_account_mode,stripe_details_submitted,stripe_payouts_enabled")
    .eq("shopper_id", shopperId)
    .maybeSingle();
  if (
    error ||
    !profile?.stripe_account_id ||
    !profile.stripe_details_submitted ||
    !profile.stripe_payouts_enabled ||
    !stripeAccountMatchesCurrentMode(profile.stripe_account_mode)
  ) {
    throw new Error("This shopper must finish payout setup before receiving paid work.");
  }
  const account = await getParkVaultConnectedAccount(profile.stripe_account_id);
  if (!account.details_submitted || !account.payouts_enabled) {
    throw new Error("This shopper's Stripe payout account is not ready for paid work.");
  }
}
