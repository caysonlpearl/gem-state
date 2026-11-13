import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./client";
import { installIdentifier } from "./identity";
import { isShoppingForeground } from "./shopping-activity";
import {
  NotificationsSectionView,
  type NotificationLinkProps,
} from "../../../src/components/account/NotificationsSectionView";
import {
  NotificationBellView,
  type NotificationBellLinkProps,
} from "../../../src/components/layout/NotificationBellView";
import type { NotificationInbox } from "../../../src/lib/notification-model";
type Inbox = NotificationInbox & { ownerId: string; unreadMessages: number };
type State = {
  data: Inbox | null;
  ready: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  readError: string;
  failedRead: boolean;
  refresh: () => Promise<void>;
  markRead: (ids: string[] | null) => Promise<void>;
  retryRead: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function useNativeNotifications() {
  const value = useContext(Context);
  if (!value) throw Error("Missing notification state");
  return value;
}
export function NativeNotificationsProvider({
  owner,
  ready,
  revision,
  children,
}: {
  owner?: string;
  ready: boolean;
  revision: number;
  children: ReactNode;
}) {
  const [data, setData] = useState<Inbox | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [readError, setReadError] = useState(""),
    [failedRead, setFailedRead] = useState(false);
  const alive = useRef(true),
    read = useRef<{ generation: number; controller: AbortController } | null>(null),
    generation = useRef(0),
    write = useRef(false),
    retryIds = useRef<string[] | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      read.current?.controller.abort();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (
      !owner ||
      !ready ||
      read.current ||
      write.current ||
      document.visibilityState !== "visible" ||
      !isShoppingForeground()
    )
      return;
    const request = { generation: ++generation.current, controller: new AbortController() };
    read.current = request;
    const install = installIdentifier();
    setLoading(true);
    setError("");
    try {
      const next = await api<Inbox>("notifications", "GET", undefined, request.controller.signal, {
        userId: owner,
        installId: install,
      });
      if (
        !alive.current ||
        request.controller.signal.aborted ||
        generation.current !== request.generation ||
        installIdentifier() !== install
      )
        return;
      if (next.ownerId !== owner) throw Error("Your account changed. Please sign in again.");
      setData(next);
      if (
        retryIds.current &&
        !next.items.some((n) => retryIds.current!.includes(n.id) && !n.readAt)
      ) {
        retryIds.current = null;
        setFailedRead(false);
        setReadError("");
      }
    } catch (e) {
      if (
        alive.current &&
        !request.controller.signal.aborted &&
        generation.current === request.generation
      )
        setError(e instanceof Error ? e.message : "Your notifications could not be loaded.");
    } finally {
      if (read.current === request) {
        read.current = null;
        if (alive.current) setLoading(false);
      }
    }
  }, [owner, ready]);
  useEffect(() => {
    void refresh();
    const poll = () => void refresh();
    const invalidate = () => {
      generation.current++;
      read.current?.controller.abort();
      read.current = null;
      void refresh();
    };
    const timer = setInterval(poll, 60000);
    document.addEventListener("bluebird-inbox-changed", invalidate);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    document.addEventListener("bluebird-visibility-change", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("bluebird-inbox-changed", invalidate);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
      document.removeEventListener("bluebird-visibility-change", poll);
    };
  }, [refresh, revision]);
  async function send(ids: string[]) {
    if (!owner || !ready || write.current) return;
    write.current = true;
    const install = installIdentifier();
    generation.current++;
    read.current?.controller.abort();
    read.current = null;
    setLoading(false);
    setBusy(true);
    setReadError("");
    try {
      await api("notifications/read", "PUT", { ids }, undefined, {
        userId: owner,
        installId: install,
      });
      if (!alive.current || installIdentifier() !== install) return;
      retryIds.current = null;
      setFailedRead(false);
    } catch (e) {
      if (alive.current && installIdentifier() === install) {
        retryIds.current = ids;
        setFailedRead(true);
        setReadError(e instanceof Error ? e.message : "The read status could not be confirmed.");
      }
    } finally {
      write.current = false;
      if (alive.current && installIdentifier() === install) {
        setBusy(false);
        if (!retryIds.current) void refresh();
      }
    }
  }
  async function markRead(ids: string[] | null) {
    if (retryIds.current) {
      setReadError("Confirm the previous read status before marking more notifications.");
      return;
    }
    const requested = ids && new Set(ids),
      snapshot =
        data?.items
          .filter((n) => !n.readAt && (!requested || requested.has(n.id)))
          .map((n) => n.id) ?? [];
    if (snapshot.length) await send(snapshot);
  }
  return (
    <Context.Provider
      value={{
        data,
        ready,
        loading,
        busy,
        error,
        readError,
        failedRead,
        refresh,
        markRead,
        retryRead: async () => {
          if (retryIds.current) await send([...retryIds.current]);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
function NativeNotificationLink({ href, ...props }: NotificationLinkProps) {
  return <a href={`#${href}`} {...props} />;
}
function AllLink(props: NotificationBellLinkProps) {
  return <a href="#/account/notifications" {...props} />;
}
function NoOrderLink({ children }: NotificationBellLinkProps & { orderId: string }) {
  return <span>{children}</span>;
}
export function NativeNotificationBell({ path }: { path: string }) {
  const n = useNativeNotifications();
  if (!n.ready) return null;
  return (
    <NotificationBellView
      pathname={path}
      emptyDescription="No notifications yet. Messages, listing activity and shopping updates appear here."
      data={n.data ?? undefined}
      isLoading={n.loading && !n.data}
      error={n.error || n.readError || undefined}
      pending={n.busy || n.failedRead}
      retryAction={
        n.failedRead ? (
          <button className="underline" disabled={n.busy} onClick={() => void n.retryRead()}>
            Retry marking read
          </button>
        ) : undefined
      }
      onMarkRead={n.markRead}
      renderAllLink={AllLink}
      renderOrderLink={NoOrderLink}
    />
  );
}
export function NativeNotifications() {
  const n = useNativeNotifications();
  if (!n.ready)
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        Notifications are temporarily unavailable. Please retry shortly.
        <button className="ml-3 underline" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    );
  return (
    <>
      {n.error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-card p-4 text-sm"
        >
          {n.error}
          <button className="ml-3 underline" disabled={n.loading} onClick={() => void n.refresh()}>
            Retry notifications
          </button>
        </div>
      )}
      {n.readError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-card p-4 text-sm"
        >
          {n.readError}
          {n.failedRead && (
            <button className="ml-3 underline" disabled={n.busy} onClick={() => void n.retryRead()}>
              Retry marking read
            </button>
          )}
        </div>
      )}
      {!n.data ? (
        n.loading && <p role="status">Loading your notifications…</p>
      ) : (
        <NotificationsSectionView
          data={n.data}
          pending={n.busy || n.failedRead}
          onMarkRead={n.markRead}
          renderLink={NativeNotificationLink}
          description="Listing updates, messages, saved-search matches, and reviews will appear here."
        />
      )}
    </>
  );
}
