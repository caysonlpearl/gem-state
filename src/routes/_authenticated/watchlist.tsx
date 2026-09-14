import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getMyWatchlist } from "@/lib/community.functions";

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
  const fetchWatchlist = useServerFn(getMyWatchlist);

  useEffect(() => {
    void trackEvent("page_view", { route: "/watchlist" });
  }, []);

  const watchlist = useQuery({ queryKey: ["my-watchlist"], queryFn: () => fetchWatchlist() });
  const list = watchlist.data ?? [];

  return (
    <div className="mx-auto max-w-[980px] px-4 py-10 sm:px-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Saved listings</h1>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
        The listings you save are private to you. Saving an item does not reserve it.
      </p>

      {watchlist.isLoading && <p className="mt-8 text-[13px] text-muted-foreground">Loading…</p>}
      {watchlist.isError && (
        <p className="mt-8 text-[13px] text-destructive">
          Your watchlist could not be loaded right now. Refresh to try again.
        </p>
      )}
      {!watchlist.isLoading && !watchlist.isError && list.length === 0 && (
        <p className="mt-8 text-[13px] text-muted-foreground">
          You have not saved any listings yet. Open a listing and select its save button.{" "}
          <Link to="/browse" className="underline underline-offset-2">
            Browse listings
          </Link>
          .
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
          {list.map((item) => (
            <li
              key={item.variantId}
              className="hairline-b flex flex-wrap items-center justify-between gap-3 px-4 py-3 last:border-b-0"
            >
              <div>
                {item.listingId ? (
                  <Link
                    to="/listings/$listingId"
                    params={{ listingId: item.listingId }}
                    className="text-[13px] font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                ) : (
                  <Link
                    to="/browse"
                    search={{ q: item.productName }}
                    className="text-[13px] font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                )}
                <p className="text-[12px] text-muted-foreground">
                  {item.variantLabel} · {item.activeAskCount} active listing
                  {item.activeAskCount === 1 ? "" : "s"} · {item.activeBidCount} active offer
                  {item.activeBidCount === 1 ? "" : "s"} · {item.sightingCount} sighting
                  {item.sightingCount === 1 ? "" : "s"}
                </p>
              </div>
              <p className="numeric text-[12.5px]">
                <span className="font-semibold">
                  {item.lowestAskCents != null ? formatUsd(item.lowestAskCents) : "No listing"}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {item.highestBidCents != null
                    ? `${formatUsd(item.highestBidCents)} offer`
                    : "No offer"}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
