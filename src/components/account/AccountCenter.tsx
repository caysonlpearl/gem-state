import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  BookmarkSimple,
  CheckCircle,
  ChatCircle,
  Eye,
  ClipboardText,
  CreditCard,
  Gear,
  LockKey,
  MagnifyingGlass,
  MapPin,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  ShieldCheck,
  SignOut,
  Star,
  Storefront,
  Tag,
  UserCircle,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import {
  getMyAccount,
  saveMyProfile,
  MEMBER_INTENTS,
  type MemberIntent,
  type MyAccount,
} from "@/lib/account.functions";
import {
  createSavedSearch,
  deleteSavedSearch,
  getMyContactPreferences,
  getMyNotificationPreferences,
  getMySavedSearches,
  updateMyContactPreferences,
  updateMyNotificationPreferences,
  updateSavedSearch,
  type ContactPreferences,
  type NotificationPreferences,
  type SavedSearch,
} from "@/lib/account-center.functions";
import {
  getConversation,
  getMyConversations,
  blockConversation,
  markConversationRead,
  reportConversation,
  createConversationAttachmentUpload,
  sendConversationMessage,
  sendConversationMessageWithAttachment,
  type ConversationDetail,
  type ConversationSummary,
} from "@/lib/conversation.functions";
import { getMyWatchlist, setWatchState, type WatchedVariant } from "@/lib/community.functions";
import {
  getMyNotifications,
  markNotificationsRead,
  type MemberNotification,
} from "@/lib/notifications.functions";
import {
  cancelListing,
  getMyListings,
  getMyOrders,
  type MyListing,
  type MyOrder,
} from "@/lib/market.functions";
import { OrderReviewCard } from "@/components/orders/OrderReviewCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getSellerDashboardSummary,
  getSellerSetup,
  relistSellerListing,
} from "@/lib/seller.functions";
import {
  createListingUpgradeCheckout,
  getListingUpgradeOptions,
  getSellerBillingHistory,
  type ListingUpgradeOption,
  type ListingUpgradePurchase,
} from "@/lib/listing-upgrade.functions";

export const ACCOUNT_SECTIONS = [
  "overview",
  "profile",
  "settings",
  "listings",
  "saved",
  "searches",
  "messages",
  "notifications",
  "reviews",
  "billing",
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

type AccountCenterProps = {
  section: AccountSection;
  conversationId?: string | undefined;
};

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

const navItems: { section: AccountSection; label: string; icon: typeof UserCircle }[] = [
  { section: "overview", label: "Overview", icon: UserCircle },
  { section: "profile", label: "Profile", icon: UserCircle },
  { section: "settings", label: "Account & security", icon: Gear },
  { section: "listings", label: "Listings", icon: Tag },
  { section: "saved", label: "Saved listings", icon: BookmarkSimple },
  { section: "searches", label: "Saved searches", icon: MagnifyingGlass },
  { section: "messages", label: "Messages", icon: ChatCircle },
  { section: "notifications", label: "Notifications", icon: Bell },
  { section: "reviews", label: "Reviews & reputation", icon: Star },
];

export function AccountCenter({ section, conversationId }: AccountCenterProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const fetchWatchlist = useServerFn(getMyWatchlist);
  const fetchNotifications = useServerFn(getMyNotifications);
  const fetchConversations = useServerFn(getMyConversations);
  const fetchSavedSearches = useServerFn(getMySavedSearches);
  const fetchContactPreferences = useServerFn(getMyContactPreferences);
  const fetchNotificationPreferences = useServerFn(getMyNotificationPreferences);
  const fetchSellerSetup = useServerFn(getSellerSetup);
  const fetchListings = useServerFn(getMyListings);
  const fetchOrders = useServerFn(getMyOrders);
  const fetchSellerSummary = useServerFn(getSellerDashboardSummary);
  const fetchUpgradeOptions = useServerFn(getListingUpgradeOptions);
  const fetchBillingHistory = useServerFn(getSellerBillingHistory);

  useEffect(() => {
    void trackEvent("page_view", { route: `/account?section=${section}` });
  }, [section]);

  const account = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });
  const watchlist = useQuery({
    queryKey: ["my-watchlist"],
    queryFn: () => fetchWatchlist(),
    enabled: section === "overview" || section === "saved",
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    // Keep the header and account-sidebar unread badge accurate no matter
    // which section is open.
    enabled: true,
  });
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    // The sidebar exposes the unread message count on every account view.
    enabled: true,
  });
  const savedSearches = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => fetchSavedSearches(),
    enabled: section === "overview" || section === "searches",
  });
  const contactPreferences = useQuery({
    queryKey: ["contact-preferences"],
    queryFn: () => fetchContactPreferences(),
    enabled: section === "profile" || section === "settings",
  });
  const notificationPreferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => fetchNotificationPreferences(),
    enabled: section === "settings",
  });
  const sellerSetup = useQuery({
    queryKey: ["seller-setup"],
    queryFn: () => fetchSellerSetup(),
    // Seller billing is a persistent account destination, so determine its
    // visibility for every section rather than only after opening a seller
    // view.
    enabled: true,
  });
  const listings = useQuery({
    queryKey: ["my-listings"],
    queryFn: () => fetchListings(),
    enabled: section === "overview" || section === "listings",
  });
  const sellerSummary = useQuery({
    queryKey: ["seller-dashboard-summary"],
    queryFn: () => fetchSellerSummary(),
    enabled: section === "overview" || section === "profile" || section === "reviews",
  });
  const upgradeOptions = useQuery({
    queryKey: ["listing-upgrade-options"],
    queryFn: () => fetchUpgradeOptions(),
    enabled: section === "billing",
  });
  const billingHistory = useQuery({
    queryKey: ["seller-billing-history"],
    queryFn: () => fetchBillingHistory(),
    enabled: section === "billing",
  });
  const orders = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
    enabled: section === "reviews",
  });

  function go(next: AccountSection, extra: { conversation?: string } = {}) {
    void navigate({ to: "/account", search: { section: next, ...extra } });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  if (account.isLoading) return <AccountLoading />;
  if (account.isError || !account.data) {
    return (
      <AccountError message={account.error instanceof Error ? account.error.message : undefined} />
    );
  }

  const data = account.data;
  const unreadMessages = conversations.data?.filter((item) => item.unread).length ?? 0;
  const unreadNotifications = notifications.data?.unread ?? 0;
  const sellerVisible = Boolean(sellerSetup.data?.exists || data.primaryIntent === "selling");

  return (
    <main id="main-content" className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
            Member center
          </p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">Your account</h1>
        </div>
        <select
          aria-label="Account section"
          value={section}
          onChange={(event) => go(event.target.value as AccountSection)}
          className="h-10 max-w-[170px] rounded-xl border border-input bg-card px-3 text-[12px] font-medium"
        >
          {navItems.map((item) => (
            <option key={item.section} value={item.section}>
              {item.label}
            </option>
          ))}
          {sellerVisible && <option value="billing">Seller billing</option>}
        </select>
      </div>

      <div className="grid gap-8 lg:grid-cols-[236px_minmax(0,1fr)]">
        <AccountSidebar
          section={section}
          onSelect={go}
          onSignOut={signOut}
          unreadMessages={unreadMessages}
          unreadNotifications={unreadNotifications}
          sellerVisible={sellerVisible}
        />
        <div className="min-w-0">
          {section === "overview" && (
            <OverviewSection
              account={data}
              watchlistCount={watchlist.data?.length ?? 0}
              savedSearchCount={savedSearches.data?.length ?? 0}
              unreadMessages={unreadMessages}
              unreadNotifications={unreadNotifications}
              listings={listings.data?.asks ?? []}
              sellerSetup={sellerSetup.data}
              sellerSummary={sellerSummary.data}
              notifications={notifications.data?.items ?? []}
              onSelect={go}
            />
          )}
          {section === "profile" && (
            <ProfileSection
              account={data}
              contactPreferences={contactPreferences.data}
              sellerSetup={sellerSetup.data}
              sellerSummary={sellerSummary.data}
            />
          )}
          {section === "settings" && (
            <SettingsSection
              account={data}
              contactPreferences={contactPreferences.data}
              notificationPreferences={notificationPreferences.data}
            />
          )}
          {section === "saved" && <SavedListingsSection items={watchlist.data ?? []} />}
          {section === "searches" && <SavedSearchesSection searches={savedSearches.data ?? []} />}
          {section === "messages" && (
            <MessagesSection
              conversations={conversations.data ?? []}
              conversationId={conversationId}
              onOpen={(id) => go("messages", { conversation: id })}
            />
          )}
          {section === "notifications" && <NotificationsSection data={notifications.data} />}
          {section === "listings" && (
            <ListingsSection listings={listings.data?.asks ?? []} sellerSetup={sellerSetup.data} />
          )}
          {section === "reviews" && (
            <ReviewsSection
              summary={sellerSummary.data}
              sellerSetup={sellerSetup.data}
              orders={orders.data ?? []}
            />
          )}
          {section === "billing" && (
            <BillingSection
              sellerSetup={sellerSetup.data}
              listings={listings.data?.asks ?? []}
              options={upgradeOptions.data ?? []}
              history={billingHistory.data ?? []}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function AccountSidebar({
  section,
  onSelect,
  onSignOut,
  unreadMessages,
  unreadNotifications,
  sellerVisible,
}: {
  section: AccountSection;
  onSelect: (section: AccountSection) => void;
  onSignOut: () => void;
  unreadMessages: number;
  unreadNotifications: number;
  sellerVisible: boolean;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[108px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-secondary/45 px-5 py-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Gem State</p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">My account</h1>
        </div>
        <nav aria-label="Account sections" className="p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.section === section;
            const badge =
              item.section === "messages"
                ? unreadMessages
                : item.section === "notifications"
                  ? unreadNotifications
                  : 0;
            return (
              <button
                key={item.section}
                type="button"
                onClick={() => onSelect(item.section)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-secondary"}`}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] leading-5 ${active ? "bg-primary-foreground/15" : "bg-accent text-accent-foreground"}`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
          {sellerVisible && (
            <button
              type="button"
              onClick={() => onSelect("billing")}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium transition-colors ${section === "billing" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-secondary"}`}
            >
              <CreditCard size={18} aria-hidden="true" />
              <span className="flex-1">Seller billing</span>
            </button>
          )}
        </nav>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <SignOut size={18} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

function AccountLoading() {
  return (
    <main className="mx-auto max-w-[980px] px-4 py-16 text-[13px] text-muted-foreground">
      Loading your account center…
    </main>
  );
}

function AccountError({ message }: { message?: string | undefined }) {
  return (
    <main className="mx-auto max-w-[980px] px-4 py-16">
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-[13px] text-destructive">
        {message || "Could not load your account."}
      </div>
    </main>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-[28px] font-bold tracking-tight">{title}</h2>
        {body && (
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function OverviewSection({
  account,
  watchlistCount,
  savedSearchCount,
  unreadMessages,
  unreadNotifications,
  listings,
  sellerSetup,
  sellerSummary,
  notifications,
  onSelect,
}: {
  account: MyAccount;
  watchlistCount: number;
  savedSearchCount: number;
  unreadMessages: number;
  unreadNotifications: number;
  listings: MyListing[];
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
  sellerSummary?: Awaited<ReturnType<typeof getSellerDashboardSummary>> | undefined;
  notifications: MemberNotification[];
  onSelect: (section: AccountSection) => void;
}) {
  const completion = Math.round(account.completion * 100);
  const activeListings = listings.filter(
    (item) => item.status === "active" && item.approvedAt,
  ).length;
  const pendingListings = listings.filter(
    (item) => !item.approvedAt || item.status === "pending_review",
  ).length;
  const displayName = account.displayName || account.email?.split("@")[0] || "Gem State member";
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Member center"
        title={`Welcome back, ${displayName}`}
        body="Keep your saved finds, conversations, listings, and marketplace preferences in one place."
        action={
          <Link
            to="/create-listing"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90"
          >
            <Plus size={16} weight="bold" /> Post a listing
          </Link>
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
          <SectionTitle title={sellerSetup?.exists ? "Seller snapshot" : "Your next best steps"} />
          {sellerSetup?.exists ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Active listings" value={activeListings} />
              <MiniMetric label="Awaiting approval" value={pendingListings} />
              <MiniMetric label="Completed sales" value={sellerSummary?.completedSalesCount ?? 0} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <NextStep
                icon={Storefront}
                title="Become a seller"
                body="Create a public seller profile and publish your first listing."
                href="/seller-setup"
              />
              <NextStep
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
          {notifications.length === 0 ? (
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
          <QuickAction icon={Storefront} label="Browse classifieds" href="/browse" />
          <QuickAction
            icon={BookmarkSimple}
            label="View saved listings"
            onClick={() => onSelect("saved")}
          />
          <QuickAction
            icon={MagnifyingGlass}
            label="Create saved search"
            onClick={() => onSelect("searches")}
          />
          <QuickAction
            icon={ChatCircle}
            label="Open messages"
            onClick={() => onSelect("messages")}
          />
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
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-secondary/35"
    >
      <Icon size={19} className="text-primary" />
      <p className="mt-3 text-[24px] font-bold tracking-tight">{value}</p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </button>
  );
}

function ProfileSection({
  account,
  contactPreferences,
  sellerSetup,
  sellerSummary,
}: {
  account: MyAccount;
  contactPreferences?: ContactPreferences | undefined;
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
  sellerSummary?: Awaited<ReturnType<typeof getSellerDashboardSummary>> | undefined;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveMyProfile);
  const updatePreferences = useServerFn(updateMyContactPreferences);
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [market, setMarket] = useState(account.homeResortCode ?? "");
  const [intent, setIntent] = useState(account.primaryIntent ?? "");
  const [allowPhone, setAllowPhone] = useState(contactPreferences?.allowPhone ?? false);
  const [allowText, setAllowText] = useState(contactPreferences?.allowText ?? false);
  const [allowEmail, setAllowEmail] = useState(contactPreferences?.allowEmail ?? true);
  const [showButtons, setShowButtons] = useState(contactPreferences?.showContactButtons ?? true);
  const [allowInternalMessages, setAllowInternalMessages] = useState(
    contactPreferences?.allowInternalMessages ?? true,
  );
  useEffect(() => {
    if (!contactPreferences) return;
    setAllowPhone(contactPreferences.allowPhone);
    setAllowText(contactPreferences.allowText);
    setAllowEmail(contactPreferences.allowEmail);
    setShowButtons(contactPreferences.showContactButtons);
    setAllowInternalMessages(contactPreferences.allowInternalMessages);
  }, [contactPreferences]);
  const profileMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          displayName,
          homeResortCode: market,
          primaryIntent: intent,
          markOnboarded: !account.onboardedAt,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      toast.success("Profile saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile."),
  });
  const contactMutation = useMutation({
    mutationFn: () =>
      updatePreferences({
        data: {
          allowPhone,
          allowText,
          allowEmail,
          showContactButtons: showButtons,
          allowInternalMessages,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contact-preferences"] });
      toast.success("Contact preferences saved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save contact preferences."),
  });
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
              label={account.phoneVerified ? "Phone verified" : "Gem State member"}
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
        {sellerSetup?.slug ? (
          <Link
            to="/sellers/$slug"
            params={{ slug: sellerSetup.slug }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
          >
            View public profile
            <ArrowRight size={14} />
          </Link>
        ) : (
          <Link
            to="/seller-setup"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
          >
            Become a seller
            <ArrowRight size={14} />
          </Link>
        )}
      </section>
      {sellerSetup?.exists ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            title="Seller profile"
            action={
              <Link
                to="/seller-setup"
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                Edit seller profile
              </Link>
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
        <SectionTitle title="Public details" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="field"
              maxLength={40}
            />
          </Field>
          <Field label="Primary market">
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              className="field"
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
            className="field"
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
          can start Gem State conversations with you.
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
            label="Allow Gem State messages"
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

function SettingsSection({
  account,
  contactPreferences,
  notificationPreferences,
}: {
  account: MyAccount;
  contactPreferences?: ContactPreferences | undefined;
  notificationPreferences?: NotificationPreferences | undefined;
}) {
  const queryClient = useQueryClient();
  const updateContact = useServerFn(updateMyContactPreferences);
  const updateNotifications = useServerFn(updateMyNotificationPreferences);
  const [contact, setContact] = useState<ContactPreferences>(
    contactPreferences ?? {
      allowEmail: true,
      allowPhone: false,
      allowText: false,
      showContactButtons: true,
      allowInternalMessages: true,
    },
  );
  const [notifications, setNotifications] = useState<NotificationPreferences>(
    notificationPreferences ?? {
      messageAlerts: true,
      listingActivity: true,
      savedSearchMatches: true,
      reviewRequests: true,
      listingUpgradeReceipts: true,
      productUpdates: false,
      marketingEmail: false,
    },
  );
  useEffect(() => {
    if (contactPreferences) setContact(contactPreferences);
  }, [contactPreferences]);
  useEffect(() => {
    if (notificationPreferences) setNotifications(notificationPreferences);
  }, [notificationPreferences]);
  const saveContact = useMutation({
    mutationFn: () => updateContact({ data: contact }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contact-preferences"] });
      toast.success("Contact settings saved.");
    },
  });
  const saveNotifications = useMutation({
    mutationFn: () => updateNotifications({ data: notifications }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Email preferences saved.");
    },
  });
  async function requestPasswordReset() {
    if (!account.email) {
      toast.error("There is no email address on this account.");
      return;
    }
    const redirect = `${window.location.origin}/account?section=settings`;
    const { error } = await supabase.auth.resetPasswordForEmail(account.email, {
      redirectTo: `${window.location.origin}/auth?mode=reset&redirect=${encodeURIComponent(redirect)}`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset email sent.");
  }
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Account settings"
        title="Control your account"
        body="Manage your sign-in, contact visibility, and the updates Gem State sends you."
      />
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <SettingsBlock icon={UserCircle} title="Account details">
          <SettingLine label="Email address" value={account.email ?? "Not available"}>
            <span
              className={`text-[11px] font-semibold ${account.emailVerified ? "text-primary" : "text-muted-foreground"}`}
            >
              {account.emailVerified ? "Verified" : "Needs verification"}
            </span>
          </SettingLine>
          <SettingLine
            label="Member since"
            value={account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "Today"}
          />
          <SettingLine
            label="Last login"
            value={
              account.lastSignInAt
                ? new Date(account.lastSignInAt).toLocaleString()
                : "Not available"
            }
          />
          <SettingLine label="Account ID" value={account.userId.slice(0, 8) + "…"} />
        </SettingsBlock>
        <SettingsBlock icon={LockKey} title="Security">
          <SettingLine label="Password" value="Managed by Supabase Auth">
            <button
              type="button"
              onClick={() => void requestPasswordReset()}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Reset password
            </button>
          </SettingLine>
          <SettingLine
            label="Google sign-in"
            value={account.googleConnected ? "Connected" : "Not connected"}
          >
            <span className="text-[11px] text-muted-foreground">
              {account.googleConnected
                ? "Connected through Supabase"
                : "Use Google on the sign-in screen"}
            </span>
          </SettingLine>
          <SettingLine
            label="Phone verification"
            value={account.phoneVerified ? "Verified" : "Not verified"}
          >
            <span className="text-[11px] text-muted-foreground">
              {account.phoneVerified ? "Available for direct contact" : "Optional"}
            </span>
          </SettingLine>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut({ scope: "global" })}
            className="mt-3 text-[12px] font-semibold text-primary hover:underline"
          >
            Sign out of all devices
          </button>
        </SettingsBlock>
        <SettingsBlock icon={ShieldCheck} title="Account deletion">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            To protect active listings, messages, and transaction records, account deletion requests
            are reviewed by Gem State support.
          </p>
          <Link
            to="/contact"
            className="mt-3 inline-flex text-[12px] font-semibold text-primary hover:underline"
          >
            Request account deletion
            <ArrowRight size={13} className="ml-1" />
          </Link>
        </SettingsBlock>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <PreferenceCard
          title="Contact information"
          body="Your phone and email remain private unless you enable public contact options."
          rows={[
            { key: "allowEmail", label: "Allow email contact", value: contact.allowEmail },
            { key: "allowPhone", label: "Allow phone calls", value: contact.allowPhone },
            { key: "allowText", label: "Allow text messages", value: contact.allowText },
            {
              key: "showContactButtons",
              label: "Show contact buttons",
              value: contact.showContactButtons,
            },
            {
              key: "allowInternalMessages",
              label: "Allow Gem State messages",
              value: contact.allowInternalMessages,
            },
          ]}
          onChange={(key, value) => setContact((current) => ({ ...current, [key]: value }))}
          onSave={() => saveContact.mutate()}
          saving={saveContact.isPending}
        />
        <PreferenceCard
          title="Email notifications"
          body="Transactional emails stay on when needed. Marketing is always opt-in."
          rows={[
            {
              key: "messageAlerts",
              label: "New marketplace messages",
              value: notifications.messageAlerts,
            },
            {
              key: "listingActivity",
              label: "Listing approval and expiry",
              value: notifications.listingActivity,
            },
            {
              key: "savedSearchMatches",
              label: "Saved-search matches",
              value: notifications.savedSearchMatches,
            },
            {
              key: "reviewRequests",
              label: "Review requests",
              value: notifications.reviewRequests,
            },
            {
              key: "listingUpgradeReceipts",
              label: "Listing upgrade receipts",
              value: notifications.listingUpgradeReceipts,
            },
            {
              key: "productUpdates",
              label: "Gem State product updates",
              value: notifications.productUpdates,
            },
            {
              key: "marketingEmail",
              label: "Marketing email",
              value: notifications.marketingEmail,
            },
          ]}
          onChange={(key, value) => setNotifications((current) => ({ ...current, [key]: value }))}
          onSave={() => saveNotifications.mutate()}
          saving={saveNotifications.isPending}
        />
      </div>
    </div>
  );
}

function SavedListingsSection({ items }: { items: WatchedVariant[] }) {
  const queryClient = useQueryClient();
  const setWatch = useServerFn(setWatchState);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const categories = [
    ...new Set(items.map((item) => item.categoryName).filter(Boolean)),
  ] as string[];
  const itemStatus = (item: WatchedVariant) => (item.activeAskCount > 0 ? "active" : "unavailable");
  const filtered = items
    .filter(
      (item) =>
        `${item.productName} ${item.variantLabel}`.toLowerCase().includes(query.toLowerCase()) &&
        (category === "all" || item.categoryName === category) &&
        (status === "all" || itemStatus(item) === status),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? (a.lowestAskCents ?? Number.MAX_SAFE_INTEGER) -
          (b.lowestAskCents ?? Number.MAX_SAFE_INTEGER)
        : sort === "price-high"
          ? (b.lowestAskCents ?? 0) - (a.lowestAskCents ?? 0)
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const removeMutation = useMutation({
    mutationFn: (variantId: string) => setWatch({ data: { variantId, watching: false } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-watchlist"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove saved listing."),
  });
  const bulkRemove = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selectedIds.map((variantId) => setWatch({ data: { variantId, watching: false } })),
      );
    },
    onSuccess: async () => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["my-watchlist"] });
      toast.success("Saved listings removed.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove saved listings."),
  });
  const toggleSelected = (variantId: string) =>
    setSelectedIds((current) =>
      current.includes(variantId)
        ? current.filter((id) => id !== variantId)
        : [...current, variantId],
    );
  const selectAllVisible = () =>
    setSelectedIds((current) =>
      current.length === filtered.length ? [] : filtered.map((item) => item.variantId),
    );
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Saved listings"
        title={`${items.length} saved ${items.length === 1 ? "listing" : "listings"}`}
        body="Keep exact items handy while you compare local options. Saving does not reserve an item."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/browse"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              Browse listings
              <ArrowRight size={14} />
            </Link>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => bulkRemove.mutate()}
                disabled={bulkRemove.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-3 text-[12px] font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {bulkRemove.isPending ? "Removing…" : `Remove ${selectedIds.length} selected`}
              </button>
            )}
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px_170px_auto]">
        <label className="field flex items-center gap-2">
          <MagnifyingGlass size={16} className="text-muted-foreground" />
          <span className="sr-only">Search saved listings</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved listings"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="field"
        >
          <option value="all">All sections</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="field"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="unavailable">Sold or removed</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="field">
          <option value="newest">Newest saved</option>
          <option value="price-low">Price low to high</option>
          <option value="price-high">Price high to low</option>
        </select>
        <div className="flex rounded-xl border border-input p-1" aria-label="Saved listings view">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            List
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Nothing saved yet" : "No saved listings match"}
          body="Open a listing and select its save button to keep it here."
          action={
            <Link to="/browse" className="text-[12px] font-semibold text-primary hover:underline">
              Browse classifieds
            </Link>
          }
        />
      ) : (
        <>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onChange={selectAllVisible}
              className="size-4 accent-[var(--color-primary)]"
            />{" "}
            Select all visible
          </label>
          <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
            {filtered.map((item) => (
              <SavedListingCard
                key={item.variantId}
                item={item}
                onRemove={() => removeMutation.mutate(item.variantId)}
                removing={removeMutation.isPending && removeMutation.variables === item.variantId}
                listView={view === "list"}
                selected={selectedIds.includes(item.variantId)}
                onSelect={() => toggleSelected(item.variantId)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SavedListingCard({
  item,
  onRemove,
  removing,
  listView,
  selected,
  onSelect,
}: {
  item: WatchedVariant;
  onRemove: () => void;
  removing: boolean;
  listView?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${listView ? "sm:flex sm:items-center sm:justify-between sm:gap-5" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${item.productName}`}
            className="mt-1 size-4 accent-[var(--color-primary)]"
          />
          <div>
            <p className="text-[14px] font-semibold leading-snug">{item.productName}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {item.variantLabel} · {item.categoryName ?? "Classifieds"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${item.productName} from saved listings`}
          className="rounded-lg p-1 text-primary hover:bg-secondary disabled:opacity-50"
        >
          <BookmarkSimple size={18} weight="fill" />
        </button>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="numeric text-[18px] font-bold">
            {item.lowestAskCents == null ? "No active listing" : formatUsd(item.lowestAskCents)}
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {item.activeAskCount > 0
              ? `${item.activeAskCount} active listing${item.activeAskCount === 1 ? "" : "s"}`
              : "Sold or removed"}{" "}
            · {item.sightingCount} local sighting{item.sightingCount === 1 ? "" : "s"}
          </p>
        </div>
        {item.listingId ? (
          <Link
            to="/listings/$listingId"
            params={{ listingId: item.listingId }}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            View listing
          </Link>
        ) : (
          <Link
            to="/browse"
            search={{ q: item.productName }}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            Find listing
          </Link>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Saved {new Date(item.createdAt).toLocaleDateString()}
      </p>
    </article>
  );
}

function SavedSearchesSection({ searches }: { searches: SavedSearch[] }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createSavedSearch);
  const update = useServerFn(updateSavedSearch);
  const remove = useServerFn(deleteSavedSearch);
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const createMutation = useMutation({
    mutationFn: () => create({ data: { name, search: { q: searchQuery || undefined } } }),
    onSuccess: async () => {
      setName("");
      setSearchQuery("");
      await queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.success("Saved search created.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create saved search."),
  });
  const updateMutation = useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      search?: Record<string, unknown>;
      paused?: boolean;
      emailAlerts?: boolean;
    }) => update({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update saved search."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete saved search."),
  });
  function openSearch(item: SavedSearch) {
    const params = new URLSearchParams();
    Object.entries(item.search).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    params.set("savedSearchId", item.id);
    window.location.assign(`/browse?${params.toString()}`);
  }
  const visible = searches
    .filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) =>
      sort === "oldest"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  function editSearch(item: SavedSearch) {
    const nextName = window.prompt("Saved search name", item.name)?.trim();
    if (!nextName || nextName === item.name) return;
    const currentQuery = typeof item.search["q"] === "string" ? item.search["q"] : "";
    const nextQuery = window.prompt("Search phrase", currentQuery);
    updateMutation.mutate({
      id: item.id,
      name: nextName,
      search: { ...item.search, q: nextQuery?.trim() || undefined },
    });
  }
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Saved searches"
        title={`${searches.length} saved ${searches.length === 1 ? "search" : "searches"}`}
        body="Save the filters you use often and get an in-app or email alert when new matches arrive."
        action={
          <Link
            to="/browse"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90"
          >
            <Plus size={16} weight="bold" /> New search
          </Link>
        }
      />
      <form
        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Saved search name"
            className="field"
            required
          />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="What should we watch for?"
            className="field"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="h-10 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {createMutation.isPending ? "Saving…" : "Save search"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          For the complete workflow, open Browse, set every filter you want, then choose “Save this
          search.” The entire filter set—including vehicle, home, job, service, price, location, and
          category values—will be preserved.
        </p>
      </form>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="field flex items-center gap-2">
          <MagnifyingGlass size={16} className="text-muted-foreground" />
          <span className="sr-only">Search saved search names</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search saved search names"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
          className="field"
        >
          <option value="newest">Newest to oldest</option>
          <option value="oldest">Oldest to newest</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={searches.length === 0 ? "No saved searches yet" : "No saved search matches"}
          body="Save a search to get back to the filters that matter to you."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const filterEntries = Object.entries(item.search).filter(
              ([key, value]) =>
                !["q", "sort", "view", "page", "savedSearchId"].includes(key) &&
                value !== undefined &&
                value !== "",
            );
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold">{item.name}</h3>
                      {item.paused && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {typeof item.search["q"] === "string" && item.search["q"]
                        ? `“${item.search["q"]}” · `
                        : "All classifieds · "}
                      {filterEntries.length ? `${filterEntries.length} filters · ` : ""}
                      {item.emailAlerts ? "Email alerts on" : "In-app only"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {filterEntries.slice(0, 8).map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground"
                        >
                          {key
                            .replace(/[A-Z]/g, (letter) => ` ${letter}`)
                            .replace(/^./, (letter) => letter.toUpperCase())}
                          : {Array.isArray(value) ? value.join(", ") : String(value)}
                        </span>
                      ))}
                      {filterEntries.length > 8 && (
                        <span className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground">
                          +{filterEntries.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSearch(item)}
                      aria-label={`Edit all filters for ${item.name}`}
                      className="h-8 rounded-lg border border-primary px-2.5 text-[11.5px] font-semibold text-primary hover:bg-secondary"
                    >
                      Edit filters
                    </button>
                    <button
                      type="button"
                      onClick={() => editSearch(item)}
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate({ id: item.id, paused: !item.paused })}
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      {item.paused ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateMutation.mutate({ id: item.id, emailAlerts: !item.emailAlerts })
                      }
                      className="h-8 rounded-lg border border-input px-2.5 text-[11.5px] font-semibold hover:bg-secondary"
                    >
                      {item.emailAlerts ? "Email on" : "Email off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="h-8 rounded-lg border border-destructive/30 px-2.5 text-[11.5px] font-semibold text-destructive hover:bg-destructive/5"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessagesSection({
  conversations,
  conversationId,
  onOpen,
}: {
  conversations: ConversationSummary[];
  conversationId?: string | undefined;
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getConversation);
  const markRead = useServerFn(markConversationRead);
  const send = useServerFn(sendConversationMessage);
  const prepareAttachment = useServerFn(createConversationAttachmentUpload);
  const sendAttachment = useServerFn(sendConversationMessageWithAttachment);
  const block = useServerFn(blockConversation);
  const report = useServerFn(reportConversation);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [blockOpen, setBlockOpen] = useState(false);
  const activeId = conversationId ?? conversations[0]?.id;
  const activeList = conversations.filter(
    (item) =>
      (filter === "unread"
        ? item.unread
        : filter === "all" ||
          (filter === "buying" ? item.memberRole === "buyer" : item.memberRole === "seller")) &&
      item.listingTitle.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = activeList.find((item) => item.id === activeId) ?? activeList[0];
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    void fetchConversation({ data: { id: selected.id } })
      .then(async (value) => {
        setDetail(value);
        if (selected.unread) {
          await markRead({ data: { conversationId: selected.id } });
          await queryClient.invalidateQueries({ queryKey: ["conversations"] });
          await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      })
      .catch(() => setDetail(null));
  }, [selected?.id]);
  const sendMutation = useMutation({
    mutationFn: () => send({ data: { conversationId: selected?.id ?? "", body } }),
    onSuccess: async () => {
      setBody("");
      if (selected) setDetail(await fetchConversation({ data: { id: selected.id } }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send message."),
  });
  const sendAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !attachment) throw new Error("Choose an attachment first.");
      const prepared = await prepareAttachment({
        data: {
          conversationId: selected.id,
          fileName: attachment.name,
          contentType: attachment.type,
          size: attachment.size,
        },
      });
      const { error } = await supabase.storage
        .from("conversation-attachments")
        .uploadToSignedUrl(prepared.path, prepared.token, attachment);
      if (error) throw new Error(error.message);
      return sendAttachment({
        data: {
          conversationId: selected.id,
          body: body.trim() || "Shared an attachment.",
          attachmentPath: prepared.path,
          attachmentContentType: prepared.contentType,
          attachmentSize: prepared.size,
        },
      });
    },
    onSuccess: async () => {
      setBody("");
      setAttachment(null);
      if (selected) setDetail(await fetchConversation({ data: { id: selected.id } }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send attachment."),
  });
  const blockMutation = useMutation({
    mutationFn: (id: string) => block({ data: { conversationId: id } }),
    onSuccess: async () => {
      toast.success("Member blocked.");
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not block member."),
  });
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Messages"
        title="Keep marketplace conversations together"
        body="Message buyers and sellers inside Gem State. Your phone, text, and email buttons remain separate contact options on listings."
      />
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-3 shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-border pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
            <label className="field flex items-center gap-2">
              <MagnifyingGlass size={15} className="text-muted-foreground" />
              <span className="sr-only">Search conversations</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="field"
            >
              <option value="all">All messages</option>
              <option value="unread">Unread</option>
              <option value="buying">Buying</option>
              <option value="selling">Selling</option>
            </select>
          </div>
          <div className="mt-3 max-h-[480px] space-y-1 overflow-y-auto">
            {activeList.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onOpen(item.id)}
                className={`w-full rounded-xl p-3 text-left transition-colors ${item.id === selected?.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12.5px] font-semibold">{item.listingTitle}</p>
                  {item.unread && (
                    <span
                      className={`size-2 rounded-full ${item.id === selected?.id ? "bg-accent" : "bg-primary"}`}
                    />
                  )}
                </div>
                <p
                  className={`mt-1 text-[11px] ${item.id === selected?.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {new Date(item.lastMessageAt).toLocaleDateString()}
                </p>
              </button>
            ))}
            {activeList.length === 0 && (
              <p className="px-2 py-8 text-center text-[12px] text-muted-foreground">
                No conversations match these filters.
              </p>
            )}
          </div>
        </div>
        <div className="flex min-h-[420px] flex-col">
          <div className="border-b border-border px-2 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold">
                  {detail?.listingTitle ?? "Select a conversation"}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {detail
                    ? "Keep payment details and sensitive information out of messages."
                    : "Your buyer and seller conversations will appear here."}
                </p>
              </div>
              {detail && (
                <button
                  type="button"
                  onClick={() => setBlockOpen(true)}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                >
                  Block member
                </button>
              )}
            </div>
          </div>
          {detail ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${message.senderId === detail.buyerId ? "bg-secondary" : "ml-auto bg-primary text-primary-foreground"}`}
                  >
                    <p>{message.body}</p>
                    {message.attachmentUrl && (
                      <a
                        href={message.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-lg border border-current/30 px-2 py-1 text-[11px] font-semibold hover:opacity-80"
                      >
                        Open attachment
                      </a>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${message.senderId === detail.buyerId ? "text-muted-foreground" : "text-primary-foreground/70"}`}
                    >
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <form
                className="border-t border-border px-2 pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (attachment) sendAttachmentMutation.mutate();
                  else if (body.trim()) sendMutation.mutate();
                }}
              >
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Write a reply…"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (
                          file &&
                          (!new Set([
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                            "application/pdf",
                          ]).has(file.type) ||
                            file.size > 10 * 1024 * 1024)
                        ) {
                          toast.error("Use a JPG, PNG, WebP, or PDF no larger than 10 MB.");
                          event.currentTarget.value = "";
                          setAttachment(null);
                          return;
                        }
                        setAttachment(file);
                      }}
                    />
                    <span className="rounded-lg border border-input px-2.5 py-1.5">
                      {attachment ? `Attach: ${attachment.name}` : "Add attachment"}
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setReportReason("");
                        setReportOpen(true);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Report conversation
                    </button>
                    <button
                      type="submit"
                      disabled={
                        sendMutation.isPending ||
                        sendAttachmentMutation.isPending ||
                        blockMutation.isPending ||
                        (!body.trim() && !attachment)
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {sendMutation.isPending || sendAttachmentMutation.isPending
                        ? "Sending…"
                        : "Send"}
                      <PaperPlaneTilt size={14} weight="fill" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[10.5px] text-muted-foreground">
                  JPG, PNG, WebP, or PDF · 10 MB maximum. Never send payment details or sensitive
                  information.
                </p>
              </form>
            </>
          ) : (
            <EmptyState
              title="No conversation selected"
              body="Open a conversation from a listing or select one from the list."
              action={
                <Link
                  to="/browse"
                  className="text-[12px] font-semibold text-primary hover:underline"
                >
                  Browse listings
                </Link>
              }
            />
          )}
        </div>
      </div>
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this conversation</DialogTitle>
            <DialogDescription>
              Tell us what happened. Reports are reviewed by Gem State moderators.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
            placeholder="Reason for reporting"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!detail || reportReason.trim().length < 3}
              onClick={() => {
                if (!detail) return;
                void report({ data: { conversationId: detail.id, reason: reportReason } })
                  .then(() => {
                    setReportOpen(false);
                    toast.success("Conversation reported.");
                  })
                  .catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Could not report conversation.",
                    ),
                  );
              }}
            >
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block this member?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer receive messages from this conversation. You can contact support if
              you need help reversing a block.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (detail) blockMutation.mutate(detail.id);
              }}
            >
              Block member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NotificationsSection({
  data,
}: {
  data?: { items: MemberNotification[]; unread: number } | undefined;
}) {
  const queryClient = useQueryClient();
  const markRead = useServerFn(markNotificationsRead);
  const [filter, setFilter] = useState("all");
  const mutation = useMutation({
    mutationFn: () => markRead({ data: { ids: null } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => markRead({ data: { ids: [id] } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const items = data?.items ?? [];
  const visible = items.filter((item) => filter === "all" || item.kind === filter);
  const kinds = [...new Set(items.map((item) => item.kind).filter(Boolean))];
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Activity"
        title={`${data?.unread ?? 0} unread notifications`}
        body="Listing updates, messages, saved-search matches, reviews, and seller billing activity will appear here."
        action={
          (data?.unread ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              className="h-9 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="text-[12px] font-medium text-muted-foreground"
          htmlFor="notification-filter"
        >
          Filter
        </label>
        <select
          id="notification-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="field max-w-[220px]"
        >
          <option value="all">All activity</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No notifications yet" : "No matching notifications"}
          body="Your account activity will appear here as you use Gem State."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {visible.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-3 p-4 ${item.readAt ? "" : "bg-secondary/30"}`}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{item.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {item.destinationUrl && (
                      <a
                        href={item.destinationUrl}
                        className="inline-flex text-[11.5px] font-semibold text-primary hover:underline"
                      >
                        Open related activity
                        <ArrowRight size={13} className="ml-1" />
                      </a>
                    )}
                    {!item.readAt && (
                      <button
                        type="button"
                        onClick={() => markOne.mutate(item.id)}
                        className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ListingsSection({
  listings,
  sellerSetup,
}: {
  listings: MyListing[];
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
}) {
  const queryClient = useQueryClient();
  const cancel = useServerFn(cancelListing);
  const relist = useServerFn(relistSellerListing);
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const matchesFilter = (item: MyListing) => {
    if (filter === "all") return true;
    if (filter === "active") return item.status === "active" && Boolean(item.approvedAt);
    if (filter === "pending") return !item.approvedAt || item.status === "pending_review";
    if (filter === "inactive") return item.status !== "active" && Boolean(item.approvedAt);
    return filter === item.status;
  };
  const visible = listings
    .filter(
      (item) =>
        item.productName.toLowerCase().includes(query.toLowerCase()) &&
        matchesFilter(item),
    )
    .sort((a, b) =>
      sort === "views"
        ? (b.views ?? 0) - (a.views ?? 0)
        : sort === "leads"
          ? (b.leadCount ?? 0) - (a.leadCount ?? 0)
          : sort === "oldest"
            ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancel({ data: { kind: "ask", id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Listing taken down.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not take down listing."),
  });
  const relistMutation = useMutation({
    mutationFn: (id: string) => relist({ data: { listingId: id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Listing sent back for review.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not relist listing."),
  });
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Seller workspace"
        title="Your listings"
        body="Edit, duplicate, promote, archive, and track every listing from this Seller Center. Metrics and buyer leads are shown on each row."
        action={
          <Link
            to="/create-listing"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground hover:opacity-90"
          >
            <Plus size={16} weight="bold" /> Add listing
          </Link>
        }
      />
      {!sellerSetup?.exists && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <p className="text-[14px] font-semibold">Become a Gem State seller</p>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted-foreground">
            Set up your public seller profile before publishing. Direct-contact listings do not
            require buyer checkout or payout onboarding.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            Start seller setup
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`tab-button ${filter === "active" ? "tab-button--active" : ""}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`tab-button ${filter === "pending" ? "tab-button--active" : ""}`}
          >
            Awaiting approval
          </button>
          <button
            type="button"
            onClick={() => setFilter("inactive")}
            className={`tab-button ${filter === "inactive" ? "tab-button--active" : ""}`}
          >
            Inactive
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`tab-button ${filter === "all" ? "tab-button--active" : ""}`}
          >
            All
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="field flex items-center gap-2">
            <MagnifyingGlass size={15} className="text-muted-foreground" />
            <span className="sr-only">Search listings</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your listings"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <select
            aria-label="Sort seller listings"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="field"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="views">Most views</option>
            <option value="leads">Most leads</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="No listings in this view"
          body="Your active, pending, and inactive listings will appear here."
          action={
            <Link
              to="/create-listing"
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Create a listing
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <SellerListingCard
              key={item.id}
              item={item}
              onTakeDown={() => {
                if (window.confirm("Archive this listing?")) cancelMutation.mutate(item.id);
              }}
              onRelist={() => relistMutation.mutate(item.id)}
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Legacy Seller Center links still work, but this account section is now the primary place to
        manage listings.
      </p>
    </div>
  );
}

function SellerListingCard({
  item,
  onTakeDown,
  onRelist,
}: {
  item: MyListing;
  onTakeDown: () => void;
  onRelist: () => void;
}) {
  const active = item.status === "active" && Boolean(item.approvedAt);
  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-[120px_minmax(0,1fr)_220px]">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-secondary">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-semibold leading-snug">{item.productName}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">{item.variantLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {active
                ? "Active"
                : item.status === "pending_review" || !item.approvedAt
                  ? "Awaiting approval"
                  : item.status}
            </span>
            {item.upgradeStatus === "paid" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                Upgraded
              </span>
            )}
          </div>
        </div>
        <p className="numeric mt-3 text-[18px] font-bold">{formatUsd(item.priceCents)}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Created {new Date(item.createdAt).toLocaleDateString()} · Expires{" "}
          {new Date(item.expiresAt).toLocaleDateString()}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px] sm:grid-cols-4">
          <Metric label="Views" value={item.views ?? 0} />
          <Metric label="Impressions" value={item.impressions ?? 0} />
          <Metric label="Leads" value={item.leadCount ?? 0} />
          <Metric label="Offers" value={item.activeBidCount ?? 0} />
        </dl>
      </div>
      <div className="self-center">
        <div className="rounded-xl bg-secondary/55 p-3 text-[11.5px]">
          <p className="font-semibold">Metrics</p>
          <p className="mt-1 text-muted-foreground">
            <Eye size={13} className="mr-1 inline" />
            {item.views ?? 0} views · {item.impressions ?? 0} impressions
          </p>
          <Link
            to="/account"
            search={{ section: "messages" }}
            className="mt-1 inline-flex text-muted-foreground hover:text-foreground"
          >
            {item.leadCount ?? 0} buyer leads
            <ArrowRight size={12} className="ml-1" />
          </Link>
          <p className="mt-1 text-muted-foreground">
            {item.upgradeStatus === "paid" ? "Upgrade applied" : "Standard placement"}
          </p>
        </div>
        <details className="relative mt-3">
          <summary className="flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-input px-2.5 text-[11px] font-semibold hover:bg-secondary">
            <PencilSimple size={13} /> Manage
          </summary>
          <div className="absolute right-0 z-10 mt-1 grid min-w-[170px] gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
            <Link
              to="/listings/$listingId/edit"
              params={{ listingId: item.id }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              Edit listing
            </Link>
            <Link
              to="/listings/$listingId"
              params={{ listingId: item.id }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              View listing
            </Link>
            <Link
              to="/account"
              search={{ section: "messages" }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              View leads & messages
            </Link>
            <Link
              to="/account"
              search={{ section: "billing" }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              Promote listing
            </Link>
            <Link
              to="/create-listing"
              search={{ duplicateFrom: item.id }}
              className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
            >
              Duplicate
            </Link>
            {active ? (
              <button
                type="button"
                onClick={onTakeDown}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] text-destructive hover:bg-destructive/5"
              >
                Archive listing
              </button>
            ) : (
              <button
                type="button"
                onClick={onRelist}
                className="rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-secondary"
              >
                Restore / relist
              </button>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

function ReviewsSection({
  summary,
  sellerSetup,
  orders,
}: {
  summary?: Awaited<ReturnType<typeof getSellerDashboardSummary>> | undefined;
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
  orders: MyOrder[];
}) {
  const rating = summary?.ratingAverage;
  const reviews = summary?.reviews ?? [];
  const distribution = [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: reviews.filter((review) => review.rating === score).length,
  }));

  async function shareReviewLink() {
    if (!sellerSetup?.slug) {
      toast.info("Complete seller setup before sharing your review link.");
      return;
    }
    const url = `${window.location.origin}/sellers/${sellerSetup.slug}?review=1`;
    try {
      if (navigator.share)
        await navigator.share({ title: "Review my Gem State seller profile", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Review link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share the review link.");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Trust profile"
        title="Reviews & reputation"
        body="See the reputation you have earned, the reviews you have written, and any eligible interactions still waiting for feedback."
        action={
          sellerSetup?.slug ? (
            <Link
              to="/sellers/$slug"
              params={{ slug: sellerSetup.slug }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-[12px] font-semibold hover:bg-secondary"
            >
              View public profile
              <ArrowRight size={14} />
            </Link>
          ) : undefined
        }
      />
      <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 shadow-sm lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-secondary text-[24px] font-bold text-primary">
            {rating == null ? "—" : rating.toFixed(1)}
          </div>
          <p className="mt-2 text-[12px] font-semibold">
            {rating == null ? "No reviews yet" : "Average rating"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{reviews.length} received</p>
        </div>
        <div className="space-y-2">
          {distribution.map((row) => (
            <div key={row.score} className="flex items-center gap-3 text-[11px]">
              <span className="w-8 font-semibold">{row.score} star</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${reviews.length ? (row.count / reviews.length) * 100 : 0}%` }}
                />
              </span>
              <span className="w-5 text-right text-muted-foreground">{row.count}</span>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void shareReviewLink()}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
          >
            <ClipboardText size={14} /> Share review link
          </button>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle title="Reviews received" />
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Feedback from eligible marketplace interactions.
          </p>
          {reviews.length ? (
            <div className="mt-4 space-y-3">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{"★".repeat(review.rating)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    {review.comment || "No written comment."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">No completed reviews yet.</p>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SectionTitle title="Your review activity" />
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Reviews you have written and interactions still eligible for feedback.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Written by you" value={summary?.reviewsWritten.length ?? 0} />
            <MiniMetric label="Pending requests" value={summary?.pendingReviewCount ?? 0} />
          </div>
          {(summary?.reviewsWritten.length ?? 0) > 0 ? (
            <div className="mt-4 space-y-3">
              {summary?.reviewsWritten.map((review) => (
                <article
                  key={review.id}
                  className="border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{"★".repeat(review.rating)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {review.comment || "No written comment."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Reviews become available after an eligible marketplace interaction is completed. Your
              reviews will appear here once one is ready.
            </p>
          )}
          <Link
            to="/account"
            search={{ section: "messages" }}
            className="mt-4 inline-flex text-[12px] font-semibold text-primary hover:underline"
          >
            Open marketplace messages
            <ArrowRight size={13} className="ml-1" />
          </Link>
        </section>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Eligible review requests" />
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Completed marketplace transactions appear here with the verified write-a-review form.
          Reviews are limited to real, completed orders.
        </p>
        <div className="mt-4 space-y-4">
          {orders
            .filter((order) => order.status === "completed")
            .map((order) => (
              <OrderReviewCard key={order.id} orderId={order.id} role={order.role} />
            ))}
          {orders.filter((order) => order.status === "completed").length === 0 && (
            <EmptyState
              title="No eligible review requests yet"
              body="Complete a marketplace transaction and the review form will appear here."
              action={
                <Link
                  to="/browse"
                  className="text-[12px] font-semibold text-primary hover:underline"
                >
                  Browse listings
                </Link>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

function BillingSection({
  sellerSetup,
  listings,
  options,
  history,
}: {
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
  listings: MyListing[];
  options: ListingUpgradeOption[];
  history: ListingUpgradePurchase[];
}) {
  const createCheckout = useServerFn(createListingUpgradeCheckout);
  const [listingId, setListingId] = useState("");
  const [upgradeCode, setUpgradeCode] = useState("");
  const checkout = useMutation({
    mutationFn: () => createCheckout({ data: { listingId, upgradeCode } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start Stripe Checkout."),
  });
  const eligibleListings = listings.filter(
    (item) => item.status === "active" && Boolean(item.approvedAt),
  );
  useEffect(() => {
    if (!listingId && eligibleListings[0]) setListingId(eligibleListings[0].id);
    if (!upgradeCode && options[0]) setUpgradeCode(options[0].code);
  }, [eligibleListings, listingId, options, upgradeCode]);
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Seller billing"
        title="Listing upgrades"
        body="Basic listings remain free. Choose an upgrade only when you want extra visibility or time, then pay securely through Stripe."
      />
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <CreditCard size={22} className="mt-0.5 text-primary" />
          <div>
            <h3 className="text-[15px] font-bold">Promote a listing</h3>
            <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted-foreground">
              Gem State calculates the price from the active catalog and applies the upgrade only
              after Stripe confirms payment. Card details never touch Gem State.
            </p>
          </div>
        </div>
        {eligibleListings.length === 0 ? (
          <EmptyState
            title="No eligible listings yet"
            body="Create and publish an approved listing before purchasing a seller upgrade."
            action={
              <Link
                to="/create-listing"
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                Create a listing
              </Link>
            }
          />
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="field">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Listing
              </span>
              <select
                value={listingId}
                onChange={(event) => setListingId(event.target.value)}
                className="w-full bg-transparent outline-none"
              >
                {eligibleListings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Upgrade
              </span>
              <select
                value={upgradeCode}
                onChange={(event) => setUpgradeCode(event.target.value)}
                className="w-full bg-transparent outline-none"
              >
                {options.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} · {formatUsd(item.amountCents)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending || !listingId || !upgradeCode}
              className="h-10 self-end rounded-xl bg-accent px-4 text-[12px] font-semibold text-accent-foreground disabled:opacity-60"
            >
              {checkout.isPending ? "Opening Stripe…" : "Continue to Stripe"}
            </button>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {options.map((item) => (
            <div key={item.code} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold">{item.name}</p>
                <span className="numeric text-[12px] font-bold">{formatUsd(item.amountCents)}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/45 p-3">
          <p className="text-[11.5px] text-muted-foreground">
            Stripe seller connection:{" "}
            {sellerSetup?.stripeAccountModeCurrent ? "Connected" : "Platform checkout ready"}
          </p>
          <Link
            to="/seller-setup"
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            Seller setup
            <ArrowRight size={13} className="ml-1 inline" />
          </Link>
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle title="Upgrade history" />
        {history.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Paid listing upgrades and receipts will appear here.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {history.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[12.5px] font-semibold">
                    {item.upgradeName} · {item.listingTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()} · {item.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="numeric text-[12px] font-semibold">
                    {formatUsd(item.amountCents)}
                  </span>
                  {item.receiptUrl && (
                    <a
                      href={item.receiptUrl}
                      className="text-[11.5px] font-semibold text-primary hover:underline"
                    >
                      Receipt
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      {action}
    </div>
  );
}
function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-secondary/55 p-3">
      <p className="text-[21px] font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
function NextStep({
  icon: Icon,
  title,
  body,
  href,
  onClick,
}: {
  icon: typeof Storefront;
  title: string;
  body: string;
  href?: string;
  onClick?: () => void;
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
    <Link to={href} className="rounded-xl border border-border p-3 hover:bg-secondary/40">
      {content}
    </Link>
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
}: {
  icon: typeof Storefront;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon size={18} className="text-primary" />
      <span className="flex-1 text-left text-[12px] font-semibold">{label}</span>
      <ArrowRight size={14} className="text-muted-foreground" />
    </>
  );
  return href ? (
    <Link
      to={href}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 hover:bg-secondary/40"
    >
      {content}
    </Link>
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
function TrustBadge({ icon: Icon, label }: { icon: typeof CheckCircle; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
      <Icon size={13} className="text-primary" weight="fill" />
      {label}
    </span>
  );
}
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-[12px] font-medium ${className}`}>
      {label}
      {children}
    </label>
  );
}
function SettingLine({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div>
        <p className="text-[12px] font-semibold">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{value}</p>
      </div>
      {children}
    </div>
  );
}
function SettingsBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserCircle;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border p-5 last:border-b-0">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h3 className="text-[14px] font-bold">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function PreferenceCard({
  title,
  body,
  rows,
  onChange,
  onSave,
  saving,
}: {
  title: string;
  body: string;
  rows: { key: string; label: string; value: boolean }[];
  onChange: (key: string, value: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-[14px] font-bold">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <ToggleRow
            key={row.key}
            label={row.label}
            checked={row.value}
            onChange={(value) => onChange(row.key, value)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-5 h-9 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </section>
  );
}
function ToggleRow({
  label,
  body,
  checked,
  onChange,
}: {
  label: string;
  body?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-[12px] font-medium">{label}</span>
        {body && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
            {body}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--color-primary)]"
      />
    </label>
  );
}
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-12 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-[48ch] text-[12px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
