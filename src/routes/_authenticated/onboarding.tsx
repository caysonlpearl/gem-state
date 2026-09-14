import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";
import { getMyAccount, saveMyProfile, type MemberIntent } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const intents: { value: MemberIntent; label: string; body: string }[] = [
  {
    value: "buying",
    label: "Buying items",
    body: "Find an exact listing, compare details, and buy or place an offer.",
  },
  {
    value: "selling",
    label: "Selling items",
    body: "Post items you own and manage offers, orders and fulfillment.",
  },
  {
    value: "shopping_in_park",
    label: "Buying and selling locally",
    body: "Use Gem State Classifieds for local pickup, shipping and both.",
  },
  {
    value: "browsing",
    label: "Browsing classifieds",
    body: "Explore listings and save items without transacting yet.",
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const save = useServerFn(saveMyProfile);

  const { data, isLoading } = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });

  const [displayName, setDisplayName] = useState("");
  const [resort, setResort] = useState("");
  const [intent, setIntent] = useState<MemberIntent | "">("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void trackEvent("onboarding_started", { route: "/onboarding" });
  }, []);

  useEffect(() => {
    if (!data || hydrated) return;
    setDisplayName(data.displayName ?? "");
    setResort(data.homeResortCode ?? "");
    setIntent(data.primaryIntent ?? "");
    setHydrated(true);
  }, [data, hydrated]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          displayName,
          homeResortCode: resort,
          primaryIntent: intent,
          markOnboarded: true,
        },
      }),
    onSuccess: async () => {
      await trackEvent("onboarding_completed", { intent: intent || null, resort: resort || null });
      toast.success("You're set up.");
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      await navigate({ to: "/account" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile."),
  });

  return (
    <div className="mx-auto max-w-[680px] px-4 py-12 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
        Step 1 of 1
      </p>
      <h1 className="mt-3 text-[26px] font-semibold tracking-tight">Welcome to {brand.name}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        Three quick answers so your account, navigation and marketplace pages match what you actually
        want to do. You can change any of this later from your account.
      </p>

      {isLoading && !hydrated ? (
        <p className="mt-8 text-[13px] text-muted-foreground">Loading your profile…</p>
      ) : (
        <form
          className="mt-8 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="rounded-lg border border-border bg-card p-4">
            <label htmlFor="ob-name" className="text-[12px] font-medium">
              Display name
            </label>
            <input
              id="ob-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How other members see you"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <p className="mt-2 text-[12px] text-muted-foreground">
              Shown next to your listings and reviews. Your email is never public.
            </p>
          </div>

          <fieldset className="rounded-lg border border-border bg-card p-4">
            <legend className="px-1 text-[12px] font-medium">Primary market</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {brand.markets.map((market) => (
                <label
                  key={market.code}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] transition-colors ${
                    resort === market.code
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-input hover:bg-secondary"
                  }`}
                >
                  <input
                    type="radio"
                name="market"
                    value={market.code}
                    checked={resort === market.code}
                    onChange={() => setResort(market.code)}
                    className="sr-only"
                  />
                  {market.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Used to default your marketplace experience. Idaho listings remain browsable statewide.
            </p>
          </fieldset>

          <fieldset className="rounded-lg border border-border bg-card p-4">
            <legend className="px-1 text-[12px] font-medium">What brings you here?</legend>
            <div className="mt-1.5 space-y-2">
              {intents.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                    intent === option.value
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-input hover:bg-secondary"
                  }`}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={option.value}
                    checked={intent === option.value}
                    onChange={() => setIntent(option.value)}
                    className="sr-only"
                  />
                  <CheckCircle
                    size={16}
                    className={
                      intent === option.value ? "mt-0.5 text-primary" : "mt-0.5 opacity-25"
                    }
                  />
                  <span>
                    <span className="block text-[13px] font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                      {option.body}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Finish setup"}
            </button>
            <Link
              to="/glossary"
              className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              What do listing and offer mean?
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
