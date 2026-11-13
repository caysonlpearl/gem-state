import { accountDeletionPending } from "./account-deletion-access.server.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- shared private queue rows */
import { interests, reminderStep, matchesShoppingSearch } from "./shopping-contract.ts";
import {
  shoppingPermission,
  shoppingActivity,
  shoppingExternalEligibility,
} from "./shopping.server.ts";
export async function shoppingReminderProgress(db: any, subject: string) {
  const result = await db
    .from("shopping_choices")
    .select("listing_id,reminder_anchor,reminder_step")
    .eq("subject", subject)
    .limit(1500);
  if (result.error) throw Error("Reminder history unavailable.");
  return new Map<string, any>((result.data ?? []).map((row: any) => [row.listing_id, row]));
}
export function completedReminder(progress: any, anchor: number, step: number) {
  return (
    progress && Number(progress.reminder_anchor) >= anchor && Number(progress.reminder_step) >= step
  );
}
export async function shoppingDeliveryCandidates(
  db: any,
  delivery: any,
  statuses = ["processing"],
) {
  if (await accountDeletionPending(db, delivery.user_id))
    return { account: { delivery_blocked: true }, permission: null, eligible: [] };
  const [accountResult, permission, queued, searches, prefs] = await Promise.all([
    db.from("shopping_accounts").select("*").eq("user_id", delivery.user_id).single(),
    shoppingPermission(db, `u:${delivery.user_id}`),
    db
      .from("shopping_queue")
      .select("*")
      .in("id", delivery.queue_ids)
      .eq("user_id", delivery.user_id)
      .in("status", statuses),
    db
      .from("saved_searches")
      .select("id,search,paused,email_alerts,created_at")
      .eq("user_id", delivery.user_id)
      .limit(500),
    db
      .from("account_notification_preferences")
      .select("saved_search_matches")
      .eq("user_id", delivery.user_id)
      .maybeSingle(),
  ]);
  if (accountResult.error || queued.error || searches.error || prefs.error)
    throw Error("Delivery preferences unavailable.");
  const account = accountResult.data;
  const items = queued.data ?? [];
  if (!items.length) return { account, permission, eligible: [] };
  const inventory = await db
    .from("shopping_inventory")
    .select("*")
    .in("listing_id", [...new Set(items.map((i: any) => i.listing_id))]);
  if (inventory.error) throw Error("Current inventory unavailable.");
  const nativeIds = inventory.data
    .filter((r: any) => /^[0-9a-f-]{36}$/i.test(r.listing_id))
    .map((r: any) => r.listing_id);
  const native = nativeIds.length
    ? await db
        .from("asks")
        .select("id,products!inner(status)")
        .in("id", nativeIds)
        .eq("status", "active")
        .eq("is_demo", false)
        .not("approved_at", "is", null)
        .gt("expires_at", new Date().toISOString())
        .eq("products.status", "published")
    : { data: [] };
  if (native.error) throw Error("Native availability unavailable.");
  const liveNative = new Set(native.data.map((r: any) => r.id)),
    byId = new Map<string, any>(inventory.data.map((r: any) => [r.listing_id, r]));
  const profile = interests(
    permission?.personalization ? await shoppingActivity(db, `u:${delivery.user_id}`) : [],
  );
  const progress = await shoppingReminderProgress(db, `u:${delivery.user_id}`);
  const eligible: any[] = [];
  for (const item of items) {
    if (Date.parse(item.created_at) < Date.parse(account.history_after)) continue;
    if (!item.requested && (account.shopping_alerts !== true || !permission?.personalization))
      continue;
    const inv = byId.get(item.listing_id);
    if (
      !inv ||
      Date.parse(inv.valid_until) <= Date.now() ||
      (nativeIds.includes(item.listing_id) && !liveNative.has(item.listing_id))
    )
      continue;
    const interest = profile.get(item.listing_id);
    if (interest?.dismissed || interest?.purchased) continue;
    if (
      item.kind === "reminder" &&
      (!interest ||
        (completedReminder(
          progress.get(item.listing_id),
          item.payload.interest_at,
          item.payload.step,
        ) &&
          !(
            statuses.includes("sent") &&
            item.status === "sent" &&
            Number(progress.get(item.listing_id)?.reminder_anchor) === item.payload.interest_at &&
            Number(progress.get(item.listing_id)?.reminder_step) === item.payload.step
          )) ||
        !reminderStep(interest) ||
        interest.contactAt > Date.now() - 7 * 86400000 ||
        interest.lastAt !== item.payload.interest_at)
    )
      continue;
    if (
      item.kind === "price_drop" &&
      (inv.price_version !== item.payload.price_version ||
        inv.price_cents >= item.payload.previous_price_cents)
    )
      continue;
    let email = true;
    if (item.requested) {
      const matching = searches.data.filter(
        (s: any) =>
          item.payload.search_ids?.includes(s.id) &&
          !s.paused &&
          (!account.suppressed_at ||
            Date.parse(s.created_at) > Date.parse(account.suppressed_at)) &&
          matchesShoppingSearch(inv.card, s.search ?? {}),
      );
      if (!matching.length) continue;
      email =
        matching.some((s: any) => s.email_alerts) && prefs.data?.saved_search_matches !== false;
    }
    eligible.push({ ...item, card: inv.card, email });
  }
  const allowed = await shoppingExternalEligibility(
    db,
    eligible.map((item) => item.listing_id),
  );
  return { account, permission, eligible: eligible.filter((item) => allowed.has(item.listing_id)) };
}
