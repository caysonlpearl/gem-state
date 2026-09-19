import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  IdentificationCard,
  LockKey,
  Storefront,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { brand } from "@/config/brand";
import { sellerShippingMethods } from "@/config/shipping";
import { supabase } from "@/integrations/supabase/client";
import {
  getSellerSetup,
  refreshStripeSellerStatus,
  saveSellerSetup,
  startStripeSellerOnboarding,
} from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller-setup")({
  validateSearch: (search: Record<string, unknown>): { stripe?: "return" | "refresh" } =>
    search["stripe"] === "return" || search["stripe"] === "refresh"
      ? { stripe: search["stripe"] }
      : {},
  component: SellerSetupPage,
});

function SellerSetupPage() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const fetchSetup = useServerFn(getSellerSetup);
  const save = useServerFn(saveSellerSetup);
  const startStripe = useServerFn(startStripeSellerOnboarding);
  const refreshStripe = useServerFn(refreshStripeSellerStatus);
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const refreshedStripe = useRef(false);

  useEffect(() => {
    if (!setup.data || draft) return;
    setDraft({
      displayName: setup.data.displayName,
      avatarUrl: setup.data.avatarUrl,
      slug: setup.data.slug,
      bio: setup.data.bio,
      shipFromName: setup.data.shipFromName,
      shipFromPhone: setup.data.shipFromPhone,
      shipFromLine1: setup.data.shipFromLine1,
      shipFromLine2: setup.data.shipFromLine2,
      shipFromCity: setup.data.shipFromCity,
      shipFromRegion: setup.data.shipFromRegion,
      shipFromPostalCode: setup.data.shipFromPostalCode,
      shipFromCountry: setup.data.shipFromCountry,
      defaultShippingMethod: setup.data.defaultShippingMethod,
      defaultHandlingDays: String(setup.data.defaultHandlingDays ?? ""),
      acceptTerms: setup.data.termsAccepted,
    });
  }, [setup.data, draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let avatarUrl = String(draft?.["avatarUrl"] ?? "");
      if (avatarFile) {
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user.id;
        if (!uid) throw new Error("Sign in required.");
        const ext =
          avatarFile.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${uid}/profile.${ext}`;
        const uploaded = await supabase.storage.from("seller-avatars").upload(path, avatarFile, {
          contentType: avatarFile.type || "image/jpeg",
          upsert: true,
        });
        if (uploaded.error)
          throw new Error(`Profile photo upload failed: ${uploaded.error.message}`);
        avatarUrl = supabase.storage.from("seller-avatars").getPublicUrl(path).data.publicUrl;
      }
      return save({
        data: {
          displayName: String(draft?.["displayName"] ?? ""),
          avatarUrl,
          slug: String(draft?.["slug"] ?? ""),
          bio: String(draft?.["bio"] ?? ""),
          shipFromName: String(draft?.["shipFromName"] ?? ""),
          shipFromPhone: String(draft?.["shipFromPhone"] ?? ""),
          shipFromLine1: String(draft?.["shipFromLine1"] ?? ""),
          shipFromLine2: String(draft?.["shipFromLine2"] ?? ""),
          shipFromCity: String(draft?.["shipFromCity"] ?? ""),
          shipFromRegion: String(draft?.["shipFromRegion"] ?? ""),
          shipFromPostalCode: String(draft?.["shipFromPostalCode"] ?? ""),
          shipFromCountry: String(draft?.["shipFromCountry"] ?? "US"),
          defaultShippingMethod: String(draft?.["defaultShippingMethod"] ?? ""),
          defaultHandlingDays: Number(draft?.["defaultHandlingDays"] ?? 0),
          acceptTerms: Boolean(draft?.["acceptTerms"]),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seller-setup"] });
      setAvatarFile(null);
      toast.success("Seller profile saved. You can now create listings.");
      document.getElementById("first-listing")?.scrollIntoView({ behavior: "smooth" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save seller setup."),
  });
  const stripeMutation = useMutation({
    mutationFn: () => startStripe(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start payout setup."),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshStripe(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["seller-setup"] });
      if ("reconnectRequired" in result && result.reconnectRequired) {
        toast.info("Your old test payout account was removed. Set up live payouts to continue.");
        return;
      }
      toast.success(
        result.configured && result.payoutsEnabled
          ? "Payout account is ready."
          : "Payout status refreshed.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not refresh payout status."),
  });

  useEffect(() => {
    if (search.stripe !== "return" || refreshedStripe.current) return;
    if (!setup.data?.payoutProviderConfigured) return;
    refreshedStripe.current = true;
    refreshMutation.mutate();
  }, [search.stripe, setup.data?.payoutProviderConfigured, refreshMutation]);

  const set = (key: string, value: string | boolean) =>
    setDraft((current) => ({ ...(current ?? {}), [key]: value }));
  const payoutReady =
    setup.data?.stripeAccountModeCurrent &&
    setup.data?.stripeDetailsSubmitted &&
    setup.data?.stripePayoutsEnabled;
  // Direct-contact classifieds do not require payment, payout, or shipping-method
  // onboarding -- buyer and seller arrange all of that themselves. Only the seller
  // agreement is required to start listing. Shipping defaults and Stripe remain
  // available below for a future checkout-marketplace phase, but must not block
  // classifieds sellers.
  const profileReady = Boolean(setup.data?.exists && setup.data?.termsAccepted);
  const sellerReady = profileReady;

  return (
    <main className="mx-auto max-w-[940px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Seller center
          </p>
          <h1 className="mt-1 font-editorial text-[38px] font-normal tracking-[-0.035em]">
            Set up your shop
          </h1>
          <p className="mt-1 max-w-[620px] text-[12.5px] leading-relaxed text-muted-foreground">
            Your public storefront and private shipping information live here. Payment and payout
            onboarding are optional while Gem State uses direct seller contact.
          </p>
        </div>
      </div>

      <SellerCenterNav storefrontSlug={setup.data?.slug} />

      <ol className="mt-7 grid gap-px border border-border bg-border sm:grid-cols-3">
        <SetupStep number="1" label="Seller information" complete={profileReady} />
        <SetupStep number="2" label="Listing details" complete={profileReady} />
        <SetupStep number="3" label="First listing" complete={false} />
      </ol>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {[
          [Storefront, "Storefront", setup.data?.exists ? "Complete" : "Required"],
          [IdentificationCard, "Future payouts", payoutReady ? "Verified" : "Optional"],
          [LockKey, "Private address", setup.data?.shipFromLine1 ? "Saved" : "Required"],
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

      {draft ? (
        <form
          className="mt-6 space-y-6 border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
              Step 1
            </p>
            <h2 className="mt-1 text-[15px] font-semibold">Public seller profile</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-center gap-4 border border-border bg-background p-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[20px] font-semibold">
                  {avatarFile || draft["avatarUrl"] ? (
                    <img
                      src={
                        avatarFile ? URL.createObjectURL(avatarFile) : String(draft["avatarUrl"])
                      }
                      alt="Seller profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    String(draft["displayName"] ?? "S")
                      .slice(0, 1)
                      .toUpperCase()
                  )}
                </div>
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-foreground px-3 text-[12px] font-medium">
                  <Camera size={15} />
                  Add profile picture
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · 5 MB maximum</p>
              </div>
              <Field
                label="Seller display name"
                value={String(draft["displayName"] ?? "")}
                onChange={(v) => set("displayName", v)}
                placeholder="Cayson's Park Finds"
              />
              <Field
                label="Seller handle"
                value={String(draft["slug"] ?? "")}
                onChange={(v) => set("slug", v)}
                placeholder="park-finds-by-cayson"
              />
              <label className="sm:col-span-2 text-[12px] font-medium">
                Short bio
                <textarea
                  value={String(draft["bio"] ?? "")}
                  maxLength={280}
                  rows={3}
                  onChange={(e) => set("bio", e.target.value)}
                  className="mt-1.5 w-full border border-input bg-background px-3 py-2 text-sm"
                  placeholder="What you collect, where you source, and what buyers can expect."
                />
              </label>
            </div>
          </section>
          <section className="border-t border-border pt-5">
            <h2 className="text-[14px] font-semibold">
              Private ship-from and return address <span className="font-normal text-muted-foreground">(optional)</span>
            </h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Not needed for direct-contact classifieds -- buyer and seller arrange pickup or
              shipping themselves. Only fill this in if you plan to ship prepaid labels through Gem
              State's own marketplace checkout. Listings show only your city, state and country;
              your street address and phone remain private.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                value={String(draft["shipFromName"] ?? "")}
                onChange={(v) => set("shipFromName", v)}
              />
              <Field
                label="Phone"
                value={String(draft["shipFromPhone"] ?? "")}
                onChange={(v) => set("shipFromPhone", v)}
              />
              <Field
                label="Street address"
                value={String(draft["shipFromLine1"] ?? "")}
                onChange={(v) => set("shipFromLine1", v)}
                className="sm:col-span-2"
              />
              <Field
                label="Apt / suite (optional)"
                value={String(draft["shipFromLine2"] ?? "")}
                onChange={(v) => set("shipFromLine2", v)}
                className="sm:col-span-2"
              />
              <Field
                label="City"
                value={String(draft["shipFromCity"] ?? "")}
                onChange={(v) => set("shipFromCity", v)}
              />
              <Field
                label="State"
                value={String(draft["shipFromRegion"] ?? "")}
                onChange={(v) => set("shipFromRegion", v)}
              />
              <Field
                label="ZIP code"
                value={String(draft["shipFromPostalCode"] ?? "")}
                onChange={(v) => set("shipFromPostalCode", v)}
              />
              <Field
                label="Country"
                value={String(draft["shipFromCountry"] ?? "US")}
                onChange={(v) => set("shipFromCountry", v)}
              />
            </div>
          </section>
          <section className="border-t border-border pt-5">
            <h2 className="text-[14px] font-semibold">
              Default listing shipping <span className="font-normal text-muted-foreground">(optional)</span>
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Not needed for direct-contact classifieds. Only set this if you plan to ship items
              through Gem State's own marketplace checkout -- carrier transit times are estimates;
              your handling time is shown separately.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-[12px] font-medium">
                Shipping method
                <select
                  value={String(draft["defaultShippingMethod"] ?? "")}
                  onChange={(event) => set("defaultShippingMethod", event.target.value)}
                  className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a shipping method</option>
                  {sellerShippingMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label} · {method.transitLabel.replace("Typically ", "")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium">
                Handling time
                <select
                  value={String(draft["defaultHandlingDays"] ?? "")}
                  onChange={(event) => set("defaultHandlingDays", event.target.value)}
                  className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose handling time</option>
                  {[1, 2, 3, 4, 5].map((days) => (
                    <option key={days} value={days}>
                      Ship within {days} business day{days === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <label className="flex items-start gap-2 border-t border-border pt-5 text-[11.5px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(draft["acceptTerms"])}
              onChange={(e) => set("acceptTerms", e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to list only items I possess, describe condition accurately, ship on time, and
              grant Gem State Classifieds permission to display the listing photos I submit.
            </span>
          </label>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="h-10 bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save seller profile"}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-[12.5px] text-muted-foreground">Loading seller setup…</p>
      )}

      <section id="payout-setup" className="mt-6 scroll-mt-28 border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
              Step 2
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-[15px] font-semibold">
              Payment and payout setup{" "}
              {payoutReady ? (
                <CheckCircle size={17} weight="fill" className="text-primary" />
              ) : null}
            </h2>
            <p className="mt-1 max-w-[610px] text-[11.5px] leading-relaxed text-muted-foreground">
              Payment and payout onboarding is reserved for a future transaction phase. If enabled,
              Stripe's hosted form would collect the identity, tax and bank details it requires;
              Gem State Classifieds would receive only account readiness flags.
            </p>
          </div>
          <div className="flex gap-2">
            {setup.data?.payoutProviderConfigured ? (
              <>
                <button
                  type="button"
                  onClick={() => stripeMutation.mutate()}
                  disabled={!profileReady || stripeMutation.isPending}
                  className="h-10 bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
                >
                  {payoutReady ? "Update payout details" : "Set up payouts"}
                </button>
                {setup.data?.stripeDetailsSubmitted ? (
                  <button
                    type="button"
                    onClick={() => refreshMutation.mutate()}
                    className="h-10 border border-input px-3 text-[12.5px] font-medium"
                  >
                    Refresh status
                  </button>
                ) : null}
              </>
            ) : (
              <span className="border border-brand-warm/40 bg-brand-warm/10 px-3 py-2 text-[11.5px] text-brand-warm">
                Not needed for direct-contact listings
              </span>
            )}
          </div>
        </div>
        {!setup.data?.payoutProviderConfigured ? (
          <div className="mt-4 border border-brand-warm/40 bg-brand-warm/10 p-4">
            <p className="text-[12.5px] font-semibold">
              Marketplace payouts are not part of the current MVP
            </p>
            <p className="mt-1 max-w-[680px] text-[11.5px] leading-relaxed text-muted-foreground">
              Buyers contact sellers directly in this MVP, so you can publish listings without
              connecting a bank account or providing payout information. The future Stripe Connect
              setup remains available for when platform checkout is enabled.
            </p>
            {setup.data?.isAdmin ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={brand.urls.stripePlatformSetup}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center bg-primary px-4 text-[12px] font-semibold text-primary-foreground"
                >
                  Open Stripe for Gem State
                </a>
                <p className="max-w-[520px] text-[10.5px] leading-relaxed text-muted-foreground">
                  Create or open the Stripe account Gem State Classifieds will use. Its Connect
                  credential must then be installed in a secure backend. Never place the key in
                  source code, chat or a public form.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                You can continue to create listings and receive buyer inquiries without payout setup.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section id="first-listing" className="mt-6 border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Step 3</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold">Create your first listing</h2>
            <p className="mt-1 max-w-[620px] text-[11.5px] leading-relaxed text-muted-foreground">
              Choose a category, add the exact item you own, and provide your photos, condition,
              location, price and package details.
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Buyers will contact you directly about the listing.
            </p>
          </div>
          <Link
            to="/create-listing"
            className={`inline-flex h-11 items-center gap-2 px-4 text-[12.5px] font-semibold ${
              sellerReady
                ? "bg-primary text-primary-foreground"
                : "pointer-events-none bg-secondary text-muted-foreground"
            }`}
          >
            Create your first listing
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
        className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ${complete ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
      >
        {complete ? <CheckCircle size={16} weight="fill" /> : number}
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`text-[12px] font-medium ${className}`}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}
