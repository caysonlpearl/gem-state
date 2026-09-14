import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  List,
  MagnifyingGlass,
  PlusCircle,
  Storefront,
  UserCircle,
  X,
} from "@phosphor-icons/react";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandMark } from "@/components/layout/BrandMark";
import { CategoryArtwork } from "@/components/classifieds/CategoryIcon";
import { brand } from "@/config/brand";
import { classifiedCategories } from "@/config/classifieds";
import { useAuth } from "@/hooks/useAuth";

/*
 * Two-level classifieds header.
 *
 * Level 1: brand mark, keyword search, post-a-listing, account and utilities.
 * Level 2: category navigation driven by the Gem State classifieds taxonomy —
 *          motors first, then general categories.
 *
 * Header links are never styled by active state, so the server-rendered markup
 * and the hydrated markup stay identical even when the router resolves a
 * redirect after the SSR pass.
 */
const navLinkClass =
  "inline-flex h-[88px] w-[158px] shrink-0 flex-row items-center justify-start gap-3 rounded-2xl px-4 text-left text-[12px] font-semibold leading-tight tracking-[-0.01em] text-foreground transition-colors hover:bg-secondary hover:text-primary";

const utilityLinkClass =
  "hidden h-9 items-center px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-primary md:inline-flex";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

const navigationCategories = classifiedCategories.filter((c) => c.slug !== "general");
const motorsCategories = navigationCategories.filter((c) => c.group === "motors");
const generalCategories = navigationCategories.filter((c) => c.group === "classifieds");

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const categoryStripRef = useRef<HTMLUListElement>(null);

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
    const strip = categoryStripRef.current;
    if (!strip) return;

    const updateScrollState = () => {
      setCanScrollCategoriesLeft(strip.scrollLeft > 4);
      setCanScrollCategoriesRight(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
    };

    updateScrollState();
    strip.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      strip.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [isSignedIn]);

  function scrollCategories(direction: -1 | 1) {
    const strip = categoryStripRef.current;
    if (!strip) return;
    strip.scrollBy({
      left: direction * Math.max(strip.clientWidth * 0.72, 420),
      behavior: "smooth",
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setMenuOpen(false);
    void navigate({ to: "/browse", search: { q: term.trim() || undefined } });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Level 1 */}
      <div className="mx-auto grid h-[88px] max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:gap-8 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center pr-1 sm:pr-2" {...pinned}>
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

        <nav aria-label="Account and utilities" className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void navigate({ to: "/browse" })}
            aria-label="Search classifieds"
            className="grid h-11 w-11 place-items-center rounded-full border border-input text-foreground transition-colors hover:bg-secondary md:hidden"
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
          <button
            type="button"
            onClick={() => void navigate({ to: isSignedIn ? brand.urls.account : brand.urls.auth })}
            className="inline-flex h-11 min-h-11 items-center gap-1.5 rounded-full border border-foreground px-4 text-[12.5px] font-medium transition-colors hover:bg-foreground hover:text-background md:min-h-11"
          >
            <UserCircle size={16} aria-hidden="true" />
            {isSignedIn ? "Account" : "Sign in"}
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="marketplace-menu"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-input text-foreground transition-colors hover:bg-secondary lg:hidden"
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </div>

      {/* Level 2 — Gem State classifieds taxonomy. */}
      <nav aria-label="Categories" className="hidden border-t border-border bg-background lg:block">
        <div className="relative mx-auto max-w-[1440px]">
          <button
            type="button"
            aria-label="Scroll categories left"
            disabled={!canScrollCategoriesLeft}
            onClick={() => scrollCategories(-1)}
            className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-md transition-opacity hover:bg-secondary disabled:pointer-events-none disabled:opacity-0"
          >
            <CaretLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <ul
            id="category-strip"
            ref={categoryStripRef}
            className="no-scrollbar mx-auto flex max-w-[1440px] flex-nowrap items-center justify-start gap-5 overflow-x-auto scroll-smooth px-16 sm:gap-7 sm:px-20"
          >
            <li>
              <Link to="/browse" search={{}} className={navLinkClass} {...pinned}>
                <CategoryArtwork slug="general" size={64} className="category-art--nav" />
                <span>All listings</span>
              </Link>
            </li>
            {motorsCategories.map((c) => (
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
            <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
            {generalCategories.map((c) => (
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
            {isSignedIn && (
              <>
                <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
                <li>
                  <Link to="/watchlist" className={navLinkClass} {...pinned}>
                    <BookmarkSimple size={23} weight="duotone" />
                    <span>Saved</span>
                  </Link>
                </li>
                <li>
                  <Link to="/selling" className={navLinkClass} {...pinned}>
                    <Storefront size={23} weight="duotone" />
                    <span>Selling</span>
                  </Link>
                </li>
              </>
            )}
          </ul>
          <button
            type="button"
            aria-label="Scroll categories right"
            disabled={!canScrollCategoriesRight}
            onClick={() => scrollCategories(1)}
            className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-md transition-opacity hover:bg-secondary disabled:pointer-events-none disabled:opacity-0"
          >
            <CaretRight size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* Condensed mobile menu. Search stays in level 1 and remains prominent. */}
      {menuOpen && (
        <div id="marketplace-menu" className="border-t border-border bg-surface lg:hidden">
          <ul className="mx-auto grid max-w-[1360px] grid-cols-2 gap-1 px-3 py-3">
            {[
              { label: "Post a listing", to: "/create-listing" as const, search: {} },
              { label: "All listings", to: "/browse" as const, search: {} },
              { label: "Newest", to: "/browse" as const, search: { sort: "newest" } },
              ...navigationCategories.map((c) => ({
                label: c.name,
                to: "/browse" as const,
                search: { category: c.slug },
              })),
              ...(isSignedIn
                ? [
                    { label: "Saved", to: "/watchlist" as const, search: {} },
                    { label: "Selling", to: "/selling" as const, search: {} },
                    { label: "Notifications", to: "/notifications" as const, search: {} },
                  ]
                : []),
              { label: "How it works", to: "/glossary" as const, search: {} },
              { label: "Policies", to: "/policies" as const, search: {} },
            ].map((item) => (
              <li key={`${item.label}-${item.to}`}>
                <Link
                  to={item.to}
                  search={item.search}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-md border border-border bg-card px-3 text-[13px]"
                  {...pinned}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
