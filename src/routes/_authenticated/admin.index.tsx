import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  getAdminQueues,
  getShopperApplicationDocumentUrl,
  reviewShopperApplication,
} from "@/lib/pilot.functions";
import {
  disputeStatusLabels,
  evidenceKindLabels,
  orderStatusLabels,
  originLabels,
  shopperApplicationStatusLabels,
} from "@/lib/market-labels";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: `${brand.name} operations console` },
      {
        name: "description",
        content:
          "Role-protected operator queues for Gem State Classifieds listings, orders, disputes, and seller activity.",
      },
      { property: "og:title", content: `${brand.name} operations console` },
      {
        property: "og:description",
        content:
          "Role-protected operator queues for Gem State Classifieds orders and trust review.",
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

function ShopperApplicationRow({
  application,
}: {
  application: {
    id: string;
    status: string;
    parkFrequency: string;
    applicantNote: string | null;
    createdAt: string;
  };
}) {
  const queryClient = useQueryClient();
  const fetchDocumentUrl = useServerFn(getShopperApplicationDocumentUrl);
  const review = useServerFn(reviewShopperApplication);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const documentMutation = useMutation({
    mutationFn: () => fetchDocumentUrl({ data: { applicationId: application.id } }),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer"),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open the document."),
  });

  const reviewMutation = useMutation({
    mutationFn: (approve: boolean) =>
      review({ data: { applicationId: application.id, approve, note: note || null } }),
    onSuccess: async (_result, approve) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-queues"] });
      toast.success(approve ? "Application approved." : "Application rejected.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not record the decision."),
  });

  return (
    <li className="hairline-b px-4 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {shopperApplicationStatusLabels[application.status] ?? application.status}
          <span className="block text-[11.5px] text-muted-foreground">
            Visits parks {application.parkFrequency} · <RelativeTime iso={application.createdAt} />
          </span>
          {application.applicantNote && (
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              &ldquo;{application.applicantNote}&rdquo;
            </span>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => documentMutation.mutate()}
            disabled={documentMutation.isPending}
            className="h-8 rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary disabled:opacity-50"
          >
            View ID
          </button>
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="h-8 rounded-md border border-input px-2.5 text-[12px] font-medium hover:bg-secondary"
          >
            {showNote ? "Hide note" : "Add note"}
          </button>
          <button
            type="button"
            onClick={() => reviewMutation.mutate(true)}
            disabled={reviewMutation.isPending}
            className="h-8 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => reviewMutation.mutate(false)}
            disabled={reviewMutation.isPending}
            className="h-8 rounded-md border border-input px-2.5 text-[12px] font-medium text-destructive hover:bg-secondary disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
      {showNote && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          placeholder="Reviewer note (shown to the applicant on rejection)"
          rows={2}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-[12.5px]"
        />
      )}
    </li>
  );
}

function AdminPage() {
  const fetchQueues = useServerFn(getAdminQueues);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-queues"],
    queryFn: () => fetchQueues(),
  });

  useEffect(() => {
    void trackEvent("pilot_console_viewed", {});
  }, []);

  if (isLoading) {
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (!data || !data.isAdmin) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Operator access required</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This console is limited to the Gem State administrator account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Pilot operations</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Live checkout is disabled. Every payment, capture, payout and verified sale here is
          evidence recorded from an external provider — ParkVault never authorizes, captures or
          holds funds. Every decision writes an append-only audit entry.
        </p>
        {data.isAdmin && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/admin/classifieds"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              Classified moderation
            </Link>
            <Link
              to="/admin/catalog"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Catalog operations
            </Link>
            <Link
              to="/admin/products"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Edit catalog pages
            </Link>
            <Link
              to="/admin/members"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Sellers &amp; shoppers
            </Link>

            <Link
              to="/admin/validation"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Validation summary
            </Link>
            <Link
              to="/admin/dealer-inventory"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Dealer inventory feeds
            </Link>
          </div>
        )}
      </div>

      <Queue
        title="Pilot orders"
        count={data.orders.length}
        emptyLabel="No real orders yet. Demonstration catalog activity is excluded."
      >
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

      <Queue
        title="Purchase evidence awaiting review"
        count={data.evidenceToReview.length}
        emptyLabel="No receipts or item photographs are waiting for confirmation."
      >
        {data.evidenceToReview.map((e) => (
          <li
            key={e.id}
            className="hairline-b flex items-center justify-between gap-3 px-4 py-2.5 last:border-b-0"
          >
            <span>
              {evidenceKindLabels[e.kind] ?? e.kind}
              <span className="block text-[11.5px] text-muted-foreground">
                {e.receiptAmountCents != null ? `${formatUsd(e.receiptAmountCents)} · ` : ""}
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </span>
            <Link
              to="/admin/orders/$orderId"
              params={{ orderId: e.orderId }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Review
            </Link>
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

      <Queue
        title="Product suggestions"
        count={data.suggestions.length}
        emptyLabel="No product suggestions are waiting for review."
      >
        {data.suggestions.map((s) => (
          <li key={s.id} className="hairline-b px-4 py-2.5 last:border-b-0">
            {s.proposedName}
            <span className="block text-[11.5px] text-muted-foreground">
              {s.status} · {new Date(s.createdAt).toLocaleDateString()}
            </span>
          </li>
        ))}
      </Queue>

      <Queue
        title="Flagged sightings"
        count={data.flaggedSightings.length}
        emptyLabel="No sightings have been flagged."
      >
        {data.flaggedSightings.map((s) => (
          <li key={s.id} className="hairline-b px-4 py-2.5 last:border-b-0">
            {s.flagCount} flag(s) · {s.confirmationCount} confirmation(s)
            <span className="block text-[11.5px] text-muted-foreground">
              Seen {new Date(s.seenAt).toLocaleString()}
            </span>
          </li>
        ))}
      </Queue>

      <Queue
        title="Shopper applications"
        count={data.shopperApplications.length}
        emptyLabel="No shopper applications are waiting for review."
      >
        {data.shopperApplications.map((a) => (
          <ShopperApplicationRow key={a.id} application={a} />
        ))}
      </Queue>
    </div>
  );
}
