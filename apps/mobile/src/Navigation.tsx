import { List, X, House, MagnifyingGlass, Tag } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import {
  HeaderAccountMenuView,
  type HeaderAccountIdentity,
  type HeaderAccountLinkProps,
} from "../../../src/components/layout/HeaderAccountMenuView";
import {
  MarketplaceMobileMenu,
  type MarketplaceMenuLinkProps,
} from "../../../src/components/layout/MarketplaceMobileMenu";
import {
  MobileNavigationFrame,
  mobileTabBaseClass,
  type MobileTabLinkProps,
} from "../../../src/components/layout/MobileTabBarView";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
import { mobilePrimaryCategories } from "../../../src/config/mobile-navigation";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract";
import { useNativeNotifications } from "./Notifications";
import { browseDestination } from "./browse-state";
import { apiOrigin } from "./client";

export function NativeNavigation({
  path,
  signedIn,
  owner,
  account,
  onSignOut,
  signOutBusy,
  onNavigate,
  onPrivacy,
  renderLink: RenderLink,
}: {
  path: string;
  signedIn: boolean;
  owner?: string;
  account?: HeaderAccountIdentity | null;
  onSignOut: () => void | Promise<void>;
  signOutBusy: boolean;
  onNavigate: (path: string) => void;
  onPrivacy: () => void;
  renderLink: ComponentType<MobileTabLinkProps>;
}) {
  const notifications = useNativeNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    setMenuOpen(false);
  }, [path, owner]);
  useLayoutEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const property = "--bluebird-native-navigation-height";
    const measure = () => {
      document.documentElement.style.setProperty(
        property,
        `${window.innerHeight - nav.getBoundingClientRect().top}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty(property);
    };
  }, []);
  return (
    <MobileNavigationFrame floating navigationRef={navigation}>
      <RenderLink
        to="/"
        className={`${mobileTabBaseClass} rounded-full text-[10.5px] ${path === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <House size={24} weight={path === "/" ? "fill" : "regular"} aria-hidden="true" />
        Home
      </RenderLink>
      <HeaderAccountMenuView
        placement="bottom"
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
        renderLink={NativeAccountLink}
      />
      <RenderLink
        to="/browse"
        className={`${mobileTabBaseClass} rounded-full text-[10.5px] ${path === "/search" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <MagnifyingGlass size={24} aria-hidden="true" />
        Search
      </RenderLink>
      <RenderLink
        to="/create-listing"
        className={`${mobileTabBaseClass} rounded-full text-[10.5px] ${path === "/post" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        <Tag size={24} aria-hidden="true" />
        Sell
      </RenderLink>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={menuOpen ? "Close categories" : "Open categories"}
            aria-controls="marketplace-menu"
            className={`${mobileTabBaseClass} rounded-full text-[10.5px] ${menuOpen ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <List size={22} aria-hidden="true" />}
            <span>Categories</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Marketplace categories"
          className="max-h-[calc(100dvh-var(--bluebird-native-navigation-height,68px)-env(safe-area-inset-top)-1rem)] w-[min(640px,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl p-0"
        >
          <MarketplaceMobileMenu
            alwaysVisible
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
        </PopoverContent>
      </Popover>
    </MobileNavigationFrame>
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
    <a href={`#${destination}`} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
function NativeAccountLink({ href, ...props }: HeaderAccountLinkProps) {
  return <a href={`#${href}`} {...props} />;
}
