/** Private account activity, shared by website and native presenters. */
export type MemberNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  orderId: string | null;
  entityType: string | null;
  entityId: string | null;
  destinationUrl: string | null;
  readAt: string | null;
  createdAt: string;
};
export type NotificationInbox = { items: MemberNotification[]; unread: number };
export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  order_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  destination_url?: string | null;
  read_at?: string | null;
  created_at: string;
};
export function memberNotification(row: NotificationRow): MemberNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    orderId: row.order_id ?? null,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    destinationUrl: row.destination_url ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}
