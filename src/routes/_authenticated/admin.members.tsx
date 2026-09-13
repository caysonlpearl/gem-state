import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getMemberDirectory } from "@/lib/admin-directory.functions";

export const Route = createFileRoute("/_authenticated/admin/members")({
  head: () => ({
    meta: [
      { title: "Seller and shopper directory · ParkVault operations" },
      {
        name: "description",
        content:
          "Admin-only directory of every ParkVault seller and approved in-park shopper with real listing, sale and assignment counts.",
      },
      { property: "og:title", content: "Seller and shopper directory · ParkVault operations" },
      {
        property: "og:description",
        content: "Admin-only directory of ParkVault sellers and approved in-park shoppers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MembersPage,
});

function MembersPage() {
  const fetchDirectory = useServerFn(getMemberDirectory);
  const directory = useQuery({ queryKey: ["admin-directory"], queryFn: () => fetchDirectory() });

  useEffect(() => {
    void trackEvent("page_view", { route: "/admin/members" });
  }, []);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link to="/admin" className="text-[12px] text-muted-foreground hover:text-foreground">
          Back to operations
        </Link>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Sellers and shoppers</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every real member account with a seller profile or an approved shopper role. Counts are
          actual records — never estimates.
        </p>
      </div>

      {directory.isLoading && <p className="text-[13px] text-muted-foreground">Loading…</p>}
      {directory.error && (
        <p className="text-[13px] text-destructive">
          {directory.error instanceof Error
            ? directory.error.message
            : "Could not load the directory."}
        </p>
      )}

      {directory.data && (
        <>
          <Panel title="Sellers" count={directory.data.sellers.length}>
            {directory.data.sellers.length === 0 ? (
              <Empty label="No seller profiles yet." />
            ) : (
              <ul className="divide-y divide-border">
                {directory.data.sellers.map((seller) => (
                  <li
                    key={seller.userId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar url={seller.avatarUrl} name={seller.displayName} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{seller.displayName}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {seller.slug ? `@${seller.slug}` : "No handle"} · {seller.status ?? "—"} ·{" "}
                          {seller.payoutVerified ? "Payouts enabled" : "Payouts not enabled"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Stat label="Active listings" value={seller.activeListings} />
                      <Stat label="Completed sales" value={seller.completedSales} />
                      {seller.slug ? (
                        <Link
                          to="/sellers/$slug"
                          params={{ slug: seller.slug }}
                          className="text-[12px] font-medium text-primary hover:underline"
                        >
                          Profile
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Approved in-park shoppers" count={directory.data.shoppers.length}>
            {directory.data.shoppers.length === 0 ? (
              <Empty label="No approved shoppers yet." />
            ) : (
              <ul className="divide-y divide-border">
                {directory.data.shoppers.map((shopper) => (
                  <li
                    key={shopper.userId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar url={shopper.avatarUrl} name={shopper.displayName} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{shopper.displayName}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {shopper.slug ? `@${shopper.slug}` : "No public profile yet"} ·{" "}
                          {shopper.publicLocation ?? "Location not shared"} ·{" "}
                          {shopper.availableNow ? "Available now" : "Not available"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Stat
                        label="Flat fee"
                        value={shopper.flatFeeCents == null ? "—" : formatUsd(shopper.flatFeeCents)}
                      />
                      <Stat label="Active jobs" value={shopper.activeAssignments} />
                      <Stat label="Completed" value={shopper.completedAssignments} />
                      {shopper.slug ? (
                        <Link
                          to="/shoppers/$slug"
                          params={{ slug: shopper.slug }}
                          className="text-[12px] font-medium text-primary hover:underline"
                        >
                          Profile
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b flex items-center justify-between px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        <span className="numeric text-[12px] text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-4 py-6 text-[12.5px] text-muted-foreground">{label}</p>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric text-[12.5px] font-semibold">{value}</p>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[12px] font-semibold">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
