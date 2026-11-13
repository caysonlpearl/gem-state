import { NativeSavedSearches } from "./SavedSearches";
import { saveProfileAvatar } from "./account-media";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { api, auth } from "./client";
import { installIdentifier } from "./identity";
import { AccountLayoutView } from "../../../src/components/account/AccountLayoutView";
import {
  AccountProfileView,
  type AccountLinkProps,
} from "../../../src/components/account/AccountProfileView";
import { AccountSettingsView } from "../../../src/components/account/AccountSettingsView";
import { useAccountProfileDraft } from "../../../src/components/account/useAccountProfileDraft";
import { AccountAppControls } from "../../../src/components/account/AccountViewParts";
import { ShoppingAlertPreferenceView } from "../../../src/components/community/ShoppingAlertPreferenceView";
import { MOBILE_AUTH_REDIRECT } from "../../../src/lib/mobile-contract";
import type { MyAccount } from "../../../src/lib/account.functions";
import type { SellerSetup } from "../../../src/lib/seller.functions";
import type {
  ContactPreferences,
  NotificationPreferences,
} from "../../../src/lib/account-center.functions";

type AccountData = {
  account: MyAccount;
  consent: { terms_version: string; shopping_alerts: boolean };
};
type Loaded = {
  member: AccountData;
  contact: ContactPreferences;
  notifications: NotificationPreferences;
  seller: SellerSetup;
};
const text = (e: unknown) =>
  e instanceof Error ? e.message : "Your account could not be updated. Please retry.";
const sections = ["profile", "settings", "searches"] as const;
export function NativeAccount({
  ownerId,
  section,
  policyVersion,
  onNavigate,
  onSignOut,
  onChanged,
  permissions,
  signOutBusy = false,
  controlsReady,
}: {
  ownerId: string;
  section: "profile" | "settings" | "searches";
  policyVersion: string;
  onNavigate: (path: string) => void;
  onSignOut: (scope?: "local" | "global") => Promise<void>;
  onChanged: () => void;
  permissions?: ReactNode;
  signOutBusy?: boolean;
  controlsReady: boolean;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [data, setData] = useState<Loaded | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [version, setVersion] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    if (!controlsReady) {
      setError("Account controls are temporarily unavailable. Please retry shortly.");
      return;
    }
    const controller = new AbortController();
    setError("");
    const get = <T,>(path: string) => api<T>(path, "GET", undefined, controller.signal, actor);
    Promise.all([
      get<AccountData>("account"),
      get<ContactPreferences>("account/contact-preferences"),
      get<NotificationPreferences>("account/notification-preferences"),
      get<SellerSetup>("seller"),
    ])
      .then(([member, contact, notifications, seller]) => {
        if (member.account.userId !== ownerId)
          throw Error("Your account changed. Please sign in again.");
        setData({ member, contact, notifications, seller });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(text(e));
      });
    return () => controller.abort();
  }, [actor, version, ownerId, controlsReady]);
  const put = (path: string, payload: unknown) => api(path, "PUT", payload, undefined, actor);
  async function refreshAccount() {
    const member = await api<AccountData>("account", "GET", undefined, undefined, actor);
    if (member.account.userId !== ownerId) throw Error("Your account changed.");
    setData((current) => (current ? { ...current, member } : null));
    onChanged();
  }
  async function run(kind: string, work: () => Promise<void>, success?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      await work();
      if (success) setNotice(success);
    } catch (e) {
      setError(text(e));
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  const actions = {
    profile: (payload: unknown) =>
      run(
        "profile",
        async () => {
          await put("account/profile", payload);
          await refreshAccount();
        },
        "Profile saved.",
      ),
    contact: (payload: ContactPreferences) =>
      run(
        "contact",
        async () => {
          await put("account/contact-preferences", payload);
          const contact = await api<ContactPreferences>(
            "account/contact-preferences",
            "GET",
            undefined,
            undefined,
            actor,
          );
          setData((current) => (current ? { ...current, contact } : null));
        },
        "Contact preferences saved.",
      ),
    notifications: (payload: NotificationPreferences) =>
      run(
        "notifications",
        async () => {
          await put("account/notification-preferences", payload);
          const notifications = await api<NotificationPreferences>(
            "account/notification-preferences",
            "GET",
            undefined,
            undefined,
            actor,
          );
          setData((current) => (current ? { ...current, notifications } : null));
        },
        "Email preferences saved.",
      ),
    avatar: (file: File | null) =>
      run(
        "avatar",
        async () => {
          const result = await saveProfileAvatar(actor, file);
          setData((current) =>
            current
              ? {
                  ...current,
                  member: {
                    ...current.member,
                    account: { ...current.member.account, avatarUrl: result.avatarUrl },
                  },
                }
              : null,
          );
          onChanged();
        },
        file ? "Profile picture updated." : "Profile picture removed.",
      ),
    password: () =>
      run(
        "password",
        async () => {
          const current = (await auth.auth.getSession()).data.session;
          if (current?.user.id !== ownerId) throw Error("Your account changed. Please try again.");
          if (!data?.member.account.email)
            throw Error("There is no email address on this account.");
          const redirectTo = Capacitor.isNativePlatform()
            ? MOBILE_AUTH_REDIRECT
            : `${location.origin}/#/auth/callback`;
          const result = await auth.auth.resetPasswordForEmail(data.member.account.email, {
            redirectTo,
          });
          if (result.error) throw result.error;
        },
        "Password reset email sent.",
      ),
    alerts: (next: boolean) =>
      run(
        "alerts",
        async () => {
          const consent = (await put("consent", {
            acceptTerms: true,
            shoppingAlerts: next,
            version: policyVersion,
          })) as AccountData["consent"];
          setData((current) =>
            current ? { ...current, member: { ...current.member, consent } } : null,
          );
          onChanged();
        },
        "Shopping preference saved.",
      ),
    signOutAll: () =>
      run("signout", async () => {
        await onSignOut("global");
      }),
  };
  function AccountLink({ href, children, className }: AccountLinkProps) {
    return (
      <a
        href="#/post/profile"
        className={className}
        onClick={(e) => {
          e.preventDefault();
          if (href === "/seller-setup") onNavigate("/post/profile");
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <AccountLayoutView
      as="section"
      section={section}
      onSelect={(value) =>
        onNavigate(
          value === "settings"
            ? "/account/settings"
            : value === "searches"
              ? "/account/searches"
              : "/account/profile",
        )
      }
      onSignOut={() => void onSignOut()}
      availableSections={sections}
      signOutBusy={Boolean(busy) || signOutBusy}
    >
      {error && (
        <div
          className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          {error}
          {!data && (
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => (controlsReady ? setVersion((v) => v + 1) : location.reload())}
            >
              Retry
            </button>
          )}
          {!data && (
            <button
              type="button"
              className="ml-3 font-semibold underline"
              disabled={signOutBusy}
              onClick={() => void onSignOut()}
            >
              Sign out
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="mb-5 rounded-xl border border-border bg-card p-4 text-sm" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your account…
          </p>
        )
      ) : (
        <fieldset disabled={Boolean(busy) || signOutBusy} className="min-w-0 border-0 p-0">
          <legend className="sr-only">Account controls</legend>
          {section === "searches" ? (
            <NativeSavedSearches ownerId={ownerId} onNavigate={onNavigate} />
          ) : section === "profile" ? (
            <NativeProfile
              key="profile"
              data={data}
              actions={actions}
              busy={busy}
              link={AccountLink}
            />
          ) : (
            <NativeSettings
              key="settings"
              data={data}
              actions={actions}
              busy={busy}
              ownerId={ownerId}
              permissions={permissions}
              onSignOut={() => onSignOut()}
            />
          )}
        </fieldset>
      )}
    </AccountLayoutView>
  );
}
type Actions = {
  profile: (payload: unknown) => Promise<void>;
  contact: (payload: ContactPreferences) => Promise<void>;
  notifications: (payload: NotificationPreferences) => Promise<void>;
  avatar: (file: File | null) => Promise<void>;
  password: () => Promise<void>;
  alerts: (next: boolean) => Promise<void>;
  signOutAll: () => Promise<void>;
};
function NativeProfile({
  data,
  actions,
  busy,
  link,
}: {
  data: Loaded;
  actions: Actions;
  busy: string;
  link: React.ComponentType<AccountLinkProps>;
}) {
  const draft = useAccountProfileDraft(data.member.account, data.contact);
  return (
    <AccountProfileView
      account={data.member.account}
      sellerSetup={data.seller}
      draft={draft}
      link={link}
      publicProfileLink={false}
      profileMutation={{
        isPending: busy === "profile",
        mutate: () =>
          void actions.profile({
            displayName: draft.displayName,
            homeResortCode: draft.market,
            primaryIntent: draft.intent,
          }),
      }}
      contactMutation={{
        isPending: busy === "contact",
        mutate: () =>
          void actions.contact({
            allowEmail: draft.allowEmail,
            allowPhone: draft.allowPhone,
            allowText: draft.allowText,
            showContactButtons: draft.showButtons,
            allowInternalMessages: draft.allowInternalMessages,
          }),
      }}
      avatarBusy={busy === "avatar"}
      uploadAvatar={(file) => actions.avatar(file)}
      removeAvatar={{ isPending: busy === "avatar", mutate: () => void actions.avatar(null) }}
    />
  );
}
function NativeSettings({
  data,
  actions,
  busy,
  ownerId,
  permissions,
  onSignOut,
}: {
  data: Loaded;
  actions: Actions;
  busy: string;
  ownerId: string;
  permissions?: ReactNode;
  onSignOut: () => Promise<void>;
}) {
  const [contact, setContact] = useState(data.contact),
    [notifications, setNotifications] = useState(data.notifications);
  useEffect(() => setContact(data.contact), [data.contact]);
  useEffect(() => setNotifications(data.notifications), [data.notifications]);
  return (
    <AccountSettingsView
      account={data.member.account}
      contact={contact}
      setContact={setContact}
      notifications={notifications}
      setNotifications={setNotifications}
      saveContact={{ isPending: busy === "contact", mutate: () => void actions.contact(contact) }}
      saveNotifications={{
        isPending: busy === "notifications",
        mutate: () => void actions.notifications(notifications),
      }}
      requestPasswordReset={actions.password}
      signOutAll={actions.signOutAll}
      shoppingAlerts={
        <ShoppingAlertPreferenceView
          enabled={data.member.consent.shopping_alerts}
          busy={busy === "alerts"}
          onChange={actions.alerts}
        />
      }
      deletionControls={<DeleteAccount ownerId={ownerId} />}
      nativeControls={
        <AccountAppControls>
          {permissions}
          <button
            type="button"
            className="mt-5 text-[12px] font-semibold text-primary hover:underline"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </AccountAppControls>
      }
      showBillingPreferences={false}
    />
  );
}
function DeleteAccount({ ownerId }: { ownerId: string }) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [requested, setRequested] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    api<{ status: string } | null>("account/deletion", "GET", undefined, controller.signal, actor)
      .then((value) => {
        setRequested(Boolean(value));
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(text(e));
      });
    return () => controller.abort();
  }, [actor, version]);
  return (
    <div className="space-y-3 text-[12px]">
      {error && <p role="alert">{error}</p>}
      {!ready ? (
        <>
          <p>Checking deletion status…</p>
          {error && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setVersion((v) => v + 1);
              }}
            >
              Retry
            </button>
          )}
        </>
      ) : requested ? (
        <p role="status">
          Your deletion request has been received. Bluebird will confirm completion.
        </p>
      ) : !open ? (
        <button
          type="button"
          className="font-semibold text-destructive hover:underline"
          onClick={() => setOpen(true)}
        >
          Delete account
        </button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              await api("account/deletion", "POST", { confirm: confirmation }, undefined, actor);
              setRequested(true);
            } catch (e) {
              setError(text(e));
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <p>
            This requests removal of your account and associated personal data. Records required for
            legal obligations or disputes may be retained as explained in the privacy policy.
          </p>
          <label className="block">
            Type DELETE to confirm
            <input
              className="mt-2 block h-11 w-full rounded-xl border border-input bg-background px-3"
              required
              pattern="DELETE"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button disabled={busy} className="mr-4 font-semibold text-destructive">
            {busy ? "Requesting…" : "Request account deletion"}
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
