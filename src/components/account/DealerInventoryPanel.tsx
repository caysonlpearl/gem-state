import { DealerInventoryControls } from "./DealerInventoryControls";
import { dealerInventoryVisibilityLabel } from "@/lib/dealer-inventory-controls";
import { useState } from "react";
import { DealerPerformancePanel } from "./DealerPerformancePanel";
import { VerifiedDealerBadge } from "@/components/dealers/VerifiedDealerBadge";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyDealerInventory,
  type DealerAccountInventory,
} from "@/lib/dealer-onboarding.functions";

export function DealerInventoryPanel({ compact = false }: { compact?: boolean }) {
  const load = useServerFn(getMyDealerInventory);
  const query = useQuery({ queryKey: ["my-dealer-inventory"], queryFn: () => load() });
  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Loading dealership inventory…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load dealership inventory. Please try again.
      </p>
    );
  if (!query.data?.length) return null;
  return <DealerInventoryView dealers={query.data} compact={compact} />;
}

export function DealerInventoryView({
  dealers,
  preview = false,
  compact = false,
}: {
  dealers: DealerAccountInventory[];
  preview?: boolean;
  compact?: boolean;
}) {
  const [performanceDealer, setPerformanceDealer] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      {dealers.map((dealer) => (
        <section key={dealer.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {dealer.logoUrl ? (
                <img
                  src={dealer.logoUrl}
                  alt={`${dealer.name} logo`}
                  className="mb-3 h-14 w-56 object-contain object-left"
                />
              ) : null}
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                {dealer.name}
                <VerifiedDealerBadge />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {dealer.records.length} vehicles assigned to your dealership. Inventory updates from
                your feed.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[dealer.email, dealer.phone].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-primary">
              <Link to="/dealers/$slug" params={{ slug: dealer.slug }}>
                View dealership
              </Link>
              {!preview ? <Link to="/dealer-setup">Edit business profile</Link> : null}
              {!preview ? (
                <button
                  type="button"
                  onClick={() =>
                    setPerformanceDealer((current) => (current === dealer.id ? null : dealer.id))
                  }
                  aria-expanded={performanceDealer === dealer.id}
                  className="font-semibold"
                >
                  {performanceDealer === dealer.id ? "Hide performance" : "View performance"}
                </button>
              ) : null}
              {compact ? (
                <Link to="/account" search={{ section: "listings" }}>
                  My dealership listings
                </Link>
              ) : null}
              {!preview ? (
                <Link to="/account" search={{ section: "messages" }}>
                  Open inbox
                </Link>
              ) : null}
            </div>
          </div>
          {performanceDealer === dealer.id ? (
            <div className="mt-5 border-t border-border pt-5">
              <DealerPerformancePanel dealerId={dealer.id} />
            </div>
          ) : null}
          {!compact ? (
            <DealerInventoryTable key={dealer.id} dealer={dealer} preview={preview} />
          ) : null}
        </section>
      ))}
    </div>
  );
}

function DealerInventoryTable({
  dealer,
  preview,
}: {
  dealer: DealerAccountInventory;
  preview: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = dealer.records.filter((record) =>
    [record.title, record.vin, record.stockNumber]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pageCount);
  const records = filtered.slice((current - 1) * 25, current * 25);
  return (
    <div className="mt-5 space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Hide or mark sold to remove a vehicle from Bluebird. Your choice stays in place through feed
        refreshes. Prices and photos continue to come from your feed.
        {preview ? " These controls are for review only in this preview." : ""}
      </p>
      <input
        aria-label="Search dealership inventory"
        placeholder="Search vehicle, VIN, or stock number"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[690px] text-left text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3">Vehicle</th>
              <th className="pr-3">Price</th>
              <th className="pr-3">Bluebird status</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-border">
                <td className="py-3 pr-4">
                  {record.status === "active" &&
                  (!record.dealerVisibility || record.dealerVisibility === "visible") ? (
                    <Link
                      to="/listings/$listingId"
                      params={{ listingId: `dealerfeed-${record.id}` }}
                      className="font-medium text-primary hover:underline"
                    >
                      {record.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{record.title}</span>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[record.stockNumber ? `Stock ${record.stockNumber}` : null, record.vin]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </td>
                <td className="pr-4 whitespace-nowrap">
                  {record.priceCents
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(record.priceCents / 100)
                    : "Contact For Price"}
                </td>
                <td className="pr-4">
                  <span className="text-xs font-semibold">
                    {dealerInventoryVisibilityLabel(record.dealerVisibility, record.status)}
                  </span>
                  {record.dealerVisibility && record.dealerVisibility !== "visible" ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Feed: {record.status}</p>
                  ) : null}
                  {record.detailReportOpen ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Details report pending</p>
                  ) : null}
                </td>
                <td>
                  <DealerInventoryControls record={record} preview={preview} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!records.length ? (
        <p className="py-4 text-sm text-muted-foreground">No matching vehicles.</p>
      ) : null}
      <nav
        aria-label="Dealership inventory pages"
        className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs"
      >
        <span>
          {filtered.length} vehicles · Page {current} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="rounded-full border border-input px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={current >= pageCount}
            onClick={() => setPage(current + 1)}
            className="rounded-full border border-input px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
