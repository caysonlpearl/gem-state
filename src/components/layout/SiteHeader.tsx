import { websiteAccountSignOut } from "@/lib/account-session";
import { List, MagnifyingGlass, PlusCircle, X } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AccountSection } from "../account/account-sections";
import { HeaderAccountMenuView, type HeaderAccountLinkProps } from "./HeaderAccountMenuView";
import { MarketplaceMobileMenu, type MarketplaceMenuLinkProps } from "./MarketplaceMobileMenu";
import { SiteHeaderBar } from "./SiteHeaderBar";

import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { BrandMark } from "@/components/layout/BrandMark";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { useHydrated } from "@/hooks/useHydrated";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { getMyAccount } from "@/lib/account.functions";
import { getMyConversations } from "@/lib/conversation.functions";
import { getMyNotifications } from "@/lib/notifications.functions";

/*
 * Two-level classifieds header.
 *
 * Level 1: brand mark, keyword search, post-a-listing, account and utilities.
 * Level 2: a small set of featured categories, with the complete taxonomy
 *          available through the Classifieds popover.
 *
 * Header links are never styled by active state, so the server-rendered markup
 * and the hydrated markup stay identical even when the router resolves a
 * redirect after the SSR pass.
 */
const navLinkClass =
  "inline-flex h-[96px] w-auto min-w-[164px] shrink-0 flex-row items-center justify-start gap-3 rounded-2xl px-4 text-left text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground transition-[background-color,color,box-shadow] hover:bg-brand-blue/10 hover:text-primary hover:shadow-md";

const utilityLinkClass =
  "hidden h-9 items-center px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-primary md:inline-flex";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

// "Vehicles" covers the whole motors group (cars, trucks, motorcycles, RVs,
// powersports, trailers), so the pill links by group instead of one category.
const featuredHeaderCategories = [
  { slug: "cars-trucks", name: "Vehicles", group: "motors" },
  { slug: "other-real-estate", name: "Homes" },
  { slug: "jobs", name: "Jobs" },
  { slug: "services", name: "Services" },
] as const;

export function SiteHeader() {
  const { isSignedIn, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutInFlight = useRef(false);
  const hydrated = useHydrated();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const fetchAccount = useServerFn(getMyAccount);
  const fetchNotifications = useServerFn(getMyNotifications);
  const fetchConversations = useServerFn(getMyConversations);

  // Shared query keys with the account center and the notification bell, so a
  // badge read here always agrees with those surfaces.
  const account = useQuery({
    queryKey: ["my-account"],
    queryFn: () => fetchAccount(),
    enabled: hydrated && isSignedIn,
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    enabled: hydrated && isSignedIn,
    refetchInterval: 60_000,
  });
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    enabled: hydrated && isSignedIn,
    refetchInterval: 60_000,
  });

  const unreadMessages = conversations.data?.filter((item) => item.unread).length ?? 0;
  const unreadNotifications = notifications.data?.unread ?? 0;

  // Close the mobile sheet on Escape and return focus to its trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setMenuOpen(false);
    void navigate({ to: "/browse", search: { q: term.trim() || undefined } });
  }

  async function signOut() {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    try {
      const supabase = await loadSupabase();
      await websiteAccountSignOut(supabase.auth, user?.id, "local");
      await queryClient.cancelQueries();
      queryClient.clear();
      await navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out. Please retry.");
    } finally {
      signOutInFlight.current = false;
    }
  }

  return (
    <header className="sticky top-0 z-40 overflow-visible border-0 bg-card/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Level 1 */}
      <SiteHeaderBar>
        <Link to="/" className="flex min-w-0 shrink-0 items-center pr-1 sm:pr-2" {...pinned}>
          <BrandMark className="hidden sm:inline-flex" />
          <BrandMark compact mobile className="sm:hidden" />
        </Link>

        <form
          className="hidden w-full max-w-[620px] justify-self-center md:block"
          onSubmit={submitSearch}
          role="search"
        >
          <label className="soft-control flex h-14 items-center gap-2 px-3 shadow-sm transition-shadow focus-within:shadow-md">
            <span className="sr-only">Search Idaho classifieds</span>
            <MagnifyingGlass
              size={16}
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
            />
            <input
              type="search"
              name="q"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search cars, tools, furniture, and more"
              className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Search"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
            >
              <MagnifyingGlass size={17} aria-hidden="true" />
            </button>
          </label>
        </form>

        <nav
          aria-label="Account and utilities"
          className="flex min-w-0 shrink-0 items-center justify-end gap-1.5"
        >
          <Link
            to="/create-listing"
            className="hidden h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:inline-flex"
            {...pinned}
          >
            <PlusCircle size={16} aria-hidden="true" />
            Post a listing
          </Link>
          {isSignedIn && <NotificationBell />}
          {/*
            A button rather than a router Link: this control's destination can
            equal the current location, and the router's active-state attribute
            would then differ between SSR and the client-resolved sign-in page.
          */}
          <HeaderAccountMenuView
            isSignedIn={isSignedIn}
            identity={user?.id}
            account={account.data?.userId === user?.id ? account.data : null}
            pathname={pathname}
            onSignIn={() => void navigate({ to: brand.urls.auth })}
            onSignOut={signOut}
            unreadMessages={unreadMessages}
            unreadNotifications={unreadNotifications}
            renderLink={WebsiteHeaderAccountLink}
          />
          <button
            ref={menuButtonRef}
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

      {/* Level 2 — Bluebird classifieds taxonomy. */}
      <nav
        aria-label="Categories"
        className="relative z-10 hidden border-t border-border bg-background lg:block"
      >
        <div className="mx-auto max-w-[1440px]">
          <ul className="mx-auto flex max-w-[1280px] flex-nowrap items-center justify-center gap-3 px-4 py-2 sm:gap-2 sm:px-8">
            <li>
              <Link
                to="/browse"
                search={{ allCategories: true }}
                aria-label="All items"
                className={`${navLinkClass} w-[190px]`}
                {...pinned}
              >
                <span className="category-header-art-frame category-header-art-frame--grounded">
                  <CategoryArtwork
                    slug="general"
                    size={88}
                    className="category-art--nav category-art--header"
                  />
                </span>
                <span>All items</span>
              </Link>
            </li>
            {featuredHeaderCategories.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/browse"
                  search={"group" in c ? { group: c.group } : { category: c.slug }}
                  className={navLinkClass}
                  {...pinned}
                >
                  <span
                    className={`category-header-art-frame ${
                      c.slug === "cars-trucks" ? "category-header-art-frame--grounded" : ""
                    }`}
                  >
                    <CategoryArtwork
                      slug={c.slug}
                      size={88}
                      className="category-art--nav category-art--header"
                    />
                  </span>
                  <span>{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile browse menu. The five primary destinations keep the header useful
          without forcing the desktop artwork row into a narrow viewport. */}
      {menuOpen && (
        <MarketplaceMobileMenu
          isSignedIn={isSignedIn}
          onClose={() => setMenuOpen(false)}
          renderLink={WebsiteMenuLink}
        />
      )}
    </header>
  );
}

function WebsiteHeaderAccountLink({ href, ...props }: HeaderAccountLinkProps) {
  const url = new URL(href, "https://onbluebird.com");
  return (
    <Link
      to="/account"
      search={{
        section: (url.searchParams.get("section") ?? undefined) as AccountSection | undefined,
      }}
      {...props}
      {...pinned}
    />
  );
}

function WebsiteMenuLink({ to, search, onClick, className, children }: MarketplaceMenuLinkProps) {
  return (
    <Link to={to} search={search} onClick={onClick} className={className} {...pinned}>
      {children}
    </Link>
  );
}
