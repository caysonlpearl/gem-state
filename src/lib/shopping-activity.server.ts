/* eslint-disable @typescript-eslint/no-explicit-any -- private, closed subject-scoped projections */
import { validShoppingId, type ShoppingEvent } from "./shopping-contract.ts";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const member = new RegExp("^u:(" + uuid + ")$", "i"),
  subjectPattern = new RegExp("^[ug]:" + uuid + "$", "i");
const unavailable = () => new Error("Shopping history could not be read. Please retry.");
/** Complete saved/choice reads; the browsing window deliberately samples its latest 1,500 events. */
async function pages(
  build: () => any,
  key: string,
  signal: AbortSignal,
  limit = 5000,
  sample = false,
) {
  const rows: any[] = [],
    seen = new Set<string>();
  let total: number | undefined;
  for (let offset = 0; offset < limit; offset += 500) {
    signal.throwIfAborted();
    const r = await build()
      .order(key)
      .range(offset, Math.min(offset + 499, limit - 1))
      .abortSignal(signal)
      .retry(false);
    signal.throwIfAborted();
    if (
      r.error !== null ||
      !Array.isArray(r.data) ||
      !Number.isSafeInteger(r.count) ||
      r.count < 0 ||
      (!sample && r.count > limit) ||
      (total !== undefined && total !== r.count)
    )
      throw unavailable();
    total = r.count;
    const expected = Math.min(r.count, limit);
    for (const row of r.data) {
      if (!row || typeof row[key] !== "string" || !row[key] || seen.has(row[key]))
        throw unavailable();
      seen.add(row[key]);
      rows.push(row);
    }
    if (rows.length > expected) throw unavailable();
    if (rows.length === expected) return rows;
    if (r.data.length !== Math.min(500, limit - offset)) throw unavailable();
  }
  throw unavailable();
}
/** Actual owned bookmarks are the authority for a member's favorite state.
 * Historical events remain evidence of views/contacts/outcomes, never a second bookmark database. */
export async function loadShoppingActivity(db: any, subject: string): Promise<ShoppingEvent[]> {
  if (!subjectPattern.test(subject)) throw unavailable();
  const owner = member.exec(subject)?.[1];
  const controller = new AbortController(),
    signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
  const all = async (work: PromiseLike<any>[]) => {
    const results = await Promise.allSettled(
      work.map((p) =>
        Promise.resolve(p).catch((e) => {
          controller.abort();
          throw e;
        }),
      ),
    );
    if (results.some((r) => r.status === "rejected")) throw unavailable();
    return results.map((r) => {
      if (r.status !== "fulfilled") throw unavailable();
      return r.value;
    });
  };
  async function privacy() {
    const [p, d] = await all([
      db
        .from("shopping_privacy")
        .select("subject,personalization,history_after")
        .eq("subject", subject)
        .abortSignal(signal)
        .retry(false)
        .maybeSingle(),
      owner
        ? db
            .from("mobile_account_deletions")
            .select("status")
            .eq("user_id", owner)
            .abortSignal(signal)
            .retry(false)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    signal.throwIfAborted();
    if (p.error !== null || d.error !== null || p.data === undefined || d.data === undefined)
      throw unavailable();
    if (d.data !== null || p.data === null || p.data.personalization === false) return null;
    if (
      p.data.subject !== subject ||
      p.data.personalization !== true ||
      !Number.isFinite(Date.parse(p.data.history_after))
    )
      throw unavailable();
    return Date.parse(p.data.history_after);
  }
  try {
    const after = await privacy();
    if (after === null) return [];
    const cutoff = new Date(Math.max(after, Date.now() - 90 * 86400000)).toISOString();
    const [history, choices] = await all([
      pages(
        () =>
          db
            .from("shopping_events")
            .select("id,subject,kind,listing_id,session_id,search,context,occurred_at", {
              count: "exact",
            })
            .eq("subject", subject)
            .gte("occurred_at", cutoff)
            .order("occurred_at", { ascending: false }),
        "id",
        signal,
        1500,
        true,
      ),
      pages(
        () =>
          db
            .from("shopping_choices")
            .select("subject,listing_id,dismissed,choice_at,purchased_at", { count: "exact" })
            .eq("subject", subject),
        "listing_id",
        signal,
      ),
    ]);
    // Read bookmark truth after slower history/choice pages, so a removal
    // during those reads is visible to the pre-delivery recheck.
    const favorites = await (owner
      ? pages(
          () =>
            db
              .rpc("shopping_saved_interests", { member_id: owner }, { count: "exact" })
              .select("listing_id,saved_at"),
          "listing_id",
          signal,
        )
      : pages(
          () =>
            db
              .from("shopping_favorites")
              .select("subject,listing_id,saved_at", { count: "exact" })
              .eq("subject", subject),
          "listing_id",
          signal,
        ));
    if (
      history.some((r: any) => r.subject !== subject) ||
      choices.some((r: any) => r.subject !== subject) ||
      (!owner && favorites.some((r: any) => r.subject !== subject))
    )
      throw unavailable();
    if (
      favorites.some(
        (r: any) => !validShoppingId(r.listing_id) || !Number.isFinite(Date.parse(r.saved_at)),
      )
    )
      throw unavailable();
    const saved = new Set<string>(favorites.map((r: any) => r.listing_id));
    const events: ShoppingEvent[] = history
      .filter((e: any) => {
        if (!owner) return true;
        // Bookmark state wins over late or reordered client toggles. Unsave
        // has no independent ranking weight; absence already removes the boost.
        if (e.kind === "unsave") return false;
        return e.kind !== "save" || saved.has(e.listing_id);
      })
      .map((e: any) => ({
        id: e.id,
        kind: e.kind,
        listingId: e.listing_id,
        session: e.session_id,
        search: e.search,
        context: e.context,
        at: e.occurred_at,
      }));
    for (const row of favorites)
      if (Date.parse(row.saved_at) > after)
        events.push({
          id: `${owner ? "existing" : "favorite"}:${row.listing_id}`,
          kind: "save",
          listingId: row.listing_id,
          session: "favorite",
          at: row.saved_at,
        });
    const purchased = new Set(events.filter((e) => e.kind === "purchase").map((e) => e.listingId));
    for (const row of choices) {
      if (!validShoppingId(row.listing_id)) throw unavailable();
      if (row.dismissed) {
        if (!Number.isFinite(Date.parse(row.choice_at))) throw unavailable();
        if (Date.parse(row.choice_at) >= after)
          events.push({
            id: `dismissed:${row.listing_id}`,
            kind: "dismiss",
            listingId: row.listing_id,
            session: "choice",
            at: row.choice_at,
          });
      }
      if (row.purchased_at && !purchased.has(row.listing_id)) {
        if (!Number.isFinite(Date.parse(row.purchased_at))) throw unavailable();
        if (Date.parse(row.purchased_at) >= after)
          events.push({
            id: `purchased:${row.listing_id}`,
            kind: "purchase",
            listingId: row.listing_id,
            session: "choice",
            at: row.purchased_at,
          });
      }
    }
    const final = await privacy();
    signal.throwIfAborted();
    if (final === null || final !== after) return [];
    return events;
  } catch {
    controller.abort();
    throw unavailable();
  }
}
