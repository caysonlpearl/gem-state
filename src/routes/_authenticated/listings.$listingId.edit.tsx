import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { supabase } from "@/integrations/supabase/client";
import { getListingEditor, updateSellerListing } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/listings/$listingId/edit")({
  component: ListingEditorPage,
});

const conditionLabels: Record<string, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  used_excellent: "Used — excellent",
  used_good: "Used — good",
};

function ListingEditorPage() {
  const { listingId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchListing = useServerFn(getListingEditor);
  const update = useServerFn(updateSellerListing);
  const listing = useQuery({
    queryKey: ["listing-editor", listingId],
    queryFn: () => fetchListing({ data: { listingId } }),
  });
  const [draft, setDraft] = useState<Record<string, string | undefined> | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rights, setRights] = useState(false);

  useEffect(() => {
    if (!listing.data || draft) return;
    setDraft({
      price: (listing.data.priceCents / 100).toFixed(2),
      condition: String(listing.data.condition ?? ""),
      note: String(listing.data.note ?? ""),
      length: listing.data.parcelLengthIn,
      width: listing.data.parcelWidthIn,
      height: listing.data.parcelHeightIn,
      weight: listing.data.parcelWeightLb,
    });
  }, [listing.data, draft]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Listing is still loading.");
      const publicMediaPaths: string[] = [];
      if (files.length > 0) {
        if (!rights)
          throw new Error("Confirm you have permission to publish the replacement photos.");
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        for (const file of files.slice(0, 8)) {
          const ext =
            file.name
              .split(".")
              .pop()
              ?.toLowerCase()
              .replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `${uid}/${crypto.randomUUID()}.${ext}`;
          const uploaded = await supabase.storage
            .from("listing-media")
            .upload(path, file, { contentType: file.type || "image/jpeg" });
          if (uploaded.error) throw new Error(uploaded.error.message);
          publicMediaPaths.push(path);
        }
      }
      return update({
        data: {
          listingId,
          priceCents: Math.round(Number(draft["price"] ?? "0") * 100),
          condition: draft["condition"] ?? "",
          note: draft["note"] ?? "",
          parcelLengthIn: draft["length"] ?? "",
          parcelWidthIn: draft["width"] ?? "",
          parcelHeightIn: draft["height"] ?? "",
          parcelWeightLb: draft["weight"] ?? "",
          publicMediaPaths,
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listing-editor", listingId] }),
        queryClient.invalidateQueries({ queryKey: ["my-listings"] }),
      ]);
      toast.success("Listing updated and submitted for ParkVault approval.");
      await navigate({ to: "/selling" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update listing."),
  });

  if (listing.isLoading || !draft)
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
  const set = (key: string, value: string) =>
    setDraft((current) => ({ ...(current ?? {}), [key]: value }));

  return (
    <main className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <Link to="/selling" className="text-[12px] text-muted-foreground hover:text-foreground">
        ← Seller dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-editorial text-[34px] font-normal tracking-[-0.03em]">
            Edit listing
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {listing.data.productName} · {listing.data.variantLabel}
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {listing.data.status === "active" && !listing.data.approvedAt
            ? "Awaiting approval"
            : listing.data.status}
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
        className="mt-6 space-y-5 border border-border bg-card p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[12px] font-medium">
            Listing price (USD)
            <input
              value={draft["price"] ?? ""}
              onChange={(e) => set("price", e.target.value)}
              inputMode="decimal"
              className="numeric mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
            />
            <span className="mt-1 block text-[10.5px] text-muted-foreground">
              Current: {formatUsd(listing.data.priceCents)}
            </span>
          </label>
          <label className="text-[12px] font-medium">
            Condition
            <select
              value={draft["condition"] ?? ""}
              onChange={(e) => set("condition", e.target.value)}
              className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
            >
              {Object.entries(conditionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[12px] font-medium">
          Seller note
          <textarea
            value={draft["note"] ?? ""}
            onChange={(e) => set("note", e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div>
          <p className="text-[12px] font-medium">Package details</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["length", "Length (in)"],
              ["width", "Width (in)"],
              ["height", "Height (in)"],
              ["weight", "Weight (lb)"],
            ].map(([key, label]) => (
              <label key={key} className="text-[11px] text-muted-foreground">
                {label}
                <input
                  value={draft[key ?? ""] ?? ""}
                  onChange={(e) => set(key ?? "", e.target.value)}
                  inputMode="decimal"
                  className="numeric mt-1 h-9 w-full border border-input bg-background px-2 text-foreground"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="border-t border-border pt-5">
          <p className="text-[12px] font-medium">Buyer-visible photos</p>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {listing.data.imageUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt="Current listing"
                className="h-24 w-24 shrink-0 bg-secondary object-contain"
              />
            ))}
          </div>
          <label className="mt-3 block text-[11.5px] text-muted-foreground">
            Replace all photos (optional)
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="mt-1 block text-[12px]"
            />
          </label>
          {files.length > 0 ? (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={rights}
                onChange={(e) => setRights(e.target.checked)}
                className="mt-0.5"
              />
              I took these photos or have permission to publish them.
            </label>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || listing.data.status !== "active"}
          className="h-10 bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Saving a change returns this listing to ParkVault review. It stays hidden from buyers
          until an administrator approves it again.
        </p>
      </form>
    </main>
  );
}
