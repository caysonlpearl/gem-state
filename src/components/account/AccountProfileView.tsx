import type { ComponentType, ReactNode } from "react";
import { ArrowRight, Camera, CheckCircle, ShieldCheck, Star } from "@phosphor-icons/react";
import { brand } from "@/config/brand";
import { MEMBER_INTENTS, intentLabels, type MemberIntent } from "@/config/account";
import type { MyAccount } from "@/lib/account.functions";
import type { SellerSetup, getSellerDashboardSummary } from "@/lib/seller.functions";
import { AccountSectionHeader as SectionHeader } from "./AccountSectionView";
import { SectionTitle, TrustBadge, SettingLine, Field, ToggleRow } from "./AccountViewParts";
import type { useAccountProfileDraft } from "./useAccountProfileDraft";
export type AccountLinkProps = { href: string; className?: string; children: ReactNode };

export function AccountProfileView({
  account,
  sellerSetup,
  sellerSummary,
  draft,
  profileMutation,
  contactMutation,
  removeAvatar,
  avatarBusy,
  uploadAvatar,
  link: AccountLink,
  publicProfileLink = true,
}: {
  account: MyAccount;
  sellerSetup?: SellerSetup;
  sellerSummary?: Awaited<ReturnType<typeof getSellerDashboardSummary>>;
  draft: ReturnType<typeof useAccountProfileDraft>;
  profileMutation: { isPending: boolean; mutate: () => void };
  contactMutation: { isPending: boolean; mutate: () => void };
  removeAvatar: { isPending: boolean; mutate: () => void };
  avatarBusy: boolean;
  uploadAvatar: (file: File) => void | Promise<void>;
  link: ComponentType<AccountLinkProps>;
  publicProfileLink?: boolean;
}) {
  const {
    displayName,
    setDisplayName,
    market,
    setMarket,
    intent,
    setIntent,
    allowPhone,
    setAllowPhone,
    allowText,
    setAllowText,
    allowEmail,
    setAllowEmail,
    showButtons,
    setShowButtons,
    allowInternalMessages,
    setAllowInternalMessages,
  } = draft;
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Public profile"
        title="Build trust before the first message"
        body="Show members enough context to feel comfortable while keeping your email, phone, and street address private by default."
      />
      <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="grid size-20 place-items-center overflow-hidden rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            (displayName || "GS").slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold">{displayName || "Your public profile"}</h3>
            {sellerSetup?.exists && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Seller profile
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Your public name appears next to listings and reviews. Your email is never public.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <TrustBadge
              label={account.emailVerified ? "Email verified" : "Email not verified"}
              icon={account.emailVerified ? CheckCircle : ShieldCheck}
            />
            <TrustBadge
              label={account.phoneVerified ? "Phone verified" : "Bluebird member"}
              icon={account.phoneVerified ? CheckCircle : ShieldCheck}
            />
            {sellerSummary?.ratingAverage != null && (
              <TrustBadge
                label={`${sellerSummary.ratingAverage.toFixed(1)} rating · ${sellerSummary.reviews.length} reviews`}
                icon={Star}
              />
            )}
          </div>
        </div>
        {publicProfileLink || !sellerSetup?.exists ? (
          sellerSetup?.slug ? (
            <AccountLink
              href={`/sellers/${encodeURIComponent(sellerSetup.slug)}`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              View public profile
              <ArrowRight size={14} />
            </AccountLink>
          ) : (
            <AccountLink
              href="/seller-setup"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              Become a seller
              <ArrowRight size={14} />
            </AccountLink>
          )
        ) : null}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Profile picture" />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {account.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt={`${displayName || "Your"} profile`}
                className="size-full object-cover"
              />
            ) : (
              (displayName || "GS").slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="text-[13px] font-semibold">Add a photo people recognize</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              This appears on your public seller profile, listings, reviews, and messages. Use a
              JPG, PNG, or WebP up to 5 MB.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label
                htmlFor="profile-photo-upload"
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <Camera size={15} />
                {avatarBusy ? "Uploading…" : account.avatarUrl ? "Change photo" : "Add photo"}
              </label>
              <input
                id="profile-photo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadAvatar(file);
                }}
              />
              {account.avatarUrl && (
                <button
                  type="button"
                  onClick={() => removeAvatar.mutate()}
                  disabled={removeAvatar.isPending || avatarBusy}
                  className="h-9 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary disabled:opacity-60"
                >
                  {removeAvatar.isPending ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {sellerSetup?.exists ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            title="Seller profile"
            action={
              <AccountLink
                href="/seller-setup"
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                Edit seller profile
              </AccountLink>
            }
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SettingLine label="Public handle" value={`@${sellerSetup.slug || "not set"}`} />
            <SettingLine
              label="Seller type"
              value={
                account.primaryIntent === "selling"
                  ? "Individual seller"
                  : "Local marketplace member"
              }
            />
            <SettingLine
              label="Public location"
              value={account.homeResortCode === "ID" ? "Idaho" : "Not set"}
            />
            <SettingLine
              label="About"
              value={sellerSetup.bio || "Add a short seller description."}
            />
          </div>
        </section>
      ) : null}
      <form
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          profileMutation.mutate();
        }}
      >
        <SectionTitle
          title="Public details"
          action={<span className="text-[11px] text-muted-foreground">Edit the fields below</span>}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-2 block h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
              maxLength={40}
            />
          </Field>
          <Field label="Primary market">
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              className="mt-2 block h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Select a market</option>
              {brand.markets.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="What you mainly do" className="mt-4">
          <select
            value={intent}
            onChange={(event) => setIntent(event.target.value as MemberIntent)}
            className="mt-2 block h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
          >
            <option value="">Select an option</option>
            {MEMBER_INTENTS.map((value) => (
              <option key={value} value={value}>
                {intentLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={profileMutation.isPending}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {profileMutation.isPending ? "Saving…" : "Save profile"}
          <ArrowRight size={14} />
        </button>
      </form>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Contact preferences" />
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          These settings control which contact buttons appear on your listings and whether members
          can start Bluebird conversations with you.
        </p>
        <div className="mt-4 divide-y divide-border">
          <ToggleRow
            label="Allow email contact"
            body="Let interested members email you about a listing."
            checked={allowEmail}
            onChange={setAllowEmail}
          />
          <ToggleRow
            label="Allow phone calls"
            body="Show a call option when you provide a phone number."
            checked={allowPhone}
            onChange={setAllowPhone}
          />
          <ToggleRow
            label="Allow text messages"
            body="Show a text option when your phone is enabled."
            checked={allowText}
            onChange={setAllowText}
          />
          <ToggleRow
            label="Show contact buttons"
            body="Display your enabled contact methods on public listings."
            checked={showButtons}
            onChange={setShowButtons}
          />
          <ToggleRow
            label="Allow Bluebird messages"
            body="Let members contact you through the marketplace inbox."
            checked={allowInternalMessages}
            onChange={setAllowInternalMessages}
          />
        </div>
        <button
          type="button"
          onClick={() => contactMutation.mutate()}
          disabled={contactMutation.isPending}
          className="mt-5 h-10 rounded-xl border border-input px-4 text-[12.5px] font-semibold hover:bg-secondary disabled:opacity-60"
        >
          {contactMutation.isPending ? "Saving…" : "Save contact settings"}
        </button>
      </section>
    </div>
  );
}
