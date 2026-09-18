import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { formatUsd } from "@/config/fees";
import { ListingForm, ListingFormBackLink } from "@/components/classifieds/listing-form/ListingForm";
import { getClassifiedListingEditor } from "@/lib/classifieds.functions";

export const Route = createFileRoute("/_authenticated/listings/$listingId/edit")({
  component: ListingEditorPage,
});

const editorQuery = (listingId: string) =>
  queryOptions({
    queryKey: ["classified-listing-editor", listingId],
    queryFn: () => getClassifiedListingEditor({ data: { listingId } }),
  });

function ListingEditorPage() {
  const { listingId } = Route.useParams();
  const listing = useQuery(editorQuery(listingId));

  if (listing.isLoading)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-12 text-[13px] text-muted-foreground">
        Loading listing…
      </main>
    );
  if (!listing.data)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-12">
        <h1 className="text-[20px] font-semibold">Listing not found</h1>
      </main>
    );

  return (
    <main className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
      <ListingFormBackLink />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Gem State seller center
          </p>
          <h1 className="mt-1 font-editorial text-[36px] font-normal tracking-[-0.04em]">
            Edit listing
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Current price: {formatUsd(listing.data.priceCents)}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {listing.data.status === "active" && !listing.data.approvedAt
            ? "Awaiting review"
            : listing.data.status}
        </span>
      </div>
      <ListingForm
        mode="edit"
        listingId={listingId}
        initial={listing.data}
        status={listing.data.status}
      />
    </main>
  );
}
