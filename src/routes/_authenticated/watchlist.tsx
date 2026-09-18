import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/watchlist")({
  head: () => ({
    meta: [
      { title: "Your saved listings · Gem State Classifieds" },
      {
        name: "description",
        content:
          "The exact Gem State Classifieds listings you save, with current offer and listing details.",
      },
      { property: "og:title", content: "Your saved listings · Gem State Classifieds" },
      {
        property: "og:description",
        content:
          "Save exact listings and return to them from your private account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/account", search: { section: "saved" }, replace: true });
  }, [navigate]);

  return <div className="mx-auto max-w-[980px] px-4 py-16 text-[13px] text-muted-foreground">Opening Saved listings…</div>;
}
