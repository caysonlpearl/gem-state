import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  BookmarkSimple,
  ChatCircle,
  List,
  MagnifyingGlass,
  PlusCircle,
  SignOut,
  Storefront,
  UserCircle,
  X,
} from "@phosphor-icons/react";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandMark } from "@/components/layout/BrandMark";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { useHydrated } from "@/hooks/useHydrated";
import { getMyAccount } from "@/lib/account.functions";
import { getMyConversations } from "@/lib/conversation.functions";
import { getMyNotifications } from "@/lib/notifications.functions";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";

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
  "inline-flex h-[112px] w-auto min-w-[164px] shrink-0 flex-row items-center justify-start gap-3 rounded-2xl px-4 text-left text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground transition-[background-color,color,box-shadow] hover:bg-brand-blue/10 hover:text-primary hover:shadow-md";

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

const mobilePrimaryCategories = [
  { slug: "general", name: "All items", description: "Everyday local finds" },
  {
    slug: "cars-trucks",
    name: "Vehicles",
    group: "motors",
    description: "Cars, trucks, RVs & trailers",
  },
  { slug: "other-real-estate", name: "Homes", description: "Homes, rentals & builds" },
  { slug: "jobs", name: "Jobs", description: "Local work & hiring" },
  { slug: "services", name: "Services", description: "Help for your next project" },
] as const;

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setMenuOpen(false);
    void navigate({ to: "/browse", search: { q: term.trim() || undefined } });
  }

  async function signOut() {
    setAccountMenuOpen(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    const supabase = await loadSupabase();
    await supabase.auth.signOut({ scope: "global" });
    await navigate({ to: "/", replace: true });
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
      <div className="relative z-30 mx-auto grid min-w-0 h-16 max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-[108px] sm:gap-8 sm:px-8">
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
          <div className="relative z-50">
            <button
              ref={accountButtonRef}
              type="button"
              onClick={() => {
                if (!isSignedIn) {
                  void navigate({ to: brand.urls.auth });
                  return;
                }
                setAccountMenuOpen((v) => !v);
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
                aria-label="Account menu"
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-[244px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              >
                <Link
                  to={brand.urls.account}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="hairline-b block px-3.5 pb-3 pt-3 transition-colors hover:bg-secondary/60"
                  {...pinned}
                >
                  <span className="flex items-center gap-3">
                    {account.data?.avatarUrl ? (
                      <img
                        src={account.data.avatarUrl}
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
                        {account.data?.displayName ?? account.data?.email ?? "Your account"}
                      </span>
                      {account.data?.displayName && account.data?.email && (
                        <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-muted-foreground">
                          {account.data.email}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>

                <div className="p-1.5">
                  <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Marketplace
                  </p>
                  <Link
                    to="/account"
                    search={{ section: "listings" }}
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                    {...pinned}
                  >
                    <Storefront size={17} weight="duotone" aria-hidden="true" />
                    Selling
                  </Link>
                  <Link
                    to="/account"
                    search={{ section: "saved" }}
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                    {...pinned}
                  >
                    <BookmarkSimple size={17} weight="duotone" aria-hidden="true" />
                    Saved
                  </Link>
                  <Link
                    to="/account"
                    search={{ section: "messages" }}
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                    {...pinned}
                  >
                    <ChatCircle size={17} weight="duotone" aria-hidden="true" />
                    Messages
                    {unreadMessages > 0 && <UnreadBadge count={unreadMessages} />}
                  </Link>
                  <Link
                    to="/account"
                    search={{ section: "notifications" }}
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                    {...pinned}
                  >
                    <Bell size={17} weight="duotone" aria-hidden="true" />
                    Notifications
                    {unreadNotifications > 0 && <UnreadBadge count={unreadNotifications} />}
                  </Link>
                </div>

                <div className="hairline-t p-1.5">
                  <Link
                    to="/account"
                    search={{ section: "overview" }}
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                    {...pinned}
                  >
                    <UserCircle size={17} weight="duotone" aria-hidden="true" />
                    Account settings
                  </Link>
                </div>

                <div className="hairline-t p-1.5 pb-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  >
                    <SignOut size={17} weight="duotone" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
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
      </div>

      {/* Level 2 — Bluebird classifieds taxonomy. */}
      <nav
        aria-label="Categories"
        className="relative z-10 hidden border-t border-border bg-background lg:block"
      >
        <div className="mx-auto max-w-[1440px]">
          <ul className="mx-auto flex max-w-[1280px] flex-nowrap items-center justify-center gap-3 px-4 sm:gap-2 sm:px-8">
            <li>
              <Link
                to="/browse"
                search={{ allCategories: true }}
                aria-label="All items"
                className={`${navLinkClass} w-[190px]`}
                {...pinned}
              >
                <CategoryArtwork
                  slug="general"
                  size={88}
                  className="category-art--nav category-art--header"
                />
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
                  <CategoryArtwork
                    slug={c.slug}
                    size={88}
                    className="category-art--nav category-art--header"
                  />
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
        <div id="marketplace-menu" className="border-t border-border bg-surface lg:hidden">
          <div className="mx-auto w-full min-w-0 max-w-[1360px] overflow-x-hidden px-4 py-4 sm:px-8">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Browse marketplace
                </p>
                <p className="mt-1 text-[13px] text-foreground">Find your next local gem.</p>
              </div>
              <Link
                to="/create-listing"
                onClick={() => setMenuOpen(false)}
                className="inline-flex min-h-10 max-w-[48%] shrink-0 items-center overflow-hidden rounded-full bg-accent px-3 text-[12px] font-semibold whitespace-nowrap text-ellipsis text-accent-foreground"
                {...pinned}
              >
                Post a listing
              </Link>
            </div>

            <ul className="grid grid-cols-2 gap-2" aria-label="Main categories">
              {mobilePrimaryCategories.map((category) => (
                <li key={category.slug} className={category.slug === "general" ? "col-span-2" : ""}>
                  <Link
                    to="/browse"
                    search={
                      category.slug === "general"
                        ? { allCategories: true }
                        : "group" in category
                          ? { group: category.group }
                          : { category: category.slug }
                    }
                    onClick={() => setMenuOpen(false)}
                    className="group flex w-full min-w-0 min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
                    {...pinned}
                  >
                    <CategoryArtwork slug={category.slug} size={42} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground">
                        {category.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {category.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <Link
                to="/browse"
                search={{ sort: "newest" }}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
                {...pinned}
              >
                Newest listings
              </Link>
              {isSignedIn && (
                <Link
                  to="/notifications"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
                  {...pinned}
                >
                  Notifications
                </Link>
              )}
              <Link
                to="/policies"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
                {...pinned}
              >
                Policies
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
