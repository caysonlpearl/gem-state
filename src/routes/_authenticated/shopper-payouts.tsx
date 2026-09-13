import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  IdentificationCard,
  LockKey,
  Storefront,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  getMyServiceProfile,
  refreshStripeShopperStatus,
  startStripeShopperOnboarding,
} from "@/lib/shopper.functions";

export const Route = createFileRoute("/_authenticated/shopper-payouts")({
  validateSearch: (search: Record<string, unknown>): { stripe?: "return" | "refresh" } =>
    search["stripe"] === "return" || search["stripe"] === "refresh"
      ? { stripe: search["stripe"] }
      : {},
  head: () => ({
    meta: [
      { title: "Park shopper payouts · ParkVault" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ShopperPayoutsPage,
});

function ShopperPayoutsPage() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyServiceProfile);
  const startStripe = useServerFn(startStripeShopperOnboarding);
  const refreshStripe = useServerFn(refreshStripeShopperStatus);
  const refreshedStripe = useRef(false);
  const profile = useQuery({
    queryKey: ["shopper-service-profile"],
    queryFn: () => fetchProfile(),
  });

  const stripeMutation = useMutation({
    mutationFn: () => startStripe(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start payout setup."),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshStripe(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["shopper-service-profile"] });
      if ("reconnectRequired" in result && result.reconnectRequired) {
        toast.info("Your old test payout account was removed. Set up live payouts to continue.");
        return;
      }
      toast.success(
        result.configured && result.payoutsEnabled
          ? "Your ParkVault payout account is ready."
          : "Payout status refreshed.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not refresh payout status."),
  });

  useEffect(() => {
    if (search.stripe !== "return" || refreshedStripe.current) return;
    if (!profile.data?.payoutProviderConfigured) return;
    refreshedStripe.current = true;
    refreshMutation.mutate();
  }, [search.stripe, profile.data?.payoutProviderConfigured, refreshMutation]);

  const payoutReady = Boolean(
    profile.data?.stripeAccountModeCurrent &&
    profile.data?.stripeDetailsSubmitted &&
    profile.data?.stripePayoutsEnabled,
  );

  return (
    <main className="mx-auto max-w-[940px] px-4 py-10 sm:px-6">
      <Link
        to="/shopper"
        className="inline-flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to Park shopper center
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            ParkVault Park shopper
          </p>
          <h1 className="mt-1 font-editorial text-[38px] font-normal tracking-[-0.035em]">
            Set up your payouts
          </h1>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-muted-foreground">
            This is the ParkVault payout setup for approved Park shoppers. Identity, tax and bank
            details go directly to Stripe, not ParkVault.
          </p>
        </div>
      </div>

      <ol className="mt-7 grid gap-px border border-border bg-border sm:grid-cols-3">
        <SetupStep number="1" label="Shopper approved" complete={Boolean(profile.data)} />
        <SetupStep number="2" label="Identity & payouts" complete={payoutReady} />
        <SetupStep number="3" label="Ready for jobs" complete={payoutReady} />
      </ol>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {[
          [Storefront, "ParkVault role", profile.data ? "Approved shopper" : "Not ready"],
          [IdentificationCard, "Payout identity", payoutReady ? "Verified" : "Not ready"],
          [LockKey, "Bank details", "Stored by Stripe"],
        ].map(([Icon, label, value]) => {
          const Glyph = Icon as typeof Storefront;
          return (
            <div key={String(label)} className="border border-border bg-card p-4">
              <Glyph size={20} className="text-primary" />
              <p className="mt-3 text-[11px] text-muted-foreground">{String(label)}</p>
              <p className="mt-0.5 text-[13px] font-semibold">{String(value)}</p>
            </div>
          );
        })}
      </div>

      <section className="mt-6 border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Step 2</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              Verify identity and connect payouts
              {payoutReady ? (
                <CheckCircle size={17} weight="fill" className="text-primary" />
              ) : null}
            </h2>
            <p className="mt-1 max-w-[610px] text-[11.5px] leading-relaxed text-muted-foreground">
              Stripe&apos;s secure form collects the identity, tax and bank details required for
              your ParkVault shopper payouts, including a government ID when Stripe requests one.
              ParkVault receives only account-readiness flags, never the ID image or bank details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.data?.payoutProviderConfigured ? (
              <>
                <button
                  type="button"
                  onClick={() => stripeMutation.mutate()}
                  disabled={!profile.data || stripeMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {payoutReady ? "Update payout details" : "Set up payouts"}
                  <ArrowRight size={15} />
                </button>
                {profile.data?.stripeDetailsSubmitted ? (
                  <button
                    type="button"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    className="h-10 border border-input px-3 text-[12.5px] font-medium disabled:opacity-50"
                  >
                    Refresh status
                  </button>
                ) : null}
              </>
            ) : (
              <span className="border border-brand-warm/40 bg-brand-warm/10 px-3 py-2 text-[11.5px] text-brand-warm">
                Payout setup temporarily unavailable
              </span>
            )}
          </div>
        </div>

        {!profile.isLoading && !profile.data ? (
          <div className="mt-4 border border-brand-warm/40 bg-brand-warm/10 p-4 text-[11.5px] leading-relaxed">
            Finish your Park shopper service profile before connecting payouts.
          </div>
        ) : null}
      </section>

      <section className="mt-6 border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Step 3</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold">Start accepting Park shopper jobs</h2>
            <p className="mt-1 max-w-[620px] text-[11.5px] leading-relaxed text-muted-foreground">
              Once Stripe marks payouts ready, completed-job earnings can be sent to this connected
              payout account under the same ParkVault marketplace used for seller payouts.
            </p>
          </div>
          <Link
            to="/shopper"
            className={`inline-flex h-11 items-center gap-2 px-4 text-[12.5px] font-semibold ${
              payoutReady
                ? "bg-primary text-primary-foreground"
                : "pointer-events-none bg-secondary text-muted-foreground"
            }`}
          >
            Return to shopper center
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </main>
  );
}

function SetupStep({
  number,
  label,
  complete,
}: {
  number: string;
  label: string;
  complete: boolean;
}) {
  return (
    <li className="flex items-center gap-3 bg-card px-4 py-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          complete ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
        }`}
      >
        {complete ? <CheckCircle size={16} weight="fill" /> : number}
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </li>
  );
}
