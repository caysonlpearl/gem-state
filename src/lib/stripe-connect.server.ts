import { retrieveModeVerifiedAccount } from "./connect-account-mode.server";

export type ConnectedAccount = {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  livemode?: boolean;
};

export type StripeConnectMode = "test" | "live";

class StripeConnectRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StripeConnectRequestError";
  }
}

function stripeSecret() {
  return process.env["STRIPE_SECRET_KEY"] ?? "";
}

async function stripeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe Connect is not configured on this deployment yet.");
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new StripeConnectRequestError(
      payload.error?.message ?? "Stripe request failed.",
      response.status,
      payload.error?.code,
    );
  }
  return payload;
}

export function stripeConnectConfigured() {
  return Boolean(stripeSecret());
}

export function stripeConnectMode(): StripeConnectMode | null {
  const secret = stripeSecret();
  if (secret.startsWith("sk_live_") || secret.startsWith("rk_live_")) return "live";
  if (secret.startsWith("sk_test_") || secret.startsWith("rk_test_")) return "test";
  return null;
}

export function stripeAccountMatchesCurrentMode(storedMode: unknown) {
  const currentMode = stripeConnectMode();
  return currentMode != null && storedMode === currentMode;
}

export function connectedAccountMatchesCurrentMode(account: ConnectedAccount) {
  const currentMode = stripeConnectMode();
  if (!currentMode || typeof account.livemode !== "boolean") return false;
  return account.livemode === (currentMode === "live");
}

/**
 * A Connect account only exists in the Stripe mode where it was created. This
 * is intentionally narrow: authentication, rate-limit and network failures
 * must surface instead of silently creating another payout identity.
 */
export function isUnusableConnectedAccountError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error instanceof StripeConnectRequestError && error.code === "resource_missing") return true;
  return /(?:test account.*testmode key|live account.*livemode key|test mode account link.*live mode|live mode account link.*test mode|no such account)/i.test(
    error.message,
  );
}

export async function createParkVaultConnectedAccount(input: {
  email: string;
  userId: string;
  role: "seller" | "shopper";
  productDescription: string;
}) {
  const body = new URLSearchParams({
    type: "express",
    country: "US",
    email: input.email,
    "capabilities[transfers][requested]": "true",
    "business_profile[product_description]": input.productDescription,
    "metadata[parkvault_user_id]": input.userId,
    "metadata[parkvault_role]": input.role,
  });
  return stripeRequest<{ id: string }>("/v1/accounts", { method: "POST", body });
}

export async function createParkVaultOnboardingLink(input: {
  accountId: string;
  returnPath: string;
  requestOrigin?: string;
}) {
  const configuredOrigin = process.env["PARKVAULT_SITE_URL"] ?? "";
  const origin = configuredOrigin || input.requestOrigin || "";
  if (!origin.startsWith("https://")) {
    throw new Error("Stripe onboarding requires the deployed HTTPS site URL.");
  }
  return stripeRequest<{ url: string }>("/v1/account_links", {
    method: "POST",
    body: new URLSearchParams({
      account: input.accountId,
      refresh_url: `${origin}${input.returnPath}?stripe=refresh`,
      return_url: `${origin}${input.returnPath}?stripe=return`,
      type: "account_onboarding",
      "collection_options[fields]": "eventually_due",
    }),
  });
}

export function getParkVaultConnectedAccount(accountId: string) {
  return retrieveModeVerifiedAccount<ConnectedAccount>(accountId, stripeRequest);
}
