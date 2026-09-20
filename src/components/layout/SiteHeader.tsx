import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BookmarkSimple,
  List,
  MagnifyingGlass,
  PlusCircle,
  Storefront,
  UserCircle,
  X,
} from "@phosphor-icons/react";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandMark } from "@/components/layout/BrandMark";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
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
  "inline-flex h-[88px] w-auto min-w-[158px] shrink-0 flex-row items-center justify-start gap-2 rounded-2xl px-3 text-left text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground transition-[background-color,color,box-shadow] hover:bg-secondary hover:text-primary hover:shadow-md";

const utilityLinkClass =
  "hidden h-9 items-center px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-primary md:inline-flex";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

const featuredHeaderCategories = [
  { slug: "cars-trucks", name: "Cars" },
  { slug: "other-real-estate", name: "Homes" },
  { slug: "jobs", name: "Jobs" },
  { slug: "services", name: "Services" },
] as const;

const mobilePrimaryCategories = [
  { slug: "general", name: "Classifieds", description: "Everyday local finds" },
  { slug: "cars-trucks", name: "Cars", description: "Cars, trucks & motors" },
  { slug: "other-real-estate", name: "Homes", description: "Homes, rentals & builds" },
  { slug: "jobs", name: "Jobs", description: "Local work & hiring" },
  { slug: "services", name: "Services", description: "Help for your next project" },
] as const;

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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

  return (
    <header className="sticky top-0 z-40 overflow-x-hidden border-b border-border bg-card/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Level 1 */}
      <div className="mx-auto grid min-w-0 h-[72px] max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-[88px] sm:gap-8 sm:px-8">
        <Link to="/" className="flex min-w-0 shrink-0 items-center pr-1 sm:pr-2" {...pinned}>
          <BrandMark className="hidden sm:inline-flex" />
          <BrandMark compact className="sm:hidden" />
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
          <button
            type="button"
            onClick={() => void navigate({ to: "/browse" })}
            aria-label="Search classifieds"
            className="grid h-10 w-10 place-items-center rounded-full border border-input text-foreground transition-colors hover:bg-secondary sm:h-11 sm:w-11 md:hidden"
          >
            <MagnifyingGlass size={18} aria-hidden="true" />
          </button>
          <Link to="/glossary" className={utilityLinkClass} {...pinned}>
            How it works
          </Link>
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
          <div className="relative">
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
              className="inline-flex h-10 min-h-10 items-center gap-1.5 rounded-full border border-foreground px-3 text-[12px] font-medium transition-colors hover:bg-foreground hover:text-background sm:h-11 sm:min-h-11 sm:px-4 sm:text-[12.5px]"
            >
              <UserCircle size={16} aria-hidden="true" />
              {isSignedIn ? "Account" : "Sign in"}
            </button>
            {isSignedIn && accountMenuOpen && (
              <div
                ref={accountMenuRef}
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[170px] overflow-hidden rounded-lg border border-border bg-card p-1.5 shadow-xl"
              >
                <Link
                  to={brand.urls.account}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex h-10 items-center rounded-md px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  {...pinned}
                >
                  Account
                </Link>
                <Link
                  to="/account"
                  search={{ section: "saved" }}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  {...pinned}
                >
                  <BookmarkSimple size={17} weight="duotone" aria-hidden="true" />
                  Saved
                </Link>
                <Link
                  to="/account"
                  search={{ section: "listings" }}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  {...pinned}
                >
                  <Storefront size={17} weight="duotone" aria-hidden="true" />
                  Selling
                </Link>
                <Link
                  to="/account"
                  search={{ section: "messages" }}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  {...pinned}
                >
                  Messages
                </Link>
                <Link
                  to="/account"
                  search={{ section: "notifications" }}
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition-colors hover:bg-secondary"
                  {...pinned}
                >
                  Notifications
                </Link>
              </div>
            )}
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="marketplace-menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-input text-foreground transition-colors hover:bg-secondary sm:h-11 sm:w-11 lg:hidden"
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </div>

      {/* Level 2 — Gem State classifieds taxonomy. */}
      <nav aria-label="Categories" className="hidden border-t border-border bg-background lg:block">
        <div className="mx-auto max-w-[1440px]">
          <ul className="mx-auto flex max-w-[1280px] flex-nowrap items-center justify-center gap-3 px-4 sm:gap-2 sm:px-8">
            <li>
              <Link
                to="/browse"
                search={{ allCategories: true }}
                aria-label="Classifieds"
                className={`${navLinkClass} w-[178px]`}
                {...pinned}
              >
                <CategoryArtwork slug="general" size={64} className="category-art--nav" />
                <span>Classifieds</span>
              </Link>
            </li>
            {featuredHeaderCategories.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/browse"
                  search={{ category: c.slug }}
                  className={navLinkClass}
                  {...pinned}
                >
                  <CategoryArtwork slug={c.slug} size={64} className="category-art--nav" />
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
          <div className="mx-auto min-w-0 max-w-[1360px] overflow-x-hidden px-3 py-4 sm:px-8">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Browse marketplace
                </p>
                <p className="mt-1 text-[13px] text-foreground">Find your next local gem.</p>
              </div>
              <Link
                to="/create-listing"
                onClick={() => setMenuOpen(false)}
                className="inline-flex min-h-10 items-center rounded-full bg-accent px-3 text-[12px] font-semibold text-accent-foreground"
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
                        : { category: category.slug }
                    }
                    onClick={() => setMenuOpen(false)}
                    className="group flex min-w-0 min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
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
              <Link
                to="/glossary"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
                {...pinned}
              >
                How it works
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
