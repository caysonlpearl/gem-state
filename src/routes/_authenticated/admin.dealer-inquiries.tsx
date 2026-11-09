import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDealerInquiries, updateDealerInquiry } from "@/lib/dealer-inquiry.functions";
import { DEALER_INQUIRY_STATUSES, type DealerInquiryStatus } from "@/lib/dealer-inquiry-contract";
export const Route = createFileRoute("/_authenticated/admin/dealer-inquiries")({
  head: () => ({
    meta: [
      { title: "Dealership inquiries | Bluebird" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DealerInquiries,
});
function DealerInquiries() {
  const load = useServerFn(getDealerInquiries);
  const update = useServerFn(updateDealerInquiry);
  const cache = useQueryClient();
  const [filter, setFilter] = useState("all");
  const query = useQuery({
    queryKey: ["dealer-inquiries"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (data: { id: string; status: DealerInquiryStatus }) => update({ data }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["dealer-inquiries"] }),
  });
  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <Link to="/admin" className="text-sm underline">
        ← Administration
      </Link>
      <h1 className="mt-5 text-3xl font-semibold">Dealership inquiries</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Private inventory connection requests. Notifications go to bluebirdmarketplaceid@gmail.com.
        Showing the latest 200 requests.
      </p>
      <div className="my-6 flex flex-wrap items-center gap-4">
        <label htmlFor="inquiry-filter" className="text-sm">
          Status
        </label>
        <select
          id="inquiry-filter"
          className="rounded border bg-background p-2"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All inquiries</option>
          {DEALER_INQUIRY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void query.refetch()}>
          Refresh
        </button>
      </div>
      {query.isPending ? (
        <p>Loading inquiries…</p>
      ) : query.isError ? (
        <p role="alert">Could not load inquiries. Please try Refresh.</p>
      ) : query.data?.filter((lead) => filter === "all" || lead.status === filter).length === 0 ? (
        <p>No inquiries in this view.</p>
      ) : (
        query.data
          ?.filter((lead) => filter === "all" || lead.status === filter)
          .map((lead) => (
            <article key={lead.id} className="mb-4 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{lead.dealership_name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleString()}
                  </p>
                </div>
                <label className="text-xs">
                  Inquiry status{" "}
                  <select
                    aria-label={`Status for ${lead.dealership_name}`}
                    value={lead.status}
                    disabled={mutation.isPending}
                    onChange={(event) =>
                      mutation.mutate({
                        id: lead.id,
                        status: event.target.value as DealerInquiryStatus,
                      })
                    }
                    className="ml-2 rounded border bg-background p-2"
                  >
                    {DEALER_INQUIRY_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status[0].toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <p>{lead.name}</p>
                <a className="break-all underline" href={`mailto:${lead.email}`}>
                  {lead.email}
                </a>
                <a
                  className="break-all underline"
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {lead.website}
                </a>
                <p>{lead.phone || "No phone provided"}</p>
                {lead.provider && <p>Provider: {lead.provider}</p>}
                {lead.inventory_count && <p>Vehicles: {lead.inventory_count}</p>}
              </div>
              {lead.notes && <p className="mt-4 whitespace-pre-wrap text-sm">{lead.notes}</p>}
              <p className="mt-4 text-xs text-muted-foreground">
                Email notification:{" "}
                <strong>
                  {lead.notification_status === "sent"
                    ? "Accepted by email provider"
                    : lead.notification_status}
                </strong>{" "}
                · {lead.notification_attempts} attempt(s)
                {lead.notification_status === "failed" &&
                  " · Automatic attempts exhausted; contact the lead from this inbox."}
              </p>
              {Object.keys(lead.attribution).length > 0 && (
                <details className="mt-3 text-xs">
                  <summary>Campaign attribution</summary>
                  {Object.entries(lead.attribution).map(([key, value]) => (
                    <p key={key} className="mt-1 break-all">
                      {key}: {value}
                    </p>
                  ))}
                </details>
              )}
            </article>
          ))
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          Could not save the status. Please try again.
        </p>
      )}
    </section>
  );
}
