import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Your GemList notifications" },
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
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/account", search: { section: "notifications" }, replace: true });
  }, [navigate]);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-16 text-[13px] text-muted-foreground">
      Opening Notifications…
    </div>
  );
}
