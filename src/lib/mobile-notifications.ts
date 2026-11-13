import { mobileLinkTarget, mobileListingAllowed } from "./mobile-contract.ts";
import type { MemberNotification } from "./notification-model.ts";
export type MobileNotificationFact = {
  allowed: boolean;
  available: boolean;
  owned: boolean;
  conversation?: boolean;
};
export type NotificationConversation = {
  id: string;
  listing_id: string | null;
  dealer_inventory_record_id?: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at: string | null;
  conversation_participants: {
    user_id: string;
    last_read_at?: string | null;
    blocked_at?: string | null;
  }[];
};
export const conversationListingId = (row: NotificationConversation) =>
  row.dealer_inventory_record_id ? `dealerfeed-${row.dealer_inventory_record_id}` : row.listing_id;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const listingPath = /^\/listings\/([a-z0-9][a-z0-9._:-]{0,199})$/i;
export function notificationDestination(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://onbluebird.com");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["onbluebird.com", "www.onbluebird.com"].includes(url.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
export function notificationListingReference(item: MemberNotification) {
  const url = notificationDestination(item.destinationUrl);
  const id = url && listingPath.exec(url.pathname)?.[1];
  if (id && !(url!.search || url!.hash)) return id;
  return item.entityType === "listing" && item.entityId && uuid.test(item.entityId)
    ? item.entityId
    : null;
}
export function notificationConversationAllowed(row: NotificationConversation, user: string) {
  const p = row.conversation_participants;
  return (
    [row.buyer_id, row.seller_id].includes(user) &&
    Array.isArray(p) &&
    p.some((x) => x.user_id === user) &&
    !p.some((x) => x.blocked_at)
  );
}
/** Project only verified app contexts. Raw database URLs never become native destinations. */
export function projectMobileNotification(
  item: MemberNotification,
  user: string,
  conversations: Map<string, NotificationConversation>,
  facts: Map<string, MobileNotificationFact>,
  applications: Map<string, string> = new Map(),
  dealerConversations: Set<string> = new Set(),
): MemberNotification | null {
  if (item.orderId || /billing|upgrade|payment|subscription/i.test(item.kind)) return null;
  if (!mobileListingAllowed({ categorySlug: "general", title: item.title, description: item.body }))
    return null;
  const url = notificationDestination(item.destinationUrl);
  if (item.destinationUrl && !url) return null;
  if (item.kind === "message" || item.entityType === "conversation") {
    const row = item.entityId ? conversations.get(item.entityId) : undefined;
    if (!row || !notificationConversationAllowed(row, user)) return null;
    const id = conversationListingId(row),
      fact = id
        ? facts.get(id)
        : dealerConversations.has(row.id)
          ? { allowed: true, conversation: true, available: false, owned: false }
          : null;
    if (!fact?.allowed || !(fact.conversation ?? fact.available)) return null;
    const target = `/messages/${row.id}`;
    if (url && mobileLinkTarget(url.href) !== target) return null;
    return { ...item, orderId: null, destinationUrl: target };
  }
  if (item.entityType === "job_application") {
    const listingId = item.entityId ? applications.get(item.entityId) : null;
    const fact = listingId ? facts.get(listingId) : null;
    if (!fact?.allowed || !fact.owned) return null;
    if (url && !(url.pathname === "/selling" && url.hash === "#applications" && !url.search))
      return null;
    return { ...item, destinationUrl: null };
  }
  const id = notificationListingReference(item);
  if (id) {
    const fact = facts.get(id);
    if (!fact?.allowed) return null;
    if (
      ["listing_reviewed", "listing_approved", "listing_rejected"].includes(item.kind) &&
      !fact.owned
    )
      return null;
    if (item.entityType === "listing" && item.entityId !== id) return null;
    const operational =
      item.entityType === "listing" && fact.owned && !/shopping|saved_search/.test(item.kind);
    if (!fact.available && !operational) return null;
    if (
      url &&
      operational &&
      url.pathname === "/account" &&
      url.search === "?section=listings" &&
      !url.hash
    )
      return { ...item, destinationUrl: null };
    if (url && (url.pathname !== `/listings/${id}` || url.search || url.hash)) return null;
    return { ...item, orderId: null, destinationUrl: fact.available ? `/listings/${id}` : null };
  }
  if (item.entityType || item.entityId || !["system", "security", "account"].includes(item.kind))
    return null;
  let target: string | null = null;
  if (url) {
    if (
      url.pathname !== "/account" ||
      url.hash ||
      [...url.searchParams.keys()].some((k) => k !== "section") ||
      url.searchParams.getAll("section").length > 1
    )
      return null;
    const section = url.searchParams.get("section") ?? "profile";
    if (!["profile", "settings", "notifications", "searches"].includes(section)) return null;
    target = `/account/${section}`;
  }
  return { ...item, destinationUrl: target };
}
export function mobileNotificationInbox(
  items: MemberNotification[],
  user: string,
  conversations: NotificationConversation[],
  facts: Map<string, MobileNotificationFact>,
  applications: Map<string, string> = new Map(),
  dealerConversations: Set<string> = new Set(),
) {
  const context = new Map(conversations.map((c) => [c.id, c]));
  const visible = items
    .map((n) =>
      projectMobileNotification(n, user, context, facts, applications, dealerConversations),
    )
    .filter((n): n is MemberNotification => Boolean(n));
  return {
    items: visible,
    unread: visible.filter((n) => !n.readAt).length,
    unreadMessages: conversations.filter((c) => {
      const id = conversationListingId(c);
      const fact = id
        ? facts.get(id)
        : dealerConversations.has(c.id)
          ? { allowed: true, conversation: true }
          : null;
      if (
        !fact?.allowed ||
        !(fact.conversation ?? ("available" in fact && fact.available)) ||
        !notificationConversationAllowed(c, user)
      )
        return false;
      const read = c.conversation_participants.find((p) => p.user_id === user)?.last_read_at;
      return Boolean(
        c.last_message_at && (!read || Date.parse(c.last_message_at) > Date.parse(read)),
      );
    }).length,
  };
}
