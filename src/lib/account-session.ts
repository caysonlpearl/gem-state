type SessionAuth = {
  getSession(): Promise<{
    data: { session: { user: { id: string }; access_token: string } | null };
  }>;
  signOut(options: { scope: "local" | "global" }): Promise<{ error: unknown }>;
};

/** Recheck the owner after asynchronous revocation, before ending a session. */
export async function completeAccountSignOut({
  auth,
  expectedOwnerId,
  scope,
  revokeAll,
}: {
  auth: SessionAuth;
  expectedOwnerId: string | undefined;
  scope: "local" | "global";
  revokeAll: (token: string) => Promise<void>;
}) {
  const current = (await auth.getSession()).data.session;
  if (!expectedOwnerId || current?.user.id !== expectedOwnerId)
    throw Error("Your account changed. Please try again.");
  if (scope === "global") await revokeAll(current.access_token);
  const latest = (await auth.getSession()).data.session;
  if (latest?.user.id !== expectedOwnerId) throw Error("Your account changed. Please try again.");
  const result = await auth.signOut({ scope });
  if (result.error) throw result.error;
}

/** Website adapter for the same bearer-owned revocation endpoint as native. */
export function websiteAccountSignOut(
  auth: SessionAuth,
  expectedOwnerId: string | undefined,
  scope: "local" | "global" = "local",
) {
  return completeAccountSignOut({
    auth,
    expectedOwnerId,
    scope,
    revokeAll: async (token) => {
      const response = await fetch("/api/mobile/v1/devices/all", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw Error("Could not sign out of all devices. Please retry.");
    },
  });
}
