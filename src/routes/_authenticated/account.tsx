import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Storefront, Tag, MapPin, ShieldCheck } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import {
  getMyAccount,
  saveMyProfile,
  MEMBER_INTENTS,
  type MemberIntent,
} from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

const intentLabels: Record<MemberIntent, string> = {
  buying: "Buying items",
  selling: "Selling items",
  shopping_in_park: "Buying and selling locally",
  browsing: "Browsing classifieds",
};

const roleLabels: Record<string, string> = {
  user: "Member",
  shopper: "Member",
  moderator: "Moderator",
  admin: "Administrator",
};

function AccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const save = useServerFn(saveMyProfile);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-account"],
    queryFn: () => fetchAccount(),
  });

  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftResort, setDraftResort] = useState<string | null>(null);
  const [draftIntent, setDraftIntent] = useState<MemberIntent | null>(null);

  useEffect(() => {
    void trackEvent("page_view", { route: "/account" });
  }, []);

  const name = draftName ?? data?.displayName ?? "";
  const resort = draftResort ?? data?.homeResortCode ?? "";
  const intent = draftIntent ?? data?.primaryIntent ?? "";

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          displayName: name,
          homeResortCode: resort,
          primaryIntent: intent,
          markOnboarded: !data?.onboardedAt,
        },
      }),
    onSuccess: async () => {
      await trackEvent("profile_updated", { route: "/account" });
      toast.success("Profile saved.");
      setDraftName(null);
      setDraftResort(null);
      setDraftIntent(null);
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed."),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  const roles = data?.roles.length ? data.roles : ["user"];
  const isSeller = data?.primaryIntent === "selling";

  return (
    <div className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Your account</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Profile details for your {brand.name} account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.roles.includes("admin") && (
            <Link
              to="/admin"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ShieldCheck size={14} />
              Admin panel
            </Link>
          )}
          <Link
            to="/buying"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-[13px] font-medium transition-colors hover:bg-secondary"
          >
            <Tag size={14} />
            Purchases
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-9 items-center rounded-md border border-input px-3 text-[13px] font-medium transition-colors hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      </div>

      {isLoading && <p className="mt-8 text-[13px] text-muted-foreground">Loading your profile…</p>}
      {error && (
        <p className="mt-8 text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Could not load your profile."}
        </p>
      )}

      {data && (
        <div className="mt-8 space-y-6">
          {data.completion < 1 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold tracking-tight">
                    Your profile is {Math.round(data.completion * 100)}% complete
                  </p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Add a display name, primary market and what you plan to do so the marketplace
                    match your intent.
                  </p>
                </div>
                <Link
                  to="/onboarding"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Finish setup
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(data.completion * 100)}%` }}
                />
              </div>
            </div>
          )}

          <dl className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="hairline-b flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-muted-foreground">Email</dt>
              <dd className="text-[13px] font-medium">{data.email ?? "—"}</dd>
            </div>
            <div className="hairline-b flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-muted-foreground">Access</dt>
              <dd className="flex flex-wrap justify-end gap-1.5">
                {roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {roleLabels[role] ?? role}
                  </span>
                ))}
              </dd>
            </div>
            <div className="hairline-b flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-muted-foreground">Setup</dt>
              <dd className="text-[13px] font-medium">
                {data.onboardedAt ? "Complete" : "Not finished"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[13px] text-muted-foreground">Account id</dt>
              <dd className="numeric text-[12px] text-muted-foreground">{data.userId}</dd>
            </div>
          </dl>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
            className="space-y-4 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <label htmlFor="display-name" className="text-[12px] font-medium">
                Display name
              </label>
              <input
                id="display-name"
                value={name}
                onChange={(event) => setDraftName(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Shown next to your listings and reviews. Your email is never public.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="home-resort" className="text-[12px] font-medium">
                  Primary market
                </label>
                <select
                  id="home-resort"
                  value={resort}
                  onChange={(event) => setDraftResort(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a market</option>
                  {brand.markets.map((market) => (
                    <option key={market.code} value={market.code}>
                      {market.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="primary-intent" className="text-[12px] font-medium">
                  What you mainly do
                </label>
                <select
                  id="primary-intent"
                  value={intent}
                  onChange={(event) => setDraftIntent(event.target.value as MemberIntent)}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select an option</option>
                  {MEMBER_INTENTS.map((value) => (
                    <option key={value} value={value}>
                      {intentLabels[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Save profile"}
            </button>
          </form>

          <div className="rounded-lg border border-border bg-card">
            <div className="hairline-b px-4 py-3">
              <h2 className="text-[13px] font-semibold tracking-tight">
                {isSeller
                  ? "Seller next steps"
                  : "Buyer next steps"}
              </h2>
            </div>
            <ul>
              <li className="hairline-b flex items-start gap-3 px-4 py-3">
                <Storefront size={16} className="mt-0.5 text-primary" />
                <span className="text-[13px] text-muted-foreground">
                <Link to="/browse" className="font-medium text-foreground hover:underline">
                    Browse listings
                  </Link>{" "}
                  and open the exact item you care about.
                </span>
              </li>
              <li className="hairline-b flex items-start gap-3 px-4 py-3">
                <Tag size={16} className="mt-0.5 text-primary" />
                <span className="text-[13px] text-muted-foreground">
                  {isSeller
                    ? "Your seller dashboard supports public listings, editing, order fulfillment and payout setup."
                    : "Place an offer on a listing, and complete payment at checkout when a seller accepts."}
                </span>
              </li>
              <li className="flex items-start gap-3 px-4 py-3">
                <MapPin size={16} className="mt-0.5 text-primary" />
                <span className="text-[13px] text-muted-foreground">
                  Not sure what a listing or offer is?{" "}
                  <Link to="/glossary" className="font-medium text-foreground hover:underline">
                    Read the plain-language guide
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
