import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Your Bluebird Marketplace notifications" },
      {
        name: "description",
        content:
          "Private in-app updates about your Bluebird Marketplace orders, offers, shipments and reviews.",
      },
      { property: "og:title", content: "Your Bluebird Marketplace notifications" },
      {
        property: "og:description",
        content:
          "Private in-app updates about your Bluebird Marketplace orders, offers and shipments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/account", search: { section: "notifications" }, replace: true });
  }, [navigate]);

  return (
    <main className="mx-auto max-w-[760px] px-4 py-16">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <p className="mt-2 text-sm text-muted-foreground">Opening your account notifications.</p>
      <a
        href="/account?section=notifications"
        className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline"
      >
        Open notifications
      </a>
    </main>
  );
}
