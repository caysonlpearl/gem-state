import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { createSourcingRequest } from "@/lib/sourcing.functions";

function toCents(value: string) {
  if (!value.trim()) return null;
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/**
 * A buyer requests a custom sourcing quote when no fixed-price sourcing offer
 * (SourcingPanel) fits. Approved shoppers browse open requests and respond
 * with their own price; the buyer compares quotes and accepts one on /buying.
 */
export function RequestSourcingForm({
  variantId,
  isDemo,
}: {
  productSlug: string;
  variantId: string;
  variantLabel: string;
  isDemo: boolean;
}) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const fetchFacets = useServerFn(getCatalogFacets);
  const submitRequest = useServerFn(createSourcingRequest);

  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const facets = useQuery({
    queryKey: ["catalog-facets"],
    queryFn: () => fetchFacets(),
    enabled: open && !isDemo,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("Sign in required.");

      const mediaPaths: string[] = [];
      for (const file of photos.slice(0, 6)) {
        const ext =
          file.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("request-media").upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
        mediaPaths.push(path);
      }

      return submitRequest({
        data: {
          variantId,
          maxBudgetCents: toCents(budget),
          buyerNote: note || null,
          neededBy: neededBy || null,
          targetLocationId: locationId || null,
          mediaPaths,
        },
      });
    },
    onSuccess: async () => {
      await trackEvent("sourcing_request_submitted", {});
      await queryClient.invalidateQueries({ queryKey: ["my-sourcing-requests"] });
      setSubmitted(true);
      setBudget("");
      setNeededBy("");
      setNote("");
      setPhotos([]);
      toast.success("Sourcing request posted. Approved shoppers can now quote it.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not post the request."),
  });

  if (isDemo) return null;

  if (!isSignedIn) {
    return (
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        <Link to={brand.urls.auth} className="underline underline-offset-2">
          Sign in
        </Link>{" "}
        to request sourcing on this variation.
      </p>
    );
  }

  const geography = facets.data?.geography ?? [];

  return (
    <div className="mt-4">
      {!open && !submitted && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
        >
          Can&apos;t find an offer you want? Request sourcing
        </button>
      )}

      {submitted && !open && (
        <p className="text-[12.5px] text-muted-foreground">
          Request posted.{" "}
          <Link to="/buying" className="underline underline-offset-2">
            Track quotes on Buying
          </Link>
          .
        </p>
      )}

      {open && (
        <form
          className="rounded-lg border border-border bg-card px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            requestMutation.mutate();
          }}
        >
          <h3 className="text-[13px] font-semibold tracking-tight">Request sourcing</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Approved shoppers see this request without your identity and can respond with a fixed
            all-in price. You compare quotes and accept one — nothing is charged until then.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rs-budget" className="text-[12px] font-medium">
                Maximum budget (optional)
              </label>
              <input
                id="rs-budget"
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="75.00"
                className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="rs-needed-by" className="text-[12px] font-medium">
                Needed by (optional)
              </label>
              <input
                id="rs-needed-by"
                type="date"
                value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          {geography.length > 0 && (
            <div className="mt-3">
              <label htmlFor="rs-location" className="text-[12px] font-medium">
                Preferred store (optional)
              </label>
              <select
                id="rs-location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No preference</option>
                {geography.map((resort) => (
                  <optgroup key={resort.resortId} label={resort.resortName}>
                    {resort.parks.flatMap((park) =>
                      park.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {park.name} — {location.name}
                        </option>
                      )),
                    )}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="rs-note" className="text-[12px] font-medium">
              Anything a shopper should know (optional)
            </label>
            <textarea
              id="rs-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 500))}
              rows={2}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-3">
            <label htmlFor="rs-photos" className="text-[12px] font-medium">
              Reference photos (optional, up to 6, private)
            </label>
            <input
              id="rs-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 6))}
              className="mt-1.5 block text-[12.5px]"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={requestMutation.isPending}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground disabled:opacity-60"
            >
              {requestMutation.isPending ? "Posting…" : "Post request"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
