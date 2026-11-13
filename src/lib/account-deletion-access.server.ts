export type DeletionAccessDatabase = {
  from(table: "mobile_account_deletions"): {
    select(columns: "status"): {
      eq(
        column: "user_id",
        userId: string,
      ): {
        maybeSingle(): PromiseLike<{ data: { status: string } | null; error: unknown }>;
      };
    };
  };
};
export class AccountDeletionPending extends Error {
  constructor() {
    super("Your account deletion is pending. Please sign out; contact Bluebird if you need help.");
  }
}
/** A fresh account-scoped check: do not cache a permission that can be withdrawn. */
export async function accountDeletionPending(db: DeletionAccessDatabase, userId: string) {
  try {
    const result = await db
      .from("mobile_account_deletions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (
      result.error ||
      result.data === undefined ||
      (result.data !== null && typeof result.data.status !== "string")
    )
      throw new Error("Account controls are temporarily unavailable.");
    return result.data !== null;
  } catch {
    throw new Error("Account controls are temporarily unavailable.");
  }
}

export type AccountSessionDatabase = {
  rpc(
    name: "account_session_state",
    args: { _user: string; _session: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
export class AccountSessionUnavailable extends Error {
  constructor() {
    super("Unauthorized: Account is unavailable");
  }
}
/** Caller must first verify the JWT signature/expiry; identity and session are
 * then checked together in one indexed database read, without cross-request caching. */
export async function assertAccountSession(
  db: AccountSessionDatabase,
  userId: string,
  sessionId: unknown,
  allowPending = false,
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId) || typeof sessionId !== "string" || !uuid.test(sessionId))
    throw new AccountSessionUnavailable();
  let result;
  try {
    result = await db.rpc("account_session_state", { _user: userId, _session: sessionId });
  } catch {
    throw new Error("Account controls are temporarily unavailable.");
  }
  if (!result || result.error) throw new Error("Account controls are temporarily unavailable.");
  if (result.data === "unavailable") throw new AccountSessionUnavailable();
  if (result.data === "deletion_pending") {
    if (!allowPending) throw new AccountDeletionPending();
    return;
  }
  if (result.data !== "active") throw new Error("Account controls are temporarily unavailable.");
}
