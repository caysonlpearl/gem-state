import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ComponentType } from "react";
import {
  Bell,
  BookmarkSimple,
  ChatCircle,
  SignOut,
  Storefront,
  UserCircle,
} from "@phosphor-icons/react";
export type HeaderAccountIdentity = {
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};
export type HeaderAccountLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type HeaderAccountDestinations = {
  account: string;
  selling: string | null;
  saved: string;
  messages: string;
  notifications: string | null;
  settings: string;
};
export function HeaderAccountMenuView({
  isSignedIn,
  identity,
  account,
  pathname,
  onSignIn,
  onSignOut,
  signOutBusy = false,
  unreadMessages = 0,
  unreadNotifications = 0,
  destinations,
  renderLink: MenuLink,
}: {
  isSignedIn: boolean;
  identity?: string;
  account?: HeaderAccountIdentity | null;
  pathname: string;
  onSignIn: () => void;
  onSignOut: () => void | Promise<void>;
  signOutBusy?: boolean;
  unreadMessages?: number;
  unreadNotifications?: number;
  destinations?: Partial<HeaderAccountDestinations>;
  renderLink: ComponentType<HeaderAccountLinkProps>;
}) {
  const links = {
    account: "/account",
    selling: "/account?section=listings",
    saved: "/account?section=saved",
    messages: "/account?section=messages",
    notifications: "/account?section=notifications",
    settings: "/account?section=overview",
    ...destinations,
  };
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null),
    accountMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname, identity]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (accountMenuRef.current?.contains(target) || accountButtonRef.current?.contains(target))
        return;
      setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [accountMenuOpen]);

  return (
    <div className="relative z-50">
      <button
        ref={accountButtonRef}
        type="button"
        onClick={() => {
          if (!isSignedIn) {
            onSignIn();
            return;
          }
          setAccountMenuOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (isSignedIn && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setAccountMenuOpen(true);
            requestAnimationFrame(() => {
              const entries = accountMenuRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not([disabled])',
              );
              const target =
                event.key === "ArrowUp"
                  ? entries?.item((entries?.length ?? 1) - 1)
                  : entries?.item(0);
              target?.focus();
            });
          }
        }}
        aria-expanded={isSignedIn ? accountMenuOpen : undefined}
        aria-haspopup={isSignedIn ? "menu" : undefined}
        aria-label={isSignedIn ? "Account" : "Sign in"}
        className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-foreground text-[12px] font-medium transition-colors hover:bg-foreground hover:text-background sm:w-auto sm:px-4 sm:text-[12.5px]"
      >
        <UserCircle size={20} aria-hidden="true" />
        <span className="hidden sm:inline">{isSignedIn ? "Account" : "Sign in"}</span>
      </button>
      {isSignedIn && accountMenuOpen && (
        <div
          ref={accountMenuRef}
          role="menu"
          data-state="open"
          aria-label="Account menu"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const entries = Array.from(
              accountMenuRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not([disabled])',
              ) ?? [],
            );
            const at = entries.indexOf(document.activeElement as HTMLElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? entries.length - 1
                  : event.key === "ArrowDown"
                    ? (at + 1) % entries.length
                    : (at - 1 + entries.length) % entries.length;
            entries[next]?.focus();
          }}
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[244px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <MenuLink
            href={links.account}
            role="menuitem"
            onClick={() => setAccountMenuOpen(false)}
            className="hairline-b block px-3.5 pb-3 pt-3 transition-colors hover:bg-secondary/60"
          >
            <span className="flex items-center gap-3">
              {account?.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <UserCircle
                  size={36}
                  weight="duotone"
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                />
              )}
              <span className="min-w-0">
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Signed in as
                </span>
                <span className="mt-0.5 block truncate text-[13px] font-semibold leading-tight text-foreground">
                  {account?.displayName ?? account?.email ?? "Your account"}
                </span>
                {account?.displayName && account?.email && (
                  <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-muted-foreground">
                    {account.email}
                  </span>
                )}
              </span>
            </span>
          </MenuLink>

          <div className="p-1.5">
            <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Marketplace
            </p>
            {links.selling && (
              <MenuLink
                href={links.selling!}
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
              >
                <Storefront size={17} weight="duotone" aria-hidden="true" />
                Selling
              </MenuLink>
            )}
            <MenuLink
              href={links.saved}
              role="menuitem"
              onClick={() => setAccountMenuOpen(false)}
              className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
            >
              <BookmarkSimple size={17} weight="duotone" aria-hidden="true" />
              Saved
            </MenuLink>
            <MenuLink
              href={links.messages}
              role="menuitem"
              onClick={() => setAccountMenuOpen(false)}
              className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
            >
              <ChatCircle size={17} weight="duotone" aria-hidden="true" />
              Messages
              {unreadMessages > 0 && <UnreadBadge count={unreadMessages} />}
            </MenuLink>
            {links.notifications && (
              <MenuLink
                href={links.notifications!}
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
              >
                <Bell size={17} weight="duotone" aria-hidden="true" />
                Notifications
                {unreadNotifications > 0 && <UnreadBadge count={unreadNotifications} />}
              </MenuLink>
            )}
          </div>

          <div className="hairline-t p-1.5">
            <MenuLink
              href={links.settings}
              role="menuitem"
              onClick={() => setAccountMenuOpen(false)}
              className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
            >
              <UserCircle size={17} weight="duotone" aria-hidden="true" />
              Account settings
            </MenuLink>
          </div>

          <div className="hairline-t p-1.5 pb-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false);
                void onSignOut();
              }}
              disabled={signOutBusy}
              className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
            >
              <SignOut size={17} weight="duotone" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
/** Small count pill beside Messages and Notifications in the account menu,
 * matching the header bell's badge styling. */
function UnreadBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} unread`}
      className="numeric ml-auto inline-flex min-w-[17px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[16px] text-primary-foreground"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
