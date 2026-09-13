import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { formatUsd } from "@/config/fees";
import { trackEvent } from "@/lib/analytics";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { getMemberPerformance } from "@/lib/pilot.functions";
import { AVAILABILITY_HOURS } from "@/lib/shopper-labels";
import { getMyServiceProfile, saveServiceProfile, setAvailability } from "@/lib/shopper.functions";

function toCents(value: string) {
  return Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

/**
 * Sourcing service profile for an approved shopper.
 *
 * This screen is only rendered for members who already hold the approved
 * shopper role; the database refuses these writes for anyone else, so a member
 * can never grant themselves shopper capabilities from the client. Saving with
 * "offer across catalog" on and at least one location covered lists the
 * shopper immediately — no separate "go live" step required. The "live in the
 * parks right now" toggle is a purely informational badge with its own expiry;
 * it never gates whether the shopper is listed or requestable.
 */
export function ServiceProfileForm() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyServiceProfile);
  const fetchFacets = useServerFn(getCatalogFacets);
  const fetchPerformance = useServerFn(getMemberPerformance);
  const save = useServerFn(saveServiceProfile);
  const setAvail = useServerFn(setAvailability);

  const profile = useQuery({
    queryKey: ["shopper-service-profile"],
    queryFn: () => fetchProfile(),
  });
  const facets = useQuery({ queryKey: ["catalog-facets"], queryFn: () => fetchFacets() });
  const performance = useQuery({
    queryKey: ["shopper-performance"],
    queryFn: () => fetchPerformance({ data: {} }),
  });

  const [fee, setFee] = useState("15.00");
  const [windowDays, setWindowDays] = useState("7");
  const [maxOrders, setMaxOrders] = useState("3");
  const [offerAcross, setOfferAcross] = useState(true);
  const [resortIds, setResortIds] = useState<string[]>([]);
  const [parkIds, setParkIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [hours, setHours] = useState("8");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const data = profile.data;
    if (!data || hydrated) return;
    setFee((data.flatFeeCents / 100).toFixed(2));
    setWindowDays(String(data.purchaseWindowDays));
    setMaxOrders(String(data.maxActiveOrders));
    setOfferAcross(data.offerAcrossCatalog);
    setResortIds(data.coverage.resortIds);
    setParkIds(data.coverage.parkIds);
    setLocationIds(data.coverage.locationIds);
    setHydrated(true);
  }, [profile.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          flatFeeCents: toCents(fee),
          purchaseWindowDays: Number(windowDays),
          maxActiveOrders: Number(maxOrders),
          offerAcrossCatalog: offerAcross,
          resortIds,
          parkIds,
          locationIds,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopper-service-profile"] });
      toast.success("Sourcing settings saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the profile."),
  });

  const availabilityMutation = useMutation({
    mutationFn: (next: boolean) => setAvail({ data: { available: next, hours: Number(hours) } }),
    onSuccess: async (result) => {
      if (result.availableUntil) {
        await trackEvent("shopper_availability_enabled", { hours: Number(hours) });
        toast.success("Live badge added — you were already listed either way.");
      } else {
        toast.success("Live badge removed. You're still listed to source.");
      }
      await queryClient.invalidateQueries({ queryKey: ["shopper-service-profile"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not change your availability."),
  });

  const goLiveMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      return availabilityMutation.mutateAsync(true);
    },
  });

  const geography = facets.data?.geography ?? [];
  const current = profile.data;
  const hasCoverage = resortIds.length > 0 || parkIds.length > 0 || locationIds.length > 0;
  const payoutReady =
    current?.stripeAccountModeCurrent &&
    current?.stripeDetailsSubmitted &&
    current?.stripePayoutsEnabled;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card">
      <div className="hairline-b flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">Your sourcing service profile</h2>
        {current && (
          <span className="numeric text-[11.5px] text-muted-foreground">
            {current.activeOrders} active · {current.completedOrders} completed ·{" "}
            {current.cancelledOrders} cancelled
            {performance.data && performance.data.reviewCount > 0 && (
              <>
                {" "}
                · {performance.data.averageRating?.toFixed(1)}★ ({performance.data.reviewCount})
              </>
            )}
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Saving these settings below lists you on every covered product right away — buyers can
          request you whether or not you&apos;re in the parks this minute. Being listed means you
          are willing to attempt the purchase within your stated window — it never claims the
          merchandise is confirmed in stock, and ParkVault freezes your fee on any transaction a
          buyer starts.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="sp-fee" className="text-[12px] font-medium">
              Your earnings per item (USD)
            </label>
            <input
              id="sp-fee"
              type="number"
              inputMode="decimal"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              min="10"
              max="25"
              step="1"
            />
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              Choose $10–$25. $15 is recommended. ParkVault does not deduct from this amount.
            </p>
          </div>
          <div>
            <label htmlFor="sp-window" className="text-[12px] font-medium">
              Expected purchase window (days)
            </label>
            <input
              id="sp-window"
              inputMode="numeric"
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
              className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="sp-max" className="text-[12px] font-medium">
              Maximum simultaneous sourcing orders
            </label>
            <input
              id="sp-max"
              inputMode="numeric"
              value={maxOrders}
              onChange={(event) => setMaxOrders(event.target.value)}
              className="numeric mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        {current && (
          <p
            className={`mt-2 text-[11.5px] ${
              current.activeOrders >= current.maxActiveOrders
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {current.activeOrders} of {current.maxActiveOrders} simultaneous sourcing slots in use.
            {current.activeOrders >= current.maxActiveOrders
              ? " You are at capacity, so you are hidden from product pages until a request finishes or is cancelled. Raise the limit above and save to be listed again."
              : " Buyers can request you while a slot is open."}
          </p>
        )}

        <label className="mt-4 flex items-start gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={offerAcross}
            onChange={(event) => setOfferAcross(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Auto-post my fee across every covered product
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              With this on, saving posts your fee to every eligible product in the resorts, parks
              and stores you cover below — no need to post item by item. When it&apos;s off you
              appear on no sourcing options, and you can still post individual fixed-price offers.
            </span>
          </span>
        </label>
        {offerAcross && !hasCoverage && (
          <p className="mt-2 text-[11.5px] font-medium text-destructive">
            Select at least one resort, park or store below — with nothing checked, saving
            won&apos;t list you on any product.
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="text-[12px] font-medium">Locations you cover</legend>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Select a whole resort, or narrow to specific parks, districts and stores.
          </p>
          <div className="mt-2 space-y-3">
            {geography.map((resort) => (
              <div key={resort.resortId} className="rounded-md border border-border px-3 py-2.5">
                <label className="flex items-center gap-2 text-[12.5px] font-medium">
                  <input
                    type="checkbox"
                    checked={resortIds.includes(resort.resortId)}
                    onChange={() => setResortIds((list) => toggle(list, resort.resortId))}
                  />
                  {resort.resortName} — entire resort
                </label>
                <div className="mt-2 space-y-2 pl-5">
                  {resort.parks.map((park) => (
                    <div key={park.id}>
                      <label className="flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={parkIds.includes(park.id)}
                          onChange={() => setParkIds((list) => toggle(list, park.id))}
                        />
                        {park.name}
                      </label>
                      {park.locations.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-5">
                          {park.locations.map((location) => (
                            <label
                              key={location.id}
                              className="flex items-center gap-1.5 text-[11.5px]"
                            >
                              <input
                                type="checkbox"
                                checked={locationIds.includes(location.id)}
                                onChange={() => setLocationIds((list) => toggle(list, location.id))}
                              />
                              {location.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {geography.length === 0 && (
              <p className="text-[12px] text-muted-foreground">Park geography is still loading.</p>
            )}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="mt-4 inline-flex h-11 items-center rounded-md bg-nav-accent px-5 text-[14px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : "Save & start receiving requests"}
        </button>
      </div>

      <div className="hairline-t px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-[12.5px] font-semibold tracking-tight">
              Get paid
              {payoutReady ? (
                <CheckCircle size={16} weight="fill" className="text-primary" />
              ) : null}
            </h3>
            <p className="mt-1 max-w-[560px] text-[11.5px] leading-relaxed text-muted-foreground">
              Stripe's hosted form collects the identity, tax and bank details it requires.
              ParkVault receives only account readiness flags, never the ID image or bank details.
              You need this connected before ParkVault can send you a payout for a completed job.
            </p>
          </div>
          <div>
            {current?.payoutProviderConfigured ? (
              <Link
                to="/shopper-payouts"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[12.5px] font-medium text-primary-foreground"
              >
                {payoutReady ? "Manage payout details" : "Set up payouts"}
                <ArrowRight size={15} />
              </Link>
            ) : (
              <span className="border border-brand-warm/40 bg-brand-warm/10 px-3 py-2 text-[11.5px] text-brand-warm">
                Payout setup temporarily unavailable
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="hairline-t px-4 py-3">
        <h3 className="text-[12.5px] font-semibold tracking-tight">Live in the parks right now</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Optional. This only adds a badge next to your listing so buyers know you can act
          immediately — it does not control whether you&apos;re listed at all.{" "}
          {current?.available && current.availableUntil
            ? `You're marked live until ${new Date(current.availableUntil).toLocaleString()}.`
            : ""}
        </p>
        <div className="mt-2.5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sp-hours" className="text-[12px] font-medium">
              Mark live for
            </label>
            <select
              id="sp-hours"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="mt-1.5 h-9 rounded-md border border-input bg-background px-2 text-[12.5px]"
            >
              {AVAILABILITY_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => goLiveMutation.mutate()}
            disabled={goLiveMutation.isPending}
            className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[12.5px] font-medium hover:bg-secondary disabled:opacity-50"
          >
            {goLiveMutation.isPending
              ? "Updating…"
              : current?.available
                ? "Extend live badge"
                : "Mark myself live now"}
          </button>
          {current?.available && (
            <button
              type="button"
              onClick={() => availabilityMutation.mutate(false)}
              disabled={availabilityMutation.isPending}
              className="inline-flex h-9 items-center text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Remove live badge
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
