import type { ComponentType } from "react";
import {
  ArrowRight,
  Bell,
  BookmarkSimple,
  ChatCircle,
  CreditCard,
  MagnifyingGlass,
  MapPin,
  Plus,
  Storefront,
} from "@phosphor-icons/react";
import { intentLabels } from "../../config/account";
import type { MyAccount } from "../../lib/account.functions";
import type { AccountLinkProps } from "./AccountProfileView";
import type { AccountSection } from "./account-sections";
import {
  AccountEmptyState as EmptyState,
  AccountSectionHeader as SectionHeader,
} from "./AccountSectionView";
import { MiniMetric, SectionTitle } from "./AccountViewParts";

/** The website's account overview, with platform navigation supplied by its caller. */
export function AccountOverviewView({
  account,
  watchlistCount,
  savedSearchCount,
  unreadMessages,
  unreadNotifications,
  activeListings,
  pendingListings,
  completedSalesCount,
  sellerExists,
  notifications,
  onSelect,
  link: AccountLink,
  billingAvailable = true,
  activityStatus = "ready",
  onRetryActivity,
}: {
  account: MyAccount;
  watchlistCount: number;
  savedSearchCount: number;
  unreadMessages: number | null;
  unreadNotifications: number | null;
  activeListings: number;
  pendingListings: number;
  completedSalesCount: number;
  sellerExists: boolean;
  notifications: { id: string; title: string; body: string }[];
  onSelect: (section: AccountSection) => void;
  link: ComponentType<AccountLinkProps>;
  billingAvailable?: boolean;
  activityStatus?: "ready" | "loading" | "error";
  onRetryActivity?: () => void;
}) {
  const completion = Math.round(account.completion * 100);
  const displayName = account.displayName || account.email?.split("@")[0] || "Bluebird member";
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Member center"
        title={`Welcome back, ${displayName}`}
        body="Keep your saved finds, conversations, listings, and marketplace preferences in one place."
        action={
          <AccountLink
            href="/create-listing"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90"
          >
            <Plus size={16} weight="bold" /> Post a listing
          </AccountLink>
        }
      />

      <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-primary text-[20px] font-bold text-primary-foreground">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            displayName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[18px] font-bold">{displayName}</h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {account.primaryIntent ? intentLabels[account.primaryIntent] : "Member"}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {account.homeResortCode === "ID" ? "Idaho" : "Add your location"}
            </span>
            <span>
              Member since {account.createdAt ? new Date(account.createdAt).getFullYear() : "today"}
            </span>
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 flex-1 rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${completion}%` }}
              />
            </span>
            <span>{completion}% complete</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect("profile")}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
        >
          {completion < 100 ? "Complete profile" : "Edit profile"}
          <ArrowRight size={14} />
        </button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewStat
          icon={BookmarkSimple}
          label="Saved listings"
          value={watchlistCount}
          onClick={() => onSelect("saved")}
        />
        <OverviewStat
          icon={MagnifyingGlass}
          label="Saved searches"
          value={savedSearchCount}
          onClick={() => onSelect("searches")}
        />
        <OverviewStat
          icon={ChatCircle}
          label="Unread messages"
          value={unreadMessages}
          onClick={() => onSelect("messages")}
        />
        <OverviewStat
          icon={Bell}
          label="New notifications"
          value={unreadNotifications}
          onClick={() => onSelect("notifications")}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            title={sellerExists ? "Seller snapshot" : "Your next best steps"}
            action={
              sellerExists && billingAvailable ? (
                <button
                  type="button"
                  onClick={() => onSelect("billing")}
                  className="text-[11.5px] font-semibold text-primary hover:underline"
                >
                  Billing
                  <ArrowRight size={13} className="ml-1 inline" />
                </button>
              ) : undefined
            }
          />
          {sellerExists ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Active listings" value={activeListings} />
              <MiniMetric label="Awaiting approval" value={pendingListings} />
              <MiniMetric label="Completed sales" value={completedSalesCount} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <NextStep
                link={AccountLink}
                icon={Storefront}
                title="Become a seller"
                body="Create a public seller profile and publish your first listing."
                href="/seller-setup"
              />
              <NextStep
                link={AccountLink}
                icon={BookmarkSimple}
                title="Save something useful"
                body="Keep an exact listing handy while you compare local options."
                onClick={() => onSelect("saved")}
              />
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            title="Recent activity"
            action={
              <button
                type="button"
                onClick={() => onSelect("notifications")}
                className="text-[11.5px] font-semibold text-primary hover:underline"
              >
                See all
              </button>
            }
          />
          {activityStatus !== "ready" ? (
            <EmptyState
              title={activityStatus === "loading" ? "Loading activity…" : "Activity unavailable"}
              body={
                activityStatus === "loading"
                  ? "Your latest updates will appear here."
                  : "Your activity could not be loaded. Please retry."
              }
              action={
                activityStatus === "error" && onRetryActivity ? (
                  <button
                    type="button"
                    onClick={onRetryActivity}
                    className="min-h-11 font-semibold text-primary underline"
                  >
                    Retry activity
                  </button>
                ) : undefined
              }
            />
          ) : notifications.length === 0 ? (
            <EmptyState
              title="No new activity"
              body="Messages, listing updates, saved-search matches, and reviews will appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.slice(0, 4).map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-[12.5px] font-semibold">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Quick actions" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            link={AccountLink}
            icon={Storefront}
            label="Browse classifieds"
            href="/browse"
          />
          <QuickAction
            link={AccountLink}
            icon={BookmarkSimple}
            label="View saved listings"
            onClick={() => onSelect("saved")}
          />
          <QuickAction
            link={AccountLink}
            icon={MagnifyingGlass}
            label="Create saved search"
            onClick={() => onSelect("searches")}
          />
          <QuickAction
            link={AccountLink}
            icon={ChatCircle}
            label="Open messages"
            onClick={() => onSelect("messages")}
          />
          {sellerExists && billingAvailable && (
            <QuickAction
              link={AccountLink}
              icon={CreditCard}
              label="Manage billing"
              onClick={() => onSelect("billing")}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function OverviewStat({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Bell;
  label: string;
  value: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-secondary/35"
    >
      <Icon size={19} className="text-primary" />
      <p className="mt-3 text-[24px] font-bold tracking-tight">{value ?? "—"}</p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </button>
  );
}

function NextStep({
  icon: Icon,
  title,
  body,
  href,
  onClick,
  link: AccountLink,
}: {
  icon: typeof Storefront;
  title: string;
  body: string;
  href?: string;
  onClick?: () => void;
  link: ComponentType<AccountLinkProps>;
}) {
  const content = (
    <>
      <Icon size={18} className="text-primary" />
      <p className="mt-3 text-[13px] font-semibold">{title}</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      <ArrowRight size={14} className="mt-3 text-primary" />
    </>
  );
  return href ? (
    <AccountLink href={href} className="rounded-xl border border-border p-3 hover:bg-secondary/40">
      {content}
    </AccountLink>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border p-3 text-left hover:bg-secondary/40"
    >
      {content}
    </button>
  );
}
function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
  link: AccountLink,
}: {
  icon: typeof Storefront;
  label: string;
  href?: string;
  onClick?: () => void;
  link: ComponentType<AccountLinkProps>;
}) {
  const content = (
    <>
      <Icon size={18} className="text-primary" />
      <span className="flex-1 text-left text-[12px] font-semibold">{label}</span>
      <ArrowRight size={14} className="text-muted-foreground" />
    </>
  );
  return href ? (
    <AccountLink
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 hover:bg-secondary/40"
    >
      {content}
    </AccountLink>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 hover:bg-secondary/40"
    >
      {content}
    </button>
  );
}
