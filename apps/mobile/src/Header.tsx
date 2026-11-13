import { ArrowLeft, List, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "../../../src/components/layout/BrandMark";
import {
  HeaderAccountMenuView,
  type HeaderAccountIdentity,
  type HeaderAccountLinkProps,
} from "../../../src/components/layout/HeaderAccountMenuView";
import {
  MarketplaceMobileMenu,
  type MarketplaceMenuLinkProps,
} from "../../../src/components/layout/MarketplaceMobileMenu";
import { SiteHeaderBar } from "../../../src/components/layout/SiteHeaderBar";
import { mobilePrimaryCategories } from "../../../src/config/mobile-navigation";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract";
import { NativeNotificationBell, useNativeNotifications } from "./Notifications";
import { browseDestination } from "./browse-state";
import { apiOrigin } from "./client";
import { backWithinApp } from "./native-navigation";

export function NativeHeader({
  path,
  signedIn,
  onNavigate,
  onPrivacy,
  owner,
  account,
  onSignOut,
  signOutBusy = false,
}: {
  path: string;
  signedIn: boolean;
  onNavigate: (path: string) => void;
  onPrivacy: () => void;
  owner?: string;
  account?: HeaderAccountIdentity | null;
  onSignOut: () => void | Promise<void>;
  signOutBusy?: boolean;
}) {
  const notifications = useNativeNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  return (
    <header className="sticky top-0 z-40 overflow-visible border-0 bg-card/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main-content");
          main?.focus({ preventScroll: true });
          main?.scrollIntoView({ block: "start" });
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <SiteHeaderBar>
        <a
          href="#/"
          className="flex min-w-0 shrink-0 items-center pr-1 sm:pr-2"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("/");
          }}
        >
          <BrandMark className="hidden sm:inline-flex" />
          <BrandMark compact mobile className="sm:hidden" />
        </a>
        <div />
        <nav
          aria-label="Account and utilities"
          className="flex min-w-0 shrink-0 items-center justify-end gap-1.5"
        >
          {(path.startsWith("/listings/") ||
            path.startsWith("/messages/") ||
            path.startsWith("/sellers/") ||
            path.startsWith("/dealers/")) && (
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border"
              aria-label="Go back"
              onClick={() => {
                if (!backWithinApp()) onNavigate("/");
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {signedIn && <NativeNotificationBell path={path} />}
          <button
            type="button"
            className="hidden min-h-11 items-center rounded-full border border-border px-3 text-[12px] font-medium lg:inline-flex"
            aria-haspopup="dialog"
            onClick={onPrivacy}
          >
            Privacy choices
          </button>
          <HeaderAccountMenuView
            isSignedIn={signedIn}
            identity={owner}
            account={account}
            pathname={path}
            onSignIn={() => onNavigate("/account")}
            onSignOut={onSignOut}
            signOutBusy={signOutBusy}
            unreadMessages={notifications.data?.unreadMessages ?? 0}
            unreadNotifications={notifications.data?.unread ?? 0}
            destinations={{
              account: "/account/profile",
              selling: null,
              saved: "/saved",
              messages: "/messages",
              notifications: notifications.ready ? "/account/notifications" : null,
              settings: "/account/settings",
            }}
            renderLink={NativeHeaderAccountLink}
          />
          <button
            ref={menuButton}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="marketplace-menu"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-blue bg-brand-blue text-white shadow-sm transition-[background-color,box-shadow,transform] hover:bg-brand-blue/90 hover:shadow-md hover:-translate-y-0.5 sm:h-11 sm:w-11 lg:hidden"
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </SiteHeaderBar>
      {menuOpen && (
        <MarketplaceMobileMenu
          categories={mobilePrimaryCategories.filter((category) =>
            mobileCategoryAllowed(category.slug),
          )}
          isSignedIn={signedIn && notifications.ready}
          onClose={() => setMenuOpen(false)}
          renderLink={NativeMenuLink}
          privacyAction={
            <button
              type="button"
              className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
              onClick={() => {
                setMenuOpen(false);
                onPrivacy();
              }}
            >
              Privacy choices
            </button>
          }
        />
      )}
    </header>
  );
}
function NativeMenuLink({ to, search, onClick, className, children }: MarketplaceMenuLinkProps) {
  if (to === "/policies")
    return (
      <a
        href={`${apiOrigin}/policies`}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={onClick}
      >
        {children}
      </a>
    );
  const destination =
    to === "/create-listing"
      ? "/post"
      : to === "/notifications"
        ? "/account/notifications"
        : browseDestination(search ?? {});
  return (
    <a
      href={`#${destination}`}
      className={className}
      onClick={() => {
        onClick();
        // The hash transition remains normal browser history, including Back.
      }}
    >
      {children}
    </a>
  );
}

function NativeHeaderAccountLink({ href, ...props }: HeaderAccountLinkProps) {
  return <a href={`#${href}`} {...props} />;
}
