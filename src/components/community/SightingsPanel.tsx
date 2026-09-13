import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { MapPin } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import type { IllustrativeActivity } from "@/config/illustrative-activity";
import { formatUsd } from "@/config/fees";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";
import { getCatalogFacets } from "@/lib/catalog.functions";
import {
  SIGHTING_AVAILABILITY,
  availabilityLabels,
  getVariantSightings,
  reportSighting,
  respondToSighting,
  type SightingAvailability,
} from "@/lib/community.functions";

function toCents(value: string) {
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function relative(iso: string) {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "within the hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * In-park sightings for one exact variation. A sighting is a member report that
 * the item was on a shelf at one specific location — never an offer, never a
 * price ParkVault stands behind, and never attributed to the reporter.
 */
export function SightingsPanel({
  productSlug,
  variantId,
  variantLabel,
  isDemo,
  illustrative,
}: {
  productSlug: string;
  variantId: string;
  variantLabel: string;
  isDemo: boolean;
  illustrative?: IllustrativeActivity | null;
}) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const fetchSightings = useServerFn(getVariantSightings);
  const fetchFacets = useServerFn(getCatalogFacets);
  const report = useServerFn(reportSighting);
  const respond = useServerFn(respondToSighting);

  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [availability, setAvailability] = useState<SightingAvailability>("in_stock");
  const [price, setPrice] = useState("");
  const [seenAt, setSeenAt] = useState("");
  const [note, setNote] = useState("");

  const sightings = useQuery({
    queryKey: ["sightings", variantId],
    queryFn: () => fetchSightings({ data: { variantId } }),
    enabled: !isDemo,
  });
  const facets = useQuery({
    queryKey: ["catalog-facets"],
    queryFn: () => fetchFacets(),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sightings", variantId] });

  const reportMutation = useMutation({
    mutationFn: () =>
      report({
        data: {
          variantId,
          locationId,
          availability,
          priceCents: price ? toCents(price) : null,
          note: note || null,
          seenAt: seenAt ? new Date(seenAt).toISOString() : null,
        },
      }),
    onSuccess: async () => {
      await trackEvent("sighting_reported", { product_slug: productSlug, availability });
      setOpen(false);
      setPrice("");
      setNote("");
      setSeenAt("");
      await invalidate();
      toast.success("Sighting recorded. Other members can confirm it.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not record the sighting."),
  });

  const respondMutation = useMutation({
    mutationFn: (input: { sightingId: string; kind: "confirm" | "flag" }) =>
      respond({ data: input }),
    onSuccess: async (_result, input) => {
      await trackEvent(input.kind === "confirm" ? "sighting_confirmed" : "sighting_flagged", {
        product_slug: productSlug,
      });
      await invalidate();
      toast.success(
        input.kind === "confirm" ? "Confirmation recorded." : "Report flagged for review.",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not respond."),
  });

  if (isDemo && !illustrative) return null;

  // Real reported sightings always win once they exist; illustrative rows are
  // only a placeholder for variations that have none yet.
  const realList = sightings.data ?? [];
  const list = realList.length > 0 ? realList : (illustrative?.sightings ?? []);
  const isIllustrative = realList.length === 0 && list.length > 0;
  const locations = (facets.data?.geography ?? []).flatMap((resort) =>
    resort.parks.flatMap((park) =>
      park.locations.map((location) => ({
        id: location.id,
        label: `${resort.resortCode} · ${park.name} · ${location.name}`,
      })),
    ),
  );

  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
          <MapPin size={14} />
          In-park sightings — {variantLabel}
        </h2>
        <span className="numeric text-[11.5px] text-muted-foreground">
          {isIllustrative
            ? `${list.length} sightings`
            : sightings.isLoading
              ? "Loading…"
              : `${list.length} in the last 90 days`}
        </span>
      </div>
      {isIllustrative && (
        <p className="px-4 pt-2 text-[11px] text-muted-foreground">
          Preview—activity shown is illustrative.
        </p>
      )}

      <div className="px-4 py-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          A sighting is one member reporting this exact variation on a shelf at one specific
          location. It is not an offer and not a price ParkVault verifies. Reporters are never
          shown.
        </p>

        {!sightings.isLoading && list.length === 0 && (
          <p className="mt-3 text-[12.5px] font-medium text-muted-foreground">
            No sightings reported yet
          </p>
        )}

        {list.length > 0 && (
          <ul className="mt-3 space-y-2">
            {list.map((sighting) => (
              <li key={sighting.id} className="rounded-md border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12.5px] font-medium">
                    {sighting.locationName}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {sighting.parkName} · {sighting.resortCode}
                    </span>
                  </p>
                  <span className="numeric text-[11.5px] text-muted-foreground">
                    {isIllustrative ? sighting.seenAt.slice(0, 10) : relative(sighting.seenAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {availabilityLabels[sighting.availability] ?? sighting.availability}
                  {sighting.priceCents != null && (
                    <>
                      {" · "}
                      <span className="numeric">{formatUsd(sighting.priceCents)}</span> observed
                      shelf price
                    </>
                  )}
                  {sighting.confirmationCount > 0 && (
                    <> · {sighting.confirmationCount} confirmation(s)</>
                  )}
                </p>
                {sighting.note && (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {sighting.note}
                  </p>
                )}
                {isSignedIn && !isIllustrative && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({ sightingId: sighting.id, kind: "confirm" })
                      }
                      disabled={respondMutation.isPending}
                      className="h-7 rounded-md border border-input px-2.5 text-[11.5px] font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      I saw it too
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({ sightingId: sighting.id, kind: "flag" })
                      }
                      disabled={respondMutation.isPending}
                      className="h-7 rounded-md border border-input px-2.5 text-[11.5px] font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
                    >
                      Flag
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {isSignedIn ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary"
            >
              Report a sighting
            </button>
          ) : (
            <Link
              to={brand.urls.auth}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium"
            >
              Sign in to report a sighting
            </Link>
          )}
        </div>
      </div>

      {open && (
        <form
          className="hairline-t space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!locationId) {
              toast.error("Choose the location where you saw it.");
              return;
            }
            reportMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="sighting-location" className="text-[12px] font-medium">
              Where you saw it
            </label>
            <select
              id="sighting-location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Select a park, district or store</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sighting-availability" className="text-[12px] font-medium">
                What you saw
              </label>
              <select
                id="sighting-availability"
                value={availability}
                onChange={(event) => setAvailability(event.target.value as SightingAvailability)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {SIGHTING_AVAILABILITY.map((value) => (
                  <option key={value} value={value}>
                    {availabilityLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sighting-seen-at" className="text-[12px] font-medium">
                When (optional, defaults to now)
              </label>
              <input
                id="sighting-seen-at"
                type="datetime-local"
                value={seenAt}
                onChange={(event) => setSeenAt(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sighting-price" className="text-[12px] font-medium">
              Shelf price you saw (optional, USD)
            </label>
            <input
              id="sighting-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="34.99"
              className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="sighting-note" className="text-[12px] font-medium">
              Short note (optional, 280 characters)
            </label>
            <textarea
              id="sighting-note"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Back wall display, several left."
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Report only what you saw yourself. Sightings are limited to 10 per day, are visible
            without your name, and can be flagged by other members.
          </p>

          <button
            type="submit"
            disabled={reportMutation.isPending}
            className="h-9 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {reportMutation.isPending ? "Recording…" : "Record sighting"}
          </button>
        </form>
      )}
    </div>
  );
}
