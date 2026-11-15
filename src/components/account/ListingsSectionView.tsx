import { useState, type ComponentType, type ReactNode } from "react";
import { ArrowRight, Eye, MagnifyingGlass, PencilSimple, Plus } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { formatUsd } from "../../config/fees";
import { sellerListingState } from "../../lib/seller-listing-state";
import type { MyListing } from "../../lib/market.functions";
import type { ListingMetric } from "../../lib/mobile-account-listings.server";
import {
  AccountEmptyState as EmptyState,
  AccountSectionHeader as SectionHeader,
} from "./AccountSectionView";
export type SellerListingLinkProps = {
  to:
    | "/create-listing"
    | "/seller-setup"
    | "/listings/$listingId/edit"
    | "/listings/$listingId"
    | "/account";
  params?: { listingId: string };
  search?: { section?: "messages" | "billing"; duplicateFrom?: string };
  className?: string;
  children: ReactNode;
};
export function ListingsSectionView({
  listings,
  sellerExists,
  link: Link,
  onTakeDown,
  onRelist,
  importSync,
  paidFeatures = true,
  legacyNote = true,
  managementAvailable = true,
  busyListingId,
  unavailableMetrics = [],
  thumbnail,
  actionForItem,
  menuPlacement = "below",
}: {
  listings: MyListing[];
  sellerExists: boolean;
  link: ComponentType<SellerListingLinkProps>;
  onTakeDown: (id: string) => void;
  onRelist: (id: string) => void;
  importSync?: ReactNode;
  paidFeatures?: boolean;
  legacyNote?: boolean;
  managementAvailable?: boolean;
  busyListingId?: string;
  unavailableMetrics?: ListingMetric[];
  menuPlacement?: "above" | "below";
  actionForItem?: (item: MyListing) => "archive" | "relist" | null;
  thumbnail?: (item: MyListing) => ReactNode;
}) {
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const matchesFilter = (item: MyListing) => {
    if (filter === "all") return true;
    if (["active", "pending", "inactive"].includes(filter))
      return sellerListingState(item).group === filter;
    return filter === item.status;
  };
  const visible = listings
    .filter(
      (item) => item.productName.toLowerCase().includes(query.toLowerCase()) && matchesFilter(item),
    )
    .sort((a, b) =>
      sort === "views"
        ? (b.views ?? 0) - (a.views ?? 0)
        : sort === "leads"
          ? (b.leadCount ?? 0) - (a.leadCount ?? 0)
          : sort === "oldest"
            ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Seller workspace"
        title="Your listings"
        body={
          paidFeatures
            ? "Edit, duplicate, promote, archive, and track every listing from this Seller Center. Metrics and buyer leads are shown on each row."
            : "Edit, duplicate, archive, and track every listing from this Seller Center. Metrics and buyer leads are shown on each row."
        }
        action={
          <Link
            to="/create-listing"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90"
          >
            <Plus size={16} weight="bold" /> Add listing
          </Link>
        }
      />
      {importSync}
      {!sellerExists && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <p className="text-[14px] font-semibold">Become a Bluebird seller</p>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted-foreground">
            Set up your public seller profile before publishing. Direct-contact listings do not
            require buyer checkout or payout onboarding.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            Start seller setup
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div role="group" aria-label="Filter listings by status" className="flex flex-wrap gap-2.5">
          {(
            [
              ["active", "Active"],
              ["pending", "Awaiting approval"],
              ["inactive", "Inactive"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              aria-pressed={filter === value}
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
              className="min-h-11 rounded-xl px-4 text-[12.5px] font-semibold focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="field flex items-center gap-2">
            <MagnifyingGlass size={15} className="text-muted-foreground" />
            <span className="sr-only">Search listings</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your listings"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <select
            aria-label="Sort seller listings"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="field"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="views" disabled={unavailableMetrics.includes("views")}>
              Most views
            </option>
            <option value="leads" disabled={unavailableMetrics.includes("leads")}>
              Most leads
            </option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="No listings in this view"
          body="Your active, pending, and inactive listings will appear here."
          action={
            <Link
              to="/create-listing"
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Create a listing
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <SellerListingCard
              key={item.id}
              item={item}
              link={Link}
              paidFeatures={paidFeatures}
              managementAvailable={managementAvailable}
              busy={busyListingId === item.id}
              unavailableMetrics={unavailableMetrics}
              thumbnail={thumbnail}
              action={actionForItem?.(item)}
              menuPlacement={menuPlacement}
              onTakeDown={() => {
                if (
                  window.confirm(
                    "Remove this listing from public search? Buyers will no longer find it, but existing messages and saved records will remain. You can relist it later for review.",
                  )
                )
                  onTakeDown(item.id);
              }}
              onRelist={() => onRelist(item.id)}
            />
          ))}
        </div>
      )}
      {legacyNote && (
        <p className="text-[11px] text-muted-foreground">
          Legacy Seller Center links still work, but this account section is now the primary place
          to manage listings.
        </p>
      )}
    </div>
  );
}

function SellerListingCard({
  item,
  onTakeDown,
  onRelist,
  link: Link,
  paidFeatures,
  managementAvailable,
  busy,
  unavailableMetrics,
  thumbnail,
  action,
  menuPlacement,
}: {
  item: MyListing;
  onTakeDown: () => void;
  onRelist: () => void;
  link: ComponentType<SellerListingLinkProps>;
  menuPlacement: "above" | "below";
  action?: "archive" | "relist" | null;
  paidFeatures: boolean;
  managementAvailable: boolean;
  busy: boolean;
  unavailableMetrics: ListingMetric[];
  thumbnail?: (item: MyListing) => ReactNode;
}) {
  const state = sellerListingState(item);
  const value = (metric: ListingMetric, n: number) =>
    unavailableMetrics.includes(metric) ? "—" : n;
  const active = state.group === "active";
  const statusLabel = state.label;
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-[120px_minmax(0,1fr)_220px]">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-secondary">
        {thumbnail ? (
          thumbnail(item)
        ) : item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold leading-snug">{item.productName}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">{item.variantLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {statusLabel}
            </span>
            {paidFeatures && item.upgradeStatus === "paid" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                Upgraded
              </span>
            )}
          </div>
        </div>
        <p className="numeric mt-3 text-[18px] font-bold">{formatUsd(item.priceCents)}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Created {new Date(item.createdAt).toLocaleDateString()} · Expires{" "}
          {new Date(item.expiresAt).toLocaleDateString()}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px] sm:grid-cols-4">
          <Metric label="Views" value={value("views", item.views ?? 0)} />
          <Metric label="Impressions" value={value("impressions", item.impressions ?? 0)} />
          <Metric label="Leads" value={value("leads", item.leadCount ?? 0)} />
          <Metric label="Offers" value={value("offers", item.activeBidCount ?? 0)} />
        </dl>
      </div>
      <div className="self-center">
        <div className="rounded-xl bg-secondary/55 p-3 text-[11.5px]">
          <p className="font-semibold">Metrics</p>
          <p className="mt-1 text-muted-foreground">
            <Eye size={13} className="mr-1 inline" />
            {value("views", item.views ?? 0)} views · {value("impressions", item.impressions ?? 0)}{" "}
            impressions
          </p>
          <Link
            to="/account"
            search={{ section: "messages" }}
            className="mt-1 inline-flex text-muted-foreground hover:text-foreground"
          >
            {value("leads", item.leadCount ?? 0)} buyer leads
            <ArrowRight size={12} className="ml-1" />
          </Link>
          {paidFeatures && (
            <p className="mt-1 text-muted-foreground">
              {item.upgradeStatus === "paid" ? "Upgrade applied" : "Standard placement"}
            </p>
          )}
        </div>
        <details className="relative mt-3">
          <summary
            className={`flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-input px-2.5 text-[11px] font-semibold hover:bg-secondary ${menuPlacement === "above" ? "min-h-11" : ""}`}
          >
            <PencilSimple size={13} /> Manage
          </summary>
          <div
            className={`absolute right-0 z-10 grid min-w-[170px] gap-1 rounded-xl border border-border bg-card p-2 shadow-lg ${menuPlacement === "above" ? "bottom-full mb-1 [&>*]:flex [&>*]:min-h-11 [&>*]:items-center" : "mt-1"}`}
          >
            {managementAvailable ? (
              <Link
                to="/listings/$listingId/edit"
                params={{ listingId: item.id }}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
              >
                Edit listing
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] text-muted-foreground"
              >
                Edit listing
              </span>
            )}
            <Link
              to="/listings/$listingId"
              params={{ listingId: item.id }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              View listing
            </Link>
            <Link
              to="/account"
              search={{ section: "messages" }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              View leads & messages
            </Link>
            {paidFeatures && (
              <Link
                to="/account"
                search={{ section: "billing" }}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
              >
                Promote listing
              </Link>
            )}
            {managementAvailable ? (
              <Link
                to="/create-listing"
                search={{ duplicateFrom: item.id }}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
              >
                Duplicate
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] text-muted-foreground"
              >
                Duplicate
              </span>
            )}
            {(action === undefined ? active : action === "archive") ? (
              <button
                type="button"
                disabled={!managementAvailable || busy}
                onClick={onTakeDown}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] text-destructive hover:bg-destructive/5"
              >
                Archive listing
              </button>
            ) : action !== null ? (
              <button
                type="button"
                disabled={!managementAvailable || busy}
                onClick={onRelist}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
              >
                Restore / relist
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
