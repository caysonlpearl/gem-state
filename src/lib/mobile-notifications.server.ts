import { mobileGeneralDealerContexts } from "./mobile-storefront.server.ts";
import { withCatalogReadDeadline } from "./catalog-read-deadline.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- shared production database projections */
import { z } from "zod";
import { MobileApiError, mobileJson } from "./mobile-api.ts";
import { memberNotification } from "./notification-model.ts";
import { mobileListingAllowed } from "./mobile-contract.ts";
import { publishedFeedVehicle } from "./dealer-feed-contract.ts";
import {
  conversationListingId,
  mobileNotificationInbox,
  notificationListingReference,
  type MobileNotificationFact,
  type NotificationConversation,
} from "./mobile-notifications.ts";
const columns =
  "id,kind,title,body,order_id,entity_type,entity_id,destination_url,read_at,created_at";
const conversationColumns =
  "id,listing_id,dealer_inventory_record_id,buyer_id,seller_id,last_message_at,conversation_participants(user_id,last_read_at,blocked_at)";
const nativeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readInput = z.object({ ids: z.array(z.string().guid()).max(60).nullable() }).strict();
const result = async (query: any) => {
  const r = await withCatalogReadDeadline<any>(query, 5000);
  if (r.error)
    throw new MobileApiError(
      503,
      "notifications_unavailable",
      "Your notifications could not be loaded. Please retry.",
    );
  return r.data ?? [];
};
export async function loadMobileNotifications(
  client: any,
  db: any,
  user: string,
  dealerMessagesReady = false,
) {
  const [rows, recent] = await Promise.all([
    result(
      client
        .from("notifications")
        .select(columns)
        .eq("user_id", user)
        .order("created_at", { ascending: false })
        .limit(60),
    ),
    result(
      db
        .from("conversations")
        .select(conversationColumns)
        .or(`buyer_id.eq.${user},seller_id.eq.${user}`)
        .order("last_message_at", { ascending: false })
        .limit(100),
    ),
  ]);
  const items = rows.map(memberNotification),
    existing = new Set(recent.map((c: any) => c.id));
  const missing = [
    ...new Set(
      items
        .filter(
          (n: any) =>
            n.entityType === "conversation" &&
            n.entityId &&
            nativeId.test(n.entityId) &&
            !existing.has(n.entityId),
        )
        .map((n: any) => n.entityId),
    ),
  ];
  const applicationIds = [
    ...new Set<string>(
      items
        .filter(
          (n: any) => n.entityType === "job_application" && n.entityId && nativeId.test(n.entityId),
        )
        .map((n: any) => n.entityId),
    ),
  ];
  const [older, applicationRows] = await Promise.all([
    missing.length
      ? result(
          db
            .from("conversations")
            .select(conversationColumns)
            .or(`buyer_id.eq.${user},seller_id.eq.${user}`)
            .in("id", missing),
        )
      : [],
    applicationIds.length
      ? result(
          db
            .from("job_applications")
            .select("id,listing_id,asks!inner(seller_id)")
            .in("id", applicationIds)
            .eq("asks.seller_id", user),
        )
      : [],
  ]);
  const applications = new Map<string, string>(
    applicationRows
      .filter((row: any) => row.asks?.seller_id === user)
      .map((row: any) => [row.id, row.listing_id]),
  );
  const conversations = [...recent, ...older] as NotificationConversation[];
  const ids = [
    ...new Set<string>(
      [
        ...items.map(notificationListingReference),
        ...conversations.map(conversationListingId),
        ...applications.values(),
      ].filter((id): id is string => typeof id === "string"),
    ),
  ];
  const facts = new Map<string, MobileNotificationFact>();
  const native = ids.filter((id) => nativeId.test(id)),
    external = ids.filter((id) => !nativeId.test(id)),
    direct = external.filter((id) => id.startsWith("dealerfeed-"));
  const now = Date.now();
  const [asks, inventory, jobs, vehicles, feed] = await Promise.all([
    native.length
      ? result(
          db
            .from("asks")
            .select(
              "id,seller_id,status,is_demo,approved_at,expires_at,products(name,description,status,categories(slug))",
            )
            .in("id", native),
        )
      : [],
    external.length
      ? result(
          db
            .from("shopping_inventory")
            .select("listing_id,card,valid_until")
            .in("listing_id", external)
            .gt("valid_until", new Date(now).toISOString()),
        )
      : [],
    external.length
      ? result(
          db
            .from("partner_job_reports")
            .select("listing_id")
            .in("listing_id", external)
            .eq("status", "reviewed"),
        )
      : [],
    external.length
      ? result(
          db
            .from("partner_vehicle_reports")
            .select("listing_id")
            .in("listing_id", external)
            .eq("status", "reviewed"),
        )
      : [],
    direct.length
      ? (async () => {
          const r = await withCatalogReadDeadline<any>(
            db.rpc("read_published_dealer_inventory", {
              _dealer_slug: null,
              _record_id: null,
              _full_photos: false,
            }),
            5000,
          );
          if (r.error)
            throw new MobileApiError(
              503,
              "notifications_unavailable",
              "Your notifications could not be loaded. Please retry.",
            );
          return r.data;
        })()
      : null,
  ]);
  for (const row of asks) {
    const p = row.products;
    const allowed = mobileListingAllowed({
      categorySlug: p?.categories?.slug,
      title: p?.name,
      description: p?.description,
    });
    facts.set(row.id, {
      allowed,
      available:
        allowed &&
        row.status === "active" &&
        !row.is_demo &&
        Boolean(row.approved_at) &&
        Date.parse(row.expires_at) > now &&
        p?.status === "published",
      owned: row.seller_id === user,
      conversation: allowed && !row.is_demo,
    });
  }
  const suppressed = new Set([...jobs, ...vehicles].map((r: any) => r.listing_id));
  for (const row of inventory) {
    const card = row.card;
    const expires = card?.externalHome?.cacheExpiresAt;
    const allowed = card?.id === row.listing_id && mobileListingAllowed(card ?? {});
    facts.set(row.listing_id, {
      allowed,
      available:
        allowed &&
        !suppressed.has(row.listing_id) &&
        Date.parse(row.valid_until) > now &&
        card?.available !== false &&
        (!expires || Date.parse(expires) > now),
      owned: false,
    });
  }
  if (direct.length) {
    for (const id of direct) facts.delete(id);
    for (const row of feed?.vehicles ?? []) {
      const id = `dealerfeed-${row.id}`;
      if (!direct.includes(id)) continue;
      const dealer = feed.dealers?.find((d: any) => d.slug === row.dealer_slug);
      const v = dealer && publishedFeedVehicle(row, dealer);
      if (!v) continue;
      const allowed = mobileListingAllowed({
        categorySlug: "cars-trucks",
        title: v.heading,
        description: typeof row.description === "string" ? row.description : "",
      });
      facts.set(id, {
        allowed,
        available: allowed && !suppressed.has(id),
        owned: dealer.owner_user_id === user,
      });
    }
  }
  const dealerContexts = await mobileGeneralDealerContexts(
    db,
    user,
    conversations,
    dealerMessagesReady,
  );
  const inbox = mobileNotificationInbox(
    items,
    user,
    conversations,
    facts,
    applications,
    dealerContexts,
  );
  // Badge parity follows the website's latest 100 conversations. Older context
  // may authorize an inbox row, but must not silently enlarge the badge count.
  inbox.unreadMessages = mobileNotificationInbox(
    [],
    user,
    recent,
    facts,
    new Map(),
    dealerContexts,
  ).unreadMessages;
  return { ...inbox, ownerId: user };
}
export async function markMobileNotificationsRead(
  request: Request,
  client: any,
  db: any,
  user: string,
  dealerMessagesReady = false,
) {
  const input = readInput.parse(await mobileJson(request));
  const inbox = await loadMobileNotifications(client, db, user, dealerMessagesReady);
  const requested = input.ids && new Set(input.ids);
  const ids = inbox.items
    .filter((n) => !n.readAt && (!requested || requested.has(n.id)))
    .map((n) => n.id);
  if (!ids.length) return { updated: 0 };
  // Never pass null: "all" means this member's current app-eligible inbox,
  // excluding prohibited inventory and separately retained website activity.
  const r = await client.rpc("mark_notifications_read", { _ids: ids });
  if (r.error)
    throw new MobileApiError(
      503,
      "notification_read_failed",
      "The read status could not be confirmed. Please retry.",
    );
  return { updated: Number(r.data ?? 0) };
}
