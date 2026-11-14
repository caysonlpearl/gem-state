import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AccountOverviewView } from "../../../src/components/account/AccountOverviewView";
import type { AccountLinkProps } from "../../../src/components/account/AccountProfileView";
import type { AccountSection } from "../../../src/components/account/account-sections";
import type { MyAccount } from "../../../src/lib/account.functions";
import type { SellerSetup } from "../../../src/lib/seller.functions";
import type { MobileAccountOverview } from "../../../src/lib/mobile-account-overview.server";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { useNativeNotifications } from "./Notifications";

type Loaded = {
  account: MyAccount;
  seller: SellerSetup;
  stats: MobileAccountOverview;
  savedSearchCount: number;
};
export function NativeAccountOverview({
  ownerId,
  onSelect,
  link,
}: {
  ownerId: string;
  onSelect: (section: AccountSection) => void;
  link: ComponentType<AccountLinkProps>;
}) {
  const actor = useMemo(() => ({ userId: ownerId, installId: installIdentifier() }), [ownerId]);
  const inbox = useNativeNotifications();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null);
    setError("");
    const get = <T,>(path: string) => api<T>(path, "GET", undefined, controller.signal, actor);
    Promise.all([
      get<{ account: MyAccount }>("account"),
      get<SellerSetup>("seller"),
      get<MobileAccountOverview>("account/overview"),
      get<{ items: unknown[] }>("saved-searches"),
    ])
      .then(([member, seller, stats, searches]) => {
        if (controller.signal.aborted || installIdentifier() !== actor.installId) return;
        if (member.account.userId !== ownerId || stats.ownerId !== ownerId)
          throw Error("Your account changed. Please sign in again.");
        setLoaded({
          account: member.account,
          seller,
          stats,
          savedSearchCount: searches.items.length,
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted && installIdentifier() === actor.installId)
          setError(
            e instanceof Error
              ? e.message
              : "Your account overview could not be loaded. Please retry.",
          );
      });
    return () => controller.abort();
  }, [actor, ownerId, version]);
  if (error)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      >
        {error}
        <button
          type="button"
          className="ml-3 min-h-11 font-semibold underline"
          onClick={() => setVersion((v) => v + 1)}
        >
          Retry overview
        </button>
      </div>
    );
  if (!loaded)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your account overview…
      </p>
    );
  const activity = inbox.data?.ownerId === ownerId ? inbox.data : null;
  return (
    <AccountOverviewView
      account={loaded.account}
      watchlistCount={loaded.stats.watchlistCount}
      savedSearchCount={loaded.savedSearchCount}
      unreadMessages={activity?.unreadMessages ?? null}
      unreadNotifications={activity?.unread ?? null}
      activeListings={loaded.stats.activeListings}
      pendingListings={loaded.stats.pendingListings}
      completedSalesCount={loaded.stats.completedSalesCount}
      sellerExists={loaded.seller.exists}
      notifications={activity?.items ?? []}
      activityStatus={inbox.error ? "error" : activity ? "ready" : "loading"}
      onRetryActivity={() => void inbox.refresh()}
      onSelect={onSelect}
      link={link}
      billingAvailable={false}
    />
  );
}
