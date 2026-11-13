import type { ReactNode, Dispatch, SetStateAction } from "react";
import { UserCircle, LockKey, ShieldCheck } from "@phosphor-icons/react";
import type { MyAccount } from "@/lib/account.functions";
import type { ContactPreferences, NotificationPreferences } from "@/lib/account-center.functions";
import { AccountSectionHeader as SectionHeader } from "./AccountSectionView";
import { SettingsBlock, SettingLine, PreferenceCard } from "./AccountViewParts";
export function AccountSettingsView({
  account,
  contact,
  setContact,
  notifications,
  setNotifications,
  saveContact,
  saveNotifications,
  requestPasswordReset,
  signOutAll,
  shoppingAlerts,
  deletionControls,
  nativeControls,
  showBillingPreferences = true,
}: {
  account: MyAccount;
  contact: ContactPreferences;
  setContact: Dispatch<SetStateAction<ContactPreferences>>;
  notifications: NotificationPreferences;
  setNotifications: Dispatch<SetStateAction<NotificationPreferences>>;
  saveContact: { isPending: boolean; mutate: () => void };
  saveNotifications: { isPending: boolean; mutate: () => void };
  requestPasswordReset: () => void | Promise<void>;
  signOutAll: () => void | Promise<void>;
  shoppingAlerts: ReactNode;
  deletionControls: ReactNode;
  nativeControls?: ReactNode;
  showBillingPreferences?: boolean;
}) {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Account settings"
        title="Control your account"
        body="Manage your sign-in, contact visibility, and the updates Bluebird sends you."
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
          <SettingLine label="Password" value="Protected">
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
          />
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
            onClick={() => void signOutAll()}
            className="mt-3 text-[12px] font-semibold text-primary hover:underline"
          >
            Sign out of all devices
          </button>
        </SettingsBlock>
        <SettingsBlock icon={ShieldCheck} title="Account deletion">
          {deletionControls}
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
              label: "Allow Bluebird messages",
              value: contact.allowInternalMessages,
            },
          ]}
          onChange={(key, value) => setContact((current) => ({ ...current, [key]: value }))}
          onSave={() => saveContact.mutate()}
          saving={saveContact.isPending}
        />
        {shoppingAlerts}
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
              label: "Bluebird product updates",
              value: notifications.productUpdates,
            },
            {
              key: "marketingEmail",
              label: "Marketing email",
              value: notifications.marketingEmail,
            },
          ].filter((row) => showBillingPreferences || row.key !== "listingUpgradeReceipts")}
          onChange={(key, value) => setNotifications((current) => ({ ...current, [key]: value }))}
          onSave={() => saveNotifications.mutate()}
          saving={saveNotifications.isPending}
        />
      </div>
      {nativeControls}
    </div>
  );
}
