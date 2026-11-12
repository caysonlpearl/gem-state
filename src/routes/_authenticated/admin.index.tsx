import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Car,
  ShieldCheck,
  ChartBar,
  NotePencil,
  Users,
  DownloadSimple,
  CaretDown,
  ArrowUpRight,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getAdminQueues } from "@/lib/pilot.functions";
import { disputeStatusLabels, orderStatusLabels, originLabels } from "@/lib/market-labels";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: `${brand.name} operations console` },
      {
        name: "description",
        content:
          "Role-protected operator queues for Bluebird Marketplace listings, orders, disputes, and seller activity.",
      },
      { property: "og:title", content: `${brand.name} operations console` },
      {
        property: "og:description",
        content: "Role-protected operator queues for Bluebird Marketplace orders and trust review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function Queue({
  title,
  emptyLabel,
  children,
  count,
}: {
  title: string;
  emptyLabel: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="hairline-b flex items-center justify-between px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        <span className="numeric text-[12px] text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="text-[12.5px]">{children}</ul>
      )}
    </section>
  );
}

const adminGroups = [
  {
    title: "Moderation",
    description: "Listing approvals and reported content",
    icon: ShieldCheck,
    links: [
      {
        to: "/admin/classifieds",
        label: "Listing approvals & reports",
        detail: "Review submitted listings, listing reports, and business claims.",
      },
      {
        to: "/admin/review-flags",
        label: "Reported seller reviews",
        detail: "Review flags on ratings and written reviews.",
      },
      {
        to: "/admin/conversation-reports",
        label: "Reported conversations",
        detail: "Review reports about buyer and seller messages.",
      },
    ],
  },
  {
    title: "Dealerships",
    description: "Inquiries, dealer accounts, and inventory feeds",
    icon: Car,
    links: [
      {
        to: "/admin/dealer-inquiries",
        label: "Dealership inquiries",
        detail: "Follow up with dealerships interested in joining.",
      },
      {
        to: "/admin/dealers",
        label: "Dealer accounts",
        detail: "Manage active dealerships, onboarding, staff, and inbox access.",
      },
      {
        to: "/admin/dealer-inventory",
        label: "Inventory feeds",
        detail: "Manage dealer imports, schedules, and feed health.",
      },
    ],
  },
  {
    title: "Analytics",
    description: "Traffic, buyer contacts, and site activity",
    icon: ChartBar,
    links: [
      {
        to: "/admin/traffic",
        label: "Traffic & contacts",
        detail: "Visits, traffic sources, listing views, and contact actions.",
      },
      {
        to: "/admin/validation",
        label: "Site activity & errors",
        detail: "Activity events, search performance, and browser errors.",
      },
    ],
  },
  {
    title: "Content",
    description: "Local articles and catalog pages",
    icon: NotePencil,
    links: [
      {
        to: "/admin/news",
        label: "Bluebird Local editor",
        detail: "Manage local articles and guides.",
      },
      {
        to: "/admin/products",
        label: "Catalog pages",
        detail: "Edit existing product catalog pages.",
      },
    ],
  },
] as const;

function AdminNavigation() {
  return (
    <nav aria-label="Admin tools" className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {adminGroups.map(({ title, description, icon: Icon, links }) => (
        <details
          key={title}
          className="group rounded-xl border border-border bg-card open:shadow-sm"
        >
          <summary className="flex min-h-[110px] cursor-pointer list-none items-start gap-3 rounded-xl p-4 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <Icon size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {description}
              </span>
            </span>
            <CaretDown
              size={15}
              className="mt-1 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-1 border-t border-border p-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="block rounded-lg px-3 py-2.5 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="block text-[13px] font-medium">{link.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {link.detail}
                </span>
              </Link>
            ))}
          </div>
        </details>
      ))}
      <Link
        to="/admin/fb-import"
        className="flex min-h-[110px] items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <DownloadSimple size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Seller listing import</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            Import and refresh listings from authorized sellers.
          </span>
        </span>
        <ArrowUpRight size={15} className="mt-1 shrink-0" aria-hidden="true" />
      </Link>
      <Link
        to="/admin/members"
        className="flex min-h-[110px] items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Users size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Members</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            Manage seller and shopper accounts.
          </span>
        </span>
        <ArrowUpRight size={15} className="mt-1 shrink-0" aria-hidden="true" />
      </Link>
    </nav>
  );
}

function AdminPage() {
  const fetchQueues = useServerFn(getAdminQueues);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-queues"],
    queryFn: () => fetchQueues(),
  });

  useEffect(() => {
    void trackEvent("pilot_console_viewed", {});
  }, []);

  if (isLoading)
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-sm text-muted-foreground">
        Loading admin overview…
      </p>
    );
  if (isError)
    return (
      <div role="alert" className="mx-auto max-w-[1000px] px-4 py-10">
        <p className="text-sm">The admin overview could not load.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary"
        >
          Try again
        </button>
      </div>
    );
  if (!data?.isAdmin)
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold">Operator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This console is limited to the Bluebird administrator account.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-tight">Admin overview</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Manage listings, dealerships, members, and marketplace activity.
        </p>
      </header>
      <AdminNavigation />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Queue title="Orders" count={data.orders.length} emptyLabel="No marketplace orders yet.">
          {data.orders.map((o) => (
            <li
              key={o.id}
              className="hairline-b flex items-center justify-between gap-3 px-4 py-2.5 last:border-b-0"
            >
              <span>
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="numeric font-medium hover:underline"
                >
                  {o.orderNumber}
                </Link>
                <span className="block text-[11.5px] text-muted-foreground">
                  {originLabels[o.origin] ?? o.origin} · {orderStatusLabels[o.status] ?? o.status}
                </span>
              </span>
              <span className="numeric">{formatUsd(o.totalCents)}</span>
            </li>
          ))}
        </Queue>

        <Queue title="Disputes" count={data.disputes.length} emptyLabel="No open disputes.">
          {data.disputes.map((d) => (
            <li
              key={d.id}
              className="hairline-b flex items-start justify-between gap-3 px-4 py-2.5 last:border-b-0"
            >
              <span>
                {disputeStatusLabels[d.status] ?? d.status}
                <span className="block text-[11.5px] text-muted-foreground">{d.reason}</span>
              </span>
              <Link
                to="/admin/orders/$orderId"
                params={{ orderId: d.orderId }}
                className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Open order
              </Link>
            </li>
          ))}
        </Queue>
      </div>
    </div>
  );
}
