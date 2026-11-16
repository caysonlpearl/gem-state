import {
  PersonalizedShopping,
  ShoppingAlertPreference,
} from "@/components/community/ShoppingExperience";
import { ImportSyncPanel } from "@/components/seller/ImportSyncPanel";
import { websiteAccountSignOut } from "@/lib/account-session";
import {
  ArrowRight,
  Bell,
  BookmarkSimple,
  ChatCircle,
  CreditCard,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AccountOverviewView } from "./AccountOverviewView";
import { ReviewsSectionView } from "./ReviewsSectionView";
import { ListingsSectionView, type SellerListingLinkProps } from "./ListingsSectionView";
import { AccountLayoutView } from "./AccountLayoutView";
import { AccountProfileView, type AccountLinkProps } from "./AccountProfileView";
import {
  AccountEmptyState as EmptyState,
  AccountSectionHeader as SectionHeader,
} from "./AccountSectionView";
import { AccountSettingsView } from "./AccountSettingsView";
import { SectionTitle } from "./AccountViewParts";
import { DealerInventoryPanel } from "./DealerInventoryPanel";
import { MessagesSectionView } from "./MessagesSectionView";
import { NotificationsSectionView } from "./NotificationsSectionView";
import { SavedPartnerSectionView } from "./SavedPartnerSectionView";
import { SavedListingsSectionView, type SavedListingLinkProps } from "./SavedListingsSectionView";
import { SavedSearchesSectionView } from "./SavedSearchesSectionView";
import { useAccountProfileDraft } from "./useAccountProfileDraft";

import { ListingCard } from "@/components/classifieds/ListingCard";
import { formatUsd } from "@/config/fees";
import { supabase } from "@/integrations/supabase/client";
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
  getMyAccount,
  saveMyProfile,
  updateMyAvatar,
  type MyAccount,
} from "@/lib/account.functions";
import { getAdminAccess } from "@/lib/admin-access.functions";
import { trackEvent } from "@/lib/analytics";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import type { ClassifiedCard } from "@/lib/classifieds.functions";
import { getMyWatchlist, setWatchState, type WatchedVariant } from "@/lib/community.functions";
import {
  blockConversation,
  createConversationAttachmentUpload,
  getConversation,
  getMyConversations,
  markConversationRead,
  reportConversation,
  sendConversationMessage,
  sendConversationMessageWithAttachment,
  type ConversationDetail,
  type ConversationSummary,
} from "@/lib/conversation.functions";
import { cancelListing, getMyListings, type MyListing } from "@/lib/market.functions";
import {
  getMyNotifications,
  markNotificationsRead,
  type MemberNotification,
} from "@/lib/notifications.functions";
import { getMySavedPartnerHomes } from "@/lib/saved-homes.functions";
import { getMySavedPartnerJobs } from "@/lib/saved-jobs.functions";
import { getMySavedPartnerVehicles } from "@/lib/saved-vehicles.functions";
import { sellerListingState } from "@/lib/seller-listing-state";

import {
  createListingUpgradeCheckout,
  getListingUpgradeOptions,
  getSellerBillingHistory,
  reconcileListingUpgradeCheckout,
  type ListingUpgradeOption,
  type ListingUpgradePurchase,
} from "@/lib/listing-upgrade.functions";
import {
  getSellerDashboardSummary,
  getSellerSetup,
  relistSellerListing,
} from "@/lib/seller.functions";
import type { AccountSection } from "./account-sections";

type AccountCenterProps = {
  section: AccountSection;
  conversationId?: string | undefined;
  checkout?: "success" | "cancelled" | undefined;
  purchaseId?: string | undefined;
};

const roleLabels: Record<string, string> = {
  user: "Member",
  shopper: "Member",
  moderator: "Moderator",
  admin: "Administrator",
};

export function AccountCenter({
  section,
  conversationId,
  checkout,
  purchaseId,
}: AccountCenterProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutInFlight = useRef(false);
  const fetchAccount = useServerFn(getMyAccount);
  const fetchWatchlist = useServerFn(getMyWatchlist);
  const fetchNotifications = useServerFn(getMyNotifications);
  const fetchConversations = useServerFn(getMyConversations);
  const fetchSavedSearches = useServerFn(getMySavedSearches);
  const fetchContactPreferences = useServerFn(getMyContactPreferences);
  const fetchNotificationPreferences = useServerFn(getMyNotificationPreferences);
  const fetchSellerSetup = useServerFn(getSellerSetup);
  const fetchListings = useServerFn(getMyListings);
  const fetchSellerSummary = useServerFn(getSellerDashboardSummary);
  const fetchUpgradeOptions = useServerFn(getListingUpgradeOptions);
  const fetchBillingHistory = useServerFn(getSellerBillingHistory);
  const fetchAdminAccess = useServerFn(getAdminAccess);
  const reconcileCheckout = useServerFn(reconcileListingUpgradeCheckout);

  useEffect(() => {
    void trackEvent("page_view", { route: `/account?section=${section}` });
  }, [section]);

  useEffect(() => {
    if (section !== "billing" || !purchaseId || !checkout) return;
    void reconcileCheckout({ data: { purchaseId, cancelled: checkout === "cancelled" } })
      .then((result) => {
        queryClient.invalidateQueries({ queryKey: ["seller-billing-history"] });
        if (result === "paid") toast.success("Listing upgrade applied.");
        if (result === "canceled")
          toast.message("Stripe checkout canceled; no upgrade was applied.");
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not reconcile Stripe checkout.",
        );
      });
  }, [checkout, purchaseId, queryClient, reconcileCheckout, section]);

  const account = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });
  const adminAccess = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => fetchAdminAccess(),
    enabled: Boolean(account.data),
    retry: false,
  });
  const watchlist = useQuery({
    queryKey: ["my-watchlist"],
    queryFn: () => fetchWatchlist(),
    enabled: section === "overview" || section === "saved",
  });
  const fetchSavedPartnerJobs = useServerFn(getMySavedPartnerJobs);
  const savedPartnerJobs = useQuery({
    queryKey: ["my-saved-partner-jobs"],
    queryFn: () => fetchSavedPartnerJobs(),
    enabled: section === "saved",
  });
  const fetchSavedPartnerHomes = useServerFn(getMySavedPartnerHomes);
  const savedPartnerHomes = useQuery({
    queryKey: ["my-saved-partner-homes"],
    queryFn: () => fetchSavedPartnerHomes(),
    enabled: section === "saved",
  });
  const fetchSavedPartnerVehicles = useServerFn(getMySavedPartnerVehicles);
  const savedPartnerVehicles = useQuery({
    queryKey: ["my-saved-partner-vehicles"],
    queryFn: () => fetchSavedPartnerVehicles(),
    enabled: section === "saved",
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
    refetchInterval: 15000,
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
    // The account shell uses seller listings for overview metrics, Seller
    // Center, and billing. Keep one shared query alive across section changes
    // so billing never renders before its eligible-listing data exists.
    enabled: true,
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

  function go(next: AccountSection, extra: { conversation?: string } = {}) {
    void navigate({ to: "/account", search: { section: next, ...extra } });
  }

  async function signOut(scope: "local" | "global" = "local") {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    try {
      await websiteAccountSignOut(supabase.auth, account.data?.userId, scope);
      await queryClient.cancelQueries();
      queryClient.clear();
      await navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out. Please retry.");
    } finally {
      signOutInFlight.current = false;
    }
  }

  if (account.isError) {
    return (
      <AccountError message={account.error instanceof Error ? account.error.message : undefined} />
    );
  }

  const data = account.data;
  const unreadMessages = conversations.data?.filter((item) => item.unread).length ?? 0;
  const unreadNotifications = notifications.data?.unread ?? 0;
  const sellerVisible = Boolean(sellerSetup.data?.exists || data?.primaryIntent === "selling");
  const adminVisible = adminAccess.data?.isAdmin === true;

  return (
    <AccountLayoutView
      section={section}
      onSelect={go}
      onSignOut={() => void signOut()}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      sellerVisible={sellerVisible}
      phoneAdminLink={
        adminVisible ? (
          <Link
            to="/admin"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-sm"
          >
            <ShieldCheck size={16} weight="fill" aria-hidden="true" />
            Admin panel
          </Link>
        ) : undefined
      }
      adminLink={
        adminVisible ? (
          <Link
            to="/admin"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <ShieldCheck size={18} weight="fill" aria-hidden="true" />
            <span className="flex-1">Admin panel</span>
          </Link>
        ) : undefined
      }
    >
      {account.isLoading ? (
        <AccountSectionSkeleton section={section} />
      ) : !data ? (
        <AccountError message="Could not load your account." />
      ) : section === "overview" ? (
        <div className="space-y-6">
          <DealerInventoryPanel compact />
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
        </div>
      ) : section === "profile" ? (
        <div className="space-y-6">
          <DealerInventoryPanel compact />
          <ProfileSection
            account={data}
            contactPreferences={contactPreferences.data}
            sellerSetup={sellerSetup.data}
            sellerSummary={sellerSummary.data}
          />
        </div>
      ) : section === "settings" ? (
        <SettingsSection
          account={data}
          contactPreferences={contactPreferences.data}
          notificationPreferences={notificationPreferences.data}
          onSignOutAll={() => signOut("global")}
        />
      ) : section === "saved" ? (
        <>
          {watchlist.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading saved listings…
            </p>
          ) : watchlist.isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
            >
              Could not load saved listings. Please retry.
              <button
                type="button"
                className="ml-3 min-h-11 font-semibold underline"
                onClick={() => void watchlist.refetch()}
              >
                Retry saved listings
              </button>
            </div>
          ) : (
            <SavedListingsSection items={watchlist.data ?? []} />
          )}
          <SavedPartnerJobsSection jobs={savedPartnerJobs.data ?? []} />
          <SavedPartnerHomesSection homes={savedPartnerHomes.data ?? []} />
          <SavedPartnerVehiclesSection vehicles={savedPartnerVehicles.data ?? []} />
        </>
      ) : section === "searches" ? (
        <>
          <PersonalizedShopping />
          <SavedSearchesSection searches={savedSearches.data ?? []} />
        </>
      ) : section === "messages" ? (
        <MessagesSection
          conversations={conversations.data ?? []}
          conversationId={conversationId}
          onOpen={(id) => go("messages", { conversation: id })}
        />
      ) : section === "notifications" ? (
        <NotificationsSection data={notifications.data} />
      ) : section === "listings" ? (
        <div className="space-y-6">
          <DealerInventoryPanel />
          <ListingsSection listings={listings.data?.asks ?? []} sellerSetup={sellerSetup.data} />
        </div>
      ) : section === "reviews" ? (
        <ReviewsSection summary={sellerSummary.data} sellerSetup={sellerSetup.data} />
      ) : (
        <BillingSection
          sellerSetup={sellerSetup.data}
          listings={listings.data?.asks ?? []}
          options={upgradeOptions.data ?? []}
          history={billingHistory.data ?? []}
        />
      )}
    </AccountLayoutView>
  );
}

const accountSectionTitles: Record<AccountSection, { title: string; body: string }> = {
  overview: {
    title: "Account overview",
    body: "Your saved activity, conversations, and selling tools are loading.",
  },
  profile: {
    title: "Public profile",
    body: "Your profile details and trust signals are loading.",
  },
  settings: {
    title: "Account & security",
    body: "Your account details and preferences are loading.",
  },
  listings: {
    title: "Listings",
    body: "Your seller workspace and listing performance are loading.",
  },
  saved: {
    title: "Saved listings",
    body: "Your saved marketplace listings are loading.",
  },
  searches: {
    title: "Saved searches",
    body: "Your saved filters and alert settings are loading.",
  },
  messages: {
    title: "Messages",
    body: "Your marketplace conversations are loading.",
  },
  notifications: {
    title: "Notifications",
    body: "Your marketplace updates are loading.",
  },
  reviews: {
    title: "Reviews & reputation",
    body: "Your ratings and review activity are loading.",
  },
  billing: {
    title: "Seller billing",
    body: "Your listing upgrade options and billing history are loading.",
  },
};

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-xl bg-secondary ${className}`} />
  );
}

function AccountSectionSkeleton({ section }: { section: AccountSection }) {
  const copy = accountSectionTitles[section];

  return (
    <div aria-busy="true" aria-label={`Loading ${copy.title}`}>
      <SectionHeader eyebrow="Member center" title={copy.title} body={copy.body} />
      {section === "messages" ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-card p-4">
            <SkeletonBlock className="h-10 w-full" />
            <div className="mt-4 space-y-3">
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <SkeletonBlock className="h-8 w-2/5" />
            <SkeletonBlock className="mt-5 h-40 w-full" />
            <SkeletonBlock className="mt-4 h-12 w-full" />
          </div>
        </div>
      ) : section === "overview" ? (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <SkeletonBlock className="size-16 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-5 w-1/3" />
                <SkeletonBlock className="h-4 w-1/2" />
              </div>
            </div>
            <SkeletonBlock className="mt-5 h-3 w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-24 w-full" />
          </div>
          <SkeletonBlock className="h-44 w-full" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
          <SkeletonBlock className="h-44 w-full" />
          <SkeletonBlock className="h-32 w-full" />
        </div>
      )}
    </div>
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
  return (
    <AccountOverviewView
      account={account}
      watchlistCount={watchlistCount}
      savedSearchCount={savedSearchCount}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      activeListings={listings.filter((item) => sellerListingState(item).group === "active").length}
      pendingListings={
        listings.filter((item) => sellerListingState(item).group === "pending").length
      }
      completedSalesCount={sellerSummary?.completedSalesCount ?? 0}
      sellerExists={sellerSetup?.exists === true}
      notifications={notifications}
      onSelect={onSelect}
      link={WebsiteAccountLink}
    />
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
  const saveAvatar = useServerFn(updateMyAvatar);
  const updatePreferences = useServerFn(updateMyContactPreferences);
  const draft = useAccountProfileDraft(account, contactPreferences);
  const {
    displayName,
    market,
    intent,
    allowPhone,
    allowText,
    allowEmail,
    showButtons,
    allowInternalMessages,
  } = draft;
  const [avatarBusy, setAvatarBusy] = useState(false);
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
  async function uploadAvatar(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile images must be 5 MB or smaller.");
      return;
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${account.userId}/avatar-${crypto.randomUUID()}.${extension}`;
    setAvatarBusy(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      await saveAvatar({ data: { path } });
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      toast.success("Profile picture updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update your profile picture.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }
  const removeAvatar = useMutation({
    mutationFn: () => saveAvatar({ data: { path: null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-account"] });
      toast.success("Profile picture removed.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove your profile picture.",
      ),
  });
  return (
    <AccountProfileView
      account={account}
      sellerSetup={sellerSetup}
      sellerSummary={sellerSummary}
      draft={draft}
      profileMutation={profileMutation}
      contactMutation={contactMutation}
      removeAvatar={removeAvatar}
      avatarBusy={avatarBusy}
      uploadAvatar={uploadAvatar}
      link={WebsiteAccountLink}
    />
  );
}

function SettingsSection({
  account,
  contactPreferences,
  notificationPreferences,
  onSignOutAll,
}: {
  account: MyAccount;
  contactPreferences?: ContactPreferences | undefined;
  notificationPreferences?: NotificationPreferences | undefined;
  onSignOutAll: () => Promise<void>;
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
      redirectTo: getAuthRedirectUrl(`/auth?mode=reset&redirect=${encodeURIComponent(redirect)}`),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset email sent.");
  }
  return (
    <AccountSettingsView
      account={account}
      contact={contact}
      setContact={setContact}
      notifications={notifications}
      setNotifications={setNotifications}
      saveContact={saveContact}
      saveNotifications={saveNotifications}
      requestPasswordReset={requestPasswordReset}
      signOutAll={onSignOutAll}
      shoppingAlerts={<ShoppingAlertPreference />}
      deletionControls={
        <>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            To protect active listings, messages, and transaction records, account deletion requests
            are reviewed by Bluebird support.
          </p>
          <Link
            to="/delete-account"
            className="mt-3 inline-flex text-[12px] font-semibold text-primary hover:underline"
          >
            Request account deletion
            <ArrowRight size={13} className="ml-1" />
          </Link>
        </>
      }
    />
  );
}

function SavedPartnerJobsSection({ jobs }: { jobs: ClassifiedCard[] }) {
  return (
    <SavedPartnerSectionView
      kind="jobs"
      items={jobs}
      renderCard={(job) => <ListingCard key={job.id} listing={job} />}
    />
  );
}
function SavedPartnerHomesSection({ homes }: { homes: ClassifiedCard[] }) {
  return (
    <SavedPartnerSectionView
      kind="homes"
      items={homes}
      renderCard={(home) => <ListingCard key={home.id} listing={home} />}
    />
  );
}
function SavedPartnerVehiclesSection({ vehicles }: { vehicles: ClassifiedCard[] }) {
  return (
    <SavedPartnerSectionView
      kind="vehicles"
      items={vehicles}
      renderCard={(vehicle) => <ListingCard key={vehicle.id} listing={vehicle} />}
    />
  );
}

function SavedListingsSection({ items }: { items: WatchedVariant[] }) {
  const queryClient = useQueryClient();
  const setWatch = useServerFn(setWatchState);
  const removeMutation = useMutation({
    mutationFn: (variantId: string) => setWatch({ data: { variantId, watching: false } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-watchlist"] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove saved listing."),
  });
  const bulkRemove = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((variantId) => setWatch({ data: { variantId, watching: false } }))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-watchlist"] });
      toast.success("Saved listings removed.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove saved listings."),
  });
  return (
    <SavedListingsSectionView
      items={items}
      link={WebsiteSavedLink}
      onRemove={(id) => removeMutation.mutate(id)}
      onRemoveSelected={(ids) => bulkRemove.mutateAsync(ids).then(() => {})}
      removingId={removeMutation.isPending ? removeMutation.variables : undefined}
      bulkRemoving={bulkRemove.isPending}
    />
  );
}
function WebsiteSavedLink({ to, params, search, ...props }: SavedListingLinkProps) {
  return <Link to={to} params={params} search={search} {...props} />;
}

function SavedSearchesSection({ searches }: { searches: SavedSearch[] }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createSavedSearch),
    update = useServerFn(updateSavedSearch),
    remove = useServerFn(deleteSavedSearch);
  const navigate = useNavigate();
  return (
    <SavedSearchesSectionView
      searches={searches}
      onCreate={(data) => create({ data })}
      onUpdate={(data) => update({ data })}
      onDelete={(id) => remove({ data: { id } })}
      onChanged={() => queryClient.invalidateQueries({ queryKey: ["saved-searches"] })}
      renderBrowseLink={SavedSearchBrowseLink}
      onOpenSearch={(item) => {
        const params = new URLSearchParams();
        Object.entries(item.search).forEach(([key, value]) => {
          if (key === "mobileCatalog" || value === undefined || value === null || value === "")
            return;
          params.set(key, String(value));
        });
        params.set("savedSearchId", item.id);
        window.location.assign("/browse?" + params);
      }}
    />
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
  const [failedSend, setFailedSend] = useState<"message" | "attachment" | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const sendLockRef = useRef(false);
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
  const selectedId = selected?.id;
  const selectedUnread = selected?.unread ?? false;
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setReportSubmitted(false);
      return;
    }
    setReportSubmitted(false);
    void fetchConversation({ data: { id: selectedId } })
      .then(async (value) => {
        setDetail(value);
        if (selectedUnread) {
          await markRead({ data: { conversationId: selectedId } });
          await queryClient.invalidateQueries({ queryKey: ["conversations"] });
          await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      })
      .catch(() => setDetail(null));
  }, [fetchConversation, markRead, queryClient, selectedId, selectedUnread]);
  const sendMutation = useMutation({
    mutationFn: () => send({ data: { conversationId: selected?.id ?? "", body } }),
    onSuccess: async () => {
      setBody("");
      setFailedSend(null);
      if (selected) setDetail(await fetchConversation({ data: { id: selected.id } }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFailedSend("message");
      toast.error(error instanceof Error ? error.message : "Could not send message.");
    },
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
      setFailedSend(null);
      if (selected) setDetail(await fetchConversation({ data: { id: selected.id } }));
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFailedSend("attachment");
      toast.error(error instanceof Error ? error.message : "Could not send attachment.");
    },
  });
  const submitMessage = () => {
    if (
      sendLockRef.current ||
      sendMutation.isPending ||
      sendAttachmentMutation.isPending ||
      (!body.trim() && !attachment)
    ) {
      return;
    }
    sendLockRef.current = true;
    const mutation = attachment ? sendAttachmentMutation : sendMutation;
    mutation.mutate(undefined, {
      onSettled: () => {
        sendLockRef.current = false;
      },
    });
  };
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
    <MessagesSectionView
      query={query}
      setQuery={setQuery}
      filter={filter}
      setFilter={setFilter}
      activeList={activeList}
      selected={selected}
      detail={detail}
      onOpen={onOpen}
      body={body}
      setBody={setBody}
      attachment={attachment}
      setAttachment={setAttachment}
      sending={sendMutation.isPending || sendAttachmentMutation.isPending}
      blocking={blockMutation.isPending}
      submitMessage={submitMessage}
      failedSend={failedSend}
      reportOpen={reportOpen}
      setReportOpen={setReportOpen}
      reportReason={reportReason}
      setReportReason={setReportReason}
      reportSubmitted={reportSubmitted}
      blockOpen={blockOpen}
      setBlockOpen={setBlockOpen}
      onReport={() => {
        if (!detail) return;
        void report({ data: { conversationId: detail.id, reason: reportReason } })
          .then(() => {
            setReportOpen(false);
            setReportSubmitted(true);
            toast.success("Conversation reported.");
          })
          .catch((error) =>
            toast.error(error instanceof Error ? error.message : "Could not report conversation."),
          );
      }}
      onBlock={() => {
        if (detail) blockMutation.mutate(detail.id);
      }}
      onError={(error) => toast.error(error)}
      browseAction={
        <Link to="/browse" className="text-[12px] font-semibold text-primary hover:underline">
          Browse listings
        </Link>
      }
    />
  );
}

function NotificationsSection({
  data,
}: {
  data?: { items: MemberNotification[]; unread: number };
}) {
  const queryClient = useQueryClient();
  const markRead = useServerFn(markNotificationsRead);
  const mutation = useMutation({
    mutationFn: (ids: string[] | null) => markRead({ data: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <NotificationsSectionView
      data={data}
      onMarkRead={(ids) => mutation.mutate(ids)}
      pending={mutation.isPending}
      error={mutation.error instanceof Error ? mutation.error.message : undefined}
    />
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
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancel({ data: { kind: "ask", id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["classified-browse"] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
      ]);
      toast.success(
        "Listing removed from public search. Existing messages and saved records remain available.",
      );
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
    <ListingsSectionView
      listings={listings}
      sellerExists={sellerSetup?.exists === true}
      link={WebsiteSellerListingLink}
      importSync={<ImportSyncPanel />}
      onTakeDown={(id) => cancelMutation.mutate(id)}
      onRelist={(id) => relistMutation.mutate(id)}
    />
  );
}
function WebsiteSellerListingLink(props: SellerListingLinkProps) {
  return <Link {...props} />;
}

function ReviewsSection({
  summary,
  sellerSetup,
}: {
  summary?: Awaited<ReturnType<typeof getSellerDashboardSummary>> | undefined;
  sellerSetup?: Awaited<ReturnType<typeof getSellerSetup>> | undefined;
}) {
  async function shareReviewLink() {
    if (!sellerSetup?.slug) {
      toast.info("Complete seller setup before sharing your review link.");
      return;
    }
    const url = `${window.location.origin}/sellers/${sellerSetup.slug}?review=1`;
    try {
      if (navigator.share)
        try {
          await navigator.share({ title: "Review my Bluebird seller profile", url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Review link copied as a fallback.");
      } catch {
        toast.info(`Copy this review link: ${url}`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share the review link.");
    }
  }

  return (
    <ReviewsSectionView
      rating={summary?.ratingAverage}
      reviews={summary?.reviews ?? []}
      sellerSlug={sellerSetup?.slug}
      onShareReviewLink={shareReviewLink}
      link={WebsiteAccountLink}
    />
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
  if (!sellerSetup?.exists) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Billing"
          title="Seller billing"
          body="Billing is available after you create your Bluebird seller profile. Buyer payment methods are not needed for this marketplace phase."
        />
        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-sm">
          <p className="text-[14px] font-semibold">Start selling before purchasing upgrades</p>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted-foreground">
            Your base listings are free. Once your seller profile is ready, this area will show
            listing promotion options and receipts.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            Set up seller profile
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Billing"
        title="Boost or feature a listing"
        body="Every listing is free to post. Boosted and Featured are the only paid options, and both are completely optional."
      />
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <CreditCard size={22} className="mt-0.5 text-primary" />
          <div>
            <h3 className="text-[15px] font-bold">Choose extra visibility</h3>
            <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted-foreground">
              Boost moves a listing back to the top of relevant results. Featured pins it above
              standard results for one full day. Card details never touch Bluebird.
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
            <label className="block rounded-xl border border-input bg-background px-3 py-2.5 text-[12px] font-medium">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Listing
              </span>
              <select
                value={listingId}
                onChange={(event) => setListingId(event.target.value)}
                className="mt-1 h-8 w-full rounded-lg bg-transparent text-[13px] outline-none focus:ring-2 focus:ring-ring/30"
              >
                {eligibleListings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block rounded-xl border border-input bg-background px-3 py-2.5 text-[12px] font-medium">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Upgrade
              </span>
              <select
                value={upgradeCode}
                onChange={(event) => setUpgradeCode(event.target.value)}
                className="mt-1 h-8 w-full rounded-lg bg-transparent text-[13px] outline-none focus:ring-2 focus:ring-ring/30"
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
              {checkout.isPending ? "Opening secure checkout…" : "Upgrade your listing now"}
            </button>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-secondary/45 p-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Secure checkout is handled by Stripe. You do not need to connect a Stripe seller account
            to purchase a listing upgrade.
          </p>
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

function WebsiteAccountLink({ href, ...props }: AccountLinkProps) {
  return <Link to={href} {...props} />;
}

function SavedSearchBrowseLink({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link to="/browse" className={className}>
      {children}
    </Link>
  );
}
