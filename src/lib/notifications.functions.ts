import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 7 — private in-app notifications.
 *
 * In-app only. Email, SMS and push are NOT connected during the validation
 * pilot, so nothing here may imply that a message was sent to a member outside
 * the product. Rows are written by trusted database operations and read under
 * RLS by their owner alone.
 */

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

export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: MemberNotification[]; unread: number }> => {
    const client = context.supabase as any;
    const { data, error } = await client
      .from("notifications")
      .select("id, kind, title, body, order_id, entity_type, entity_id, destination_url, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const items = (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      orderId: row.order_id,
      entityType: row.entity_type ?? null,
      entityId: row.entity_id ?? null,
      destinationUrl: row.destination_url ?? null,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
    return { items, unread: items.filter((i) => !i.readAt).length };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[] | null }) => ({
    ids: Array.isArray(input.ids) ? input.ids.map((id) => String(id)).slice(0, 100) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: count, error } = await context.supabase.rpc("mark_notifications_read", {
      ...(data.ids ? { _ids: data.ids } : {}),
    });
    if (error) throw new Error(error.message);
    return { updated: Number(count ?? 0) };
  });
