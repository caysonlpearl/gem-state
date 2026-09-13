// Accounts v1 has no livemode field. The account-scoped balance does.
export async function retrieveModeVerifiedAccount<T>(
  accountId: string,
  request: <R>(path: string, init?: RequestInit) => Promise<R>,
): Promise<T & { livemode: boolean }> {
  const account = await request<T>(`/v1/accounts/${encodeURIComponent(accountId)}`);
  const balance = await request<{ livemode: boolean }>("/v1/balance", {
    headers: { "Stripe-Account": accountId },
  });
  if (typeof balance.livemode !== "boolean") {
    throw new Error("Stripe payout account mode could not be verified. Please try again.");
  }
  return { ...account, livemode: balance.livemode };
}
