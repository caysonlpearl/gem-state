import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import {
  getAdminClassifiedQueue,
  getAdminClassifiedReports,
  type AdminClassifiedRow,
} from "@/lib/classifieds.functions";
import { adminReviewAsk } from "@/lib/admin-catalog.functions";
import { RelativeTime } from "@/components/ui/relative-time";

export const Route = createFileRoute("/_authenticated/admin/classifieds")({
  head: () => ({
    meta: [
      { title: "Classified moderation · Gem State Classifieds" },
      {
        name: "description",
        content:
          "Review classified listing photos, details, seller notes, and vehicle information before publication.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassifiedModerationPage,
});

const conditionLabels: Record<string, string> = {
  new_with_tags: "New",
  new_without_tags: "New, no tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

function vehicleSummary(vehicle: AdminClassifiedRow["vehicle"]) {
  if (!vehicle) return null;
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

function ClassifiedModerationRow({ listing }: { listing: AdminClassifiedRow }) {
  const queryClient = useQueryClient();
  const review = useServerFn(adminReviewAsk);
  const [note, setNote] = useState("");
  const reviewMutation = useMutation({
    mutationFn: (approve: boolean) =>
      review({ data: { askId: listing.id, approve, note: note.trim() || null } }),
    onSuccess: async (_result, approve) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-classified-queue"] });
      toast.success(approve ? "Classified listing approved." : "Classified listing rejected.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not record the moderation decision.",
      ),
  });
  const vehicle = vehicleSummary(listing.vehicle);

  return (
    <li className="border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {listing.listingImageUrls.slice(0, 3).map((url, index) => (
            <img
              key={url}
              src={url}
              alt={`${listing.title} listing photo ${index + 1}`}
              className="h-20 w-20 rounded-md border border-border object-cover"
            />
          ))}
          {listing.listingImageUrls.length === 0 ? (
            <div className="grid h-20 w-20 place-items-center rounded-md border border-border text-center text-[10px] text-muted-foreground">
              No public photos
            </div>
          ) : null}
        </div>
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">{listing.title}</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {listing.categoryName} · {listing.city}, {listing.state} · {listing.region}
              </p>
            </div>
            <p className="numeric text-[14px] font-semibold">{formatUsd(listing.priceCents)}</p>
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            {conditionLabels[listing.condition] ?? listing.condition} ·{" "}
            {listing.fulfillmentMode.replaceAll("_", " ")} · Seller:{" "}
            {listing.sellerDisplayName || listing.sellerHandle} ·{" "}
            <RelativeTime iso={listing.createdAt} />
          </p>
          {vehicle ? (
            <p className="mt-2 text-[12px] font-medium">
              {vehicle}
              {listing.vehicle?.mileage != null
                ? ` · ${listing.vehicle.mileage.toLocaleString()} miles`
                : ""}
              {listing.vehicle?.drivetrain ? ` · ${listing.vehicle.drivetrain}` : ""}
              {listing.vehicle?.titleStatus ? ` · ${listing.vehicle.titleStatus} title` : ""}
            </p>
          ) : null}
          {listing.sellerNote ? (
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Seller note: {listing.sellerNote}
            </p>
          ) : null}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            rows={2}
            placeholder="Optional moderation note"
            className="mt-3 w-full max-w-[560px] rounded-md border border-input bg-background px-3 py-2 text-[12px]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reviewMutation.mutate(true)}
              disabled={reviewMutation.isPending}
              className="h-9 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Approve listing
            </button>
            <button
              type="button"
              onClick={() => reviewMutation.mutate(false)}
              disabled={reviewMutation.isPending}
              className="h-9 rounded-md border border-input px-3 text-[12px] font-medium text-destructive disabled:opacity-50"
            >
              Reject listing
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ClassifiedModerationPage() {
  const fetchQueue = useServerFn(getAdminClassifiedQueue);
  const fetchReports = useServerFn(getAdminClassifiedReports);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-classified-queue"],
    queryFn: () => fetchQueue(),
  });
  const reports = useQuery({
    queryKey: ["admin-classified-reports"],
    queryFn: () => fetchReports(),
  });

  if (isLoading) {
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-muted-foreground">
        Loading moderation queue…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p className="mx-auto max-w-[1000px] px-4 py-10 text-[13px] text-destructive">
        The moderation queue could not be loaded.
      </p>
    );
  }
  if (!data.isAdmin) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Administrator access required</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Classified moderation is limited to Gem State administrators.
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Gem State operations
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Classified moderation</h1>
        <p className="mt-1 max-w-[720px] text-[13px] leading-relaxed text-muted-foreground">
          Review every seller-submitted listing before it appears publicly. Confirm that the photos,
          item details, location, and vehicle information are clear and accurate.
        </p>
      </div>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold">
            Awaiting review{" "}
            <span className="numeric text-muted-foreground">{data.listings.length}</span>
          </h2>
        </div>
        {data.listings.length === 0 ? (
          <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
            No classified listings are waiting for review.
          </p>
        ) : (
          <ul>
            {data.listings.map((listing) => (
              <ClassifiedModerationRow key={listing.id} listing={listing} />
            ))}
          </ul>
        )}
      </section>
      {reports.data?.isAdmin && (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold">
              Open listing reports{" "}
              <span className="numeric text-muted-foreground">{reports.data.reports.length}</span>
            </h2>
          </div>
          {reports.data.reports.length === 0 ? (
            <p className="px-4 py-8 text-[12.5px] text-muted-foreground">
              No open listing reports.
            </p>
          ) : (
            <ul>
              {reports.data.reports.map((report) => (
                <li key={report.id} className="border-b border-border p-4 last:border-b-0">
                  <p className="text-[12.5px] font-semibold">{report.reason}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Listing {report.listingId} · {new Date(report.createdAt).toLocaleString()}
                  </p>
                  {report.details && (
                    <p className="mt-2 text-[12px] leading-relaxed">{report.details}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
