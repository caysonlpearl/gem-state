import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Bell } from "@phosphor-icons/react";
import type { NotificationInbox } from "@/lib/notification-model";
export type NotificationBellLinkProps = {
  className: string;
  onClick: () => void;
  children: ReactNode;
};
const PREVIEW_COUNT = 5;

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBellView({
  data,
  isLoading = false,
  hydrated = true,
  pathname,
  onMarkRead,
  pending = false,
  error,
  retryAction,
  emptyDescription = "No notifications yet. Order, offer, shipment and review updates appear here.",
  renderAllLink: AllLink,
  renderOrderLink: OrderLink,
}: {
  data?: NotificationInbox;
  isLoading?: boolean;
  hydrated?: boolean;
  pathname: string;
  onMarkRead: (ids: string[] | null) => void | Promise<void>;
  pending?: boolean;
  error?: string;
  retryAction?: ReactNode;
  emptyDescription?: string;
  renderAllLink: ComponentType<NotificationBellLinkProps>;
  renderOrderLink: ComponentType<NotificationBellLinkProps & { orderId: string }>;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;
  const preview = items.slice(0, PREVIEW_COUNT);

  // Close on route change so the panel never lingers over a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes and returns focus to the trigger; outside clicks close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the panel marks the shown items as read so the badge clears the
    // way members expect.
    if (next) {
      const unreadShown = preview.filter((i) => !i.readAt).map((i) => i.id);
      if (unreadShown.length > 0) void onMarkRead(unreadShown);
    }
  }

  return (
    <div className="relative hidden md:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={hydrated && unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
      >
        <Bell size={17} aria-hidden="true" />
        {hydrated && unread > 0 && (
          <span
            aria-hidden="true"
            className="numeric absolute right-1.5 top-1.5 inline-flex min-w-[17px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[16px] text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          data-state="open"
          aria-label="Recent notifications"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[340px] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        >
          <div className="hairline-b flex items-center justify-between gap-3 px-3.5 py-2.5">
            <p className="text-[12.5px] font-semibold tracking-tight">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void onMarkRead(null)}
                disabled={pending}
                className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="px-3.5 py-3 text-[12px] text-destructive">
              {error} {retryAction}
            </p>
          )}
          {isLoading && <p className="px-3.5 py-4 text-[12.5px] text-muted-foreground">Loading…</p>}

          {!error && !isLoading && preview.length === 0 && (
            <p className="px-3.5 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
              {emptyDescription}
            </p>
          )}

          {preview.length > 0 && (
            <ul className="max-h-[340px] overflow-y-auto">
              {preview.map((item) => {
                const body = (
                  <>
                    <p className="flex items-start gap-1.5 text-[12.5px] font-medium leading-snug">
                      {!item.readAt && (
                        <span
                          aria-hidden="true"
                          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span className="min-w-0 break-words">{item.title}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 break-words text-[12px] leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                    <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                      {relativeTime(item.createdAt)}
                    </p>
                  </>
                );
                return (
                  <li key={item.id} className="hairline-b last:border-b-0">
                    {item.orderId ? (
                      <OrderLink
                        orderId={item.orderId}
                        onClick={() => setOpen(false)}
                        className="block px-3.5 py-2.5 transition-colors hover:bg-secondary/60"
                      >
                        {body}
                      </OrderLink>
                    ) : (
                      <div className="px-3.5 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="hairline-t px-3.5 py-2.5">
            <AllLink
              onClick={() => setOpen(false)}
              className="flex h-9 items-center justify-center rounded-md border border-input text-[12.5px] font-medium transition-colors hover:bg-secondary"
            >
              See all notifications
            </AllLink>
          </div>
        </div>
      )}
    </div>
  );
}
