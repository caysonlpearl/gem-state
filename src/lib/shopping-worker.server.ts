/* eslint-disable @typescript-eslint/no-explicit-any -- private migration-backed queue */
import {
  interests,
  matchesShoppingSearch,
  reminderStep,
  type ShoppingCard,
  type ShoppingEvent,
} from "./shopping-contract";
import {
  shoppingActivity,
  shoppingControls,
  shoppingDb,
  queueShopping,
  syncShoppingInventory,
  shoppingHoldout,
  shoppingPermission,
} from "./shopping.server";
import { sendTemplateEmail } from "./email-templates/send-email";
import { brand } from "@/config/brand";

async function all(db: any, table: string, selection = "*") {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await db
      .from(table)
      .select(selection)
      .order(
        table === "shopping_accounts"
          ? "user_id"
          : table === "shopping_inventory"
            ? "listing_id"
            : "id",
      )
      .range(offset, offset + 499);
    if (r.error) throw Error(`Shopping ${table} read failed.`);
    rows.push(...r.data);
    if (r.data.length < 500) break;
  }
  return rows;
}
export async function shoppingAvailable(db: any, row: any) {
  if (!row || Date.parse(row.valid_until) <= Date.now()) return false;
  if (/^[0-9a-f-]{36}$/i.test(row.listing_id)) {
    const r = await db
      .from("asks")
      .select("id,products!inner(status)")
      .eq("id", row.listing_id)
      .eq("status", "active")
      .eq("is_demo", false)
      .not("approved_at", "is", null)
      .gt("expires_at", new Date().toISOString())
      .eq("products.status", "published")
      .maybeSingle();
    return !r.error && Boolean(r.data);
  }
  return true;
}
export async function generateShoppingAlerts(db: any) {
  const controls = await shoppingControls(db),
    now = Date.now();
  const [accounts, searches, inventory] = await Promise.all([
    all(db, "shopping_accounts"),
    all(db, "saved_searches"),
    all(db, "shopping_inventory"),
  ]);
  const cards = inventory.filter((r) => Date.parse(r.valid_until) > now),
    byId = new Map(cards.map((r) => [r.listing_id, r]));
  const users = new Set<string>([
    ...accounts.filter((a) => a.shopping_alerts === true).map((a) => a.user_id),
    ...searches.filter((s) => !s.paused).map((s) => s.user_id),
  ]);
  let queued = 0;
  for (const userId of users) {
    const account = accounts.find((a) => a.user_id === userId);
    const subject = `u:${userId}`;
    const holdout = await shoppingHoldout(db, subject);
    const permission = await shoppingPermission(db, subject);
    const activity =
      account?.shopping_alerts === true && permission?.personalization
        ? await shoppingActivity(db, subject)
        : [];
    const candidates: any[] = [];
    const add = async (_db: any, row: any) => {
      candidates.push(row);
    };
    const profile = interests(activity, now);
    for (const row of cards) {
      const matching = searches.filter(
        (s) =>
          s.user_id === userId &&
          !s.paused &&
          (!account?.suppressed_at ||
            Date.parse(s.created_at) > Date.parse(account.suppressed_at)) &&
          Date.parse(row.first_seen_at) >
            Math.max(
              Date.parse(s.created_at),
              Date.parse(controls.catalog_ready_at ?? new Date(now).toISOString()),
            ) &&
          matchesShoppingSearch(row.card, s.search ?? {}),
      );
      if (matching.length) {
        await add(db, {
          user_id: userId,
          listing_id: row.listing_id,
          kind: "match",
          event_key: "match",
          requested: true,
          payload: { search_ids: matching.map((s) => s.id) },
        });
        queued++;
      }
    }
    if (account?.shopping_alerts === true) {
      if (!holdout && activity.length) {
        const { rankShopping } = await import("./shopping-contract");
        const ranked = rankShopping(
          cards.map((r) => r.card),
          activity,
        ).filter(
          (r) =>
            r.score >= 15 &&
            !profile.has(r.card.id) &&
            Date.parse(byId.get(r.card.id)?.first_seen_at ?? "") >
              Math.max(
                Date.parse(controls.catalog_ready_at ?? new Date(now).toISOString()),
                now - 86400000,
              ),
        );
        for (const item of ranked.slice(0, 2))
          await add(db, {
            user_id: userId,
            listing_id: item.card.id,
            kind: "alternative",
            event_key: "alternative:new",
            payload: {},
          });
      }
      for (const interest of profile.values()) {
        const row = byId.get(interest.listingId);
        if (!row || interest.dismissed || interest.purchased) continue;
        if (
          row.previous_price_cents > row.price_cents &&
          interest.lastAt < Date.parse(row.price_changed_at ?? "")
        ) {
          await add(db, {
            user_id: userId,
            listing_id: row.listing_id,
            kind: "price_drop",
            event_key: `price:${row.price_version}`,
            payload: {
              price_version: row.price_version,
              previous_price_cents: row.previous_price_cents,
            },
          });
          queued++;
        }
        if (holdout) continue;
        const step = reminderStep(interest, now);
        if (step) {
          const recent = await db
            .from("shopping_queue")
            .select("id,sent_at")
            .eq("user_id", userId)
            .eq("kind", "reminder")
            .gte("sent_at", new Date(now - 14 * 86400000).toISOString())
            .limit(3);
          const lastClick = activity
            .filter((e) => e.kind === "notification_click")
            .reduce((max, e) => Math.max(max, Date.parse(e.at ?? "") || 0), 0);
          // Reduce unchanged-item reminders after repeated non-response. Changed
          // prices and explicit matches use independent keys and remain eligible.
          if ((recent.data?.length ?? 0) >= 3 && lastClick < now - 14 * 86400000) continue;
          await add(db, {
            user_id: userId,
            listing_id: row.listing_id,
            kind: "reminder",
            event_key: `reminder:${interest.lastAt}:${step}`,
            payload: { interest_at: interest.lastAt, step },
          });
          queued++;
        }
      }
    }
    for (let offset = 0; offset < candidates.length; offset += 200) {
      const r = await db.from("shopping_queue").upsert(candidates.slice(offset, offset + 200), {
        onConflict: "user_id,listing_id,event_key",
        ignoreDuplicates: true,
      });
      if (r.error) throw Error("Alert batch could not be queued.");
    }
  }
  return queued;
}
async function deliveryCandidates(db: any, delivery: any) {
  const [accountResult, permission, queued, searches, prefs] = await Promise.all([
    db.from("shopping_accounts").select("*").eq("user_id", delivery.user_id).single(),
    shoppingPermission(db, `u:${delivery.user_id}`),
    db.from("shopping_queue").select("*").in("id", delivery.queue_ids).eq("status", "processing"),
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
  return { account, permission, eligible };
}
export async function deliverShoppingAlerts(db: any, limit = 20) {
  let sent = 0,
    suppressed = 0;
  for (let i = 0; i < limit; i++) {
    if (!(await shoppingControls(db)).notifications) break;
    const claimed = await db.rpc("claim_shopping_delivery");
    if (claimed.error) throw Error("Shopping delivery lease unavailable.");
    const delivery = claimed.data?.[0];
    if (!delivery) break;
    try {
      const created = await db
        .from("shopping_accounts")
        .upsert({ user_id: delivery.user_id }, { onConflict: "user_id", ignoreDuplicates: true });
      if (created.error) throw Error("Recipient preferences unavailable.");
      const [candidate, userResult] = await Promise.all([
        deliveryCandidates(db, delivery),
        db.auth.admin.getUserById(delivery.user_id),
      ]);
      if (userResult.error) throw Error("Recipient verification unavailable.");
      const { account, permission, eligible } = candidate,
        ids = eligible.map((e) => e.id),
        user = userResult.data.user;
      const suppressedIds = delivery.queue_ids.filter((id: string) => !ids.includes(id));
      if (suppressedIds.length) {
        const r = await db
          .from("shopping_queue")
          .update({ status: "suppressed" })
          .in("id", suppressedIds);
        if (r.error) throw Error("Suppression could not be recorded.");
        suppressed += suppressedIds.length;
      }
      if (eligible.length) {
        const r = await db.from("notifications").upsert(
          eligible.map((item) => ({
            id: item.notification_id,
            user_id: delivery.user_id,
            kind: "shopping_alert",
            title:
              item.kind === "price_drop"
                ? "A listing dropped in price"
                : item.kind === "match"
                  ? "A new listing matches your search"
                  : "Continue your shopping",
            body: item.card.title,
            entity_type: "shopping_alert",
            entity_id: item.id,
            destination_url: `/listings/${item.listing_id}`,
          })),
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (r.error) throw Error("Website notifications unavailable.");
      }
      const emailItems = eligible.filter((e) => e.email),
        origin = brand.urls.siteUrl.replace(/\/$/, "");
      if (
        emailItems.length &&
        !account.delivery_blocked &&
        user?.email_confirmed_at &&
        user.email &&
        !user.app_metadata?.managed_import &&
        !user.email.endsWith(".invalid")
      ) {
        const unsub = `${origin}/api/shopping-link/${account.unsubscribe_token}?action=unsubscribe`;
        const result = await sendTemplateEmail("shopping-alert", user.email, {
          idempotencyKey: `shopping-delivery-${delivery.id}`,
          tags: [{ name: "bluebird_shopping_id", value: delivery.id }],
          beforeSend: async () => {
            if (!(await shoppingControls(db)).notifications) return false;
            const latest = await deliveryCandidates(db, delivery);
            if (latest.account.delivery_blocked) return false;
            return emailItems.every((item) =>
              latest.eligible.some(
                (e) =>
                  e.id === item.id &&
                  e.email &&
                  e.card.priceCents === item.card.priceCents &&
                  e.card.title === item.card.title,
              ),
            );
          },
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          templateData: {
            items: emailItems.slice(0, 20).map((item) => ({
              title: item.card.title,
              price: `$${(item.card.priceCents / 100).toLocaleString()}`,
              reason:
                item.kind === "price_drop"
                  ? `Previously $${(item.payload.previous_price_cents / 100).toLocaleString()}`
                  : item.kind === "match"
                    ? "Matches your saved search"
                    : "You showed interest in this listing",
              url: `${origin}/api/shopping-link/${delivery.tracking_token}?action=click&item=${item.id}`,
            })),
            unsubscribeUrl: unsub,
            moreUrl: `${origin}/notifications`,
            openUrl: permission?.personalization
              ? `${origin}/api/shopping-link/${delivery.tracking_token}?action=open`
              : undefined,
          },
        });
        if (!result.sent) {
          const r = await db.from("shopping_queue").update({ status: "suppressed" }).in("id", ids);
          if (r.error) throw Error("Suppression unavailable.");
          const d = await db
            .from("shopping_deliveries")
            .update({ status: "suppressed", lease_until: null })
            .eq("id", delivery.id);
          if (d.error) throw Error("Delivery status unavailable.");
          continue;
        }
        const r = await db
          .from("shopping_deliveries")
          .update({
            provider_id: result.providerId ?? null,
            provider_status: "email.sent",
            email_sent: true,
          })
          .eq("id", delivery.id);
        if (r.error) throw Error("Delivery outcome unavailable.");
      }
      if (ids.length) {
        const r = await db
          .from("shopping_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .in("id", ids)
          .eq("status", "processing");
        if (r.error) throw Error("Queue outcome unavailable.");
      }
      const r = await db
        .from("shopping_deliveries")
        .update({
          status: eligible.length ? "sent" : "suppressed",
          sent_at: eligible.length ? new Date().toISOString() : null,
          lease_until: null,
        })
        .eq("id", delivery.id);
      if (r.error) throw Error("Delivery outcome unavailable.");
      sent += eligible.length;
    } catch {
      const r = await db
        .from("shopping_deliveries")
        .update({
          status: delivery.attempts >= 6 ? "failed" : "pending",
          lease_until: new Date(
            Date.now() + Math.min(60, 2 ** delivery.attempts) * 60000,
          ).toISOString(),
        })
        .eq("id", delivery.id);
      if (r.error) throw Error("Delivery retry could not be saved.");
    }
  }
  return { sent, suppressed };
}

export async function processShoppingWorker() {
  const db = await shoppingDb(),
    controls = await shoppingControls(db),
    now = new Date().toISOString();
  const lease = await db
    .from("shopping_controls")
    .update({ lease_until: new Date(Date.now() + 14 * 60000).toISOString() })
    .eq("id", true)
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .select("id")
    .maybeSingle();
  if (lease.error) throw Error("Shopping sweep unavailable.");
  if (!lease.data) return { skipped: true };
  const inventory = await syncShoppingInventory(db);
  await db.rpc("retain_shopping_data");
  await evaluateWeeklyRanking(db);
  const advertising = await (
    await import("./shopping-advertising.server")
  ).deliverShoppingAdvertising(db);
  if (!controls.notifications) return { inventory, paused: true, ...advertising };
  const queued = await generateShoppingAlerts(db),
    delivered = await deliverShoppingAlerts(db);
  return { inventory, queued, ...delivered, ...advertising };
}

async function evaluateWeeklyRanking(db: any) {
  const now = new Date(),
    day = now.getUTCDay();
  now.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  const week = now.toISOString().slice(0, 10);
  if (!(await shoppingControls(db)).learning) return;
  const prior = await db
    .from("shopping_model_evaluations")
    .select("week")
    .eq("week", week)
    .maybeSingle();
  if (prior.error) throw Error("Ranking evaluation unavailable.");
  if (prior.data) return;
  const rows = await db.rpc("shopping_training_rows");
  if (rows.error) throw Error("Ranking observations unavailable.");
  const { evaluateShoppingRanking, BASELINE_WEIGHTS } = await import("./shopping-learning");
  const controls = await shoppingControls(db);
  const observations = (rows.data ?? []).map((r: any) => ({
    subject: r.subject,
    session: r.session,
    listing: r.listing,
    contact: r.contact,
    features: ["rank_visual", "rank_budget", "rank_location", "rank_freshness"].map((k) =>
      Math.max(0, Math.min(1, Number(r.context[k]) || 0)),
    ),
  }));
  const evaluation = evaluateShoppingRanking(
    observations,
    controls.model?.weights ?? BASELINE_WEIGHTS,
  );
  const saved = await db.from("shopping_model_evaluations").insert({ week, ...evaluation });
  if (saved.error) throw Error("Ranking evaluation could not be saved.");
  if (evaluation.promoted)
    await db
      .from("shopping_controls")
      .update({
        model_version: `learned-${week}`,
        model: { ...controls.model, weights: evaluation.challenger.weights },
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
}
