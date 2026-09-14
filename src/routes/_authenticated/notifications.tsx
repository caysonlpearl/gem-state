import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { trackEvent } from "@/lib/analytics";
import { getMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Your ParkVault notifications" },
      {
        name: "description",
        content:
          "Private in-app updates about your Gem State Classifieds orders, offers, shipments and reviews.",
      },
      { property: "og:title", content: "Your Gem State Classifieds notifications" },
      {
        property: "og:description",
        content:
          "Private in-app updates about your Gem State Classifieds orders, offers and shipments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();
  const fetchNotifications = useServerFn(getMyNotifications);
  const markRead = useServerFn(markNotificationsRead);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
  });

  useEffect(() => {
    void trackEvent("notifications_viewed", {});
  }, []);

  const readAll = useMutation({
    mutationFn: () => markRead({ data: { ids: null } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Order, listing and offer updates appear here. Email, SMS and push notifications are not
            connected yet, so nothing here has been sent to you outside Gem State Classifieds.
          </p>
        </div>
        {(data?.unread ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => readAll.mutate()}
            disabled={readAll.isPending}
            className="h-9 shrink-0 rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading && <p className="mt-6 text-[13px] text-muted-foreground">Loading…</p>}
      {!isLoading && items.length === 0 && (
        <p className="mt-6 text-[13px] text-muted-foreground">
          No notifications yet. Order, offer, shipment, dispute and review updates will appear
          here.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id} className="hairline-b px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium">
                    {item.title}
                    {!item.readAt && (
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                        New
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="numeric mt-0.5 text-[11.5px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                {item.orderId && (
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: item.orderId }}
                    className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    View order
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
