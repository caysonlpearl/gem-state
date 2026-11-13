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
export async function assertAccountAvailable(db: DeletionAccessDatabase, userId: string) {
  if (await accountDeletionPending(db, userId)) throw new AccountDeletionPending();
}
