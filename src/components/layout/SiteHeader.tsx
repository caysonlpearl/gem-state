import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, UserCircle, List, X, PlusCircle } from "@phosphor-icons/react";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { BrandMark } from "@/components/layout/BrandMark";
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
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap px-3 text-[14.5px] font-semibold tracking-[-0.01em] text-foreground transition-colors hover:text-nav-accent";

const utilityLinkClass =
  "hidden h-9 items-center px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-primary md:inline-flex";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

const motorsCategories = classifiedCategories.filter((c) => c.group === "motors");
const generalCategories = classifiedCategories.filter((c) => c.group === "classifieds");

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12.5px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Level 1 */}
      <div className="mx-auto grid h-[76px] max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6 px-3 sm:gap-10 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center pr-1 sm:pr-2" {...pinned}>
          <BrandMark className="hidden sm:inline-flex" />
          <BrandMark compact className="sm:hidden" />
        </Link>

        <form className="min-w-0" onSubmit={submitSearch} role="search">
          <label className="relative block">
            <span className="sr-only">Search Idaho classifieds</span>
            <MagnifyingGlass
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="q"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search cars, tools, furniture, and more"
              className="h-10 w-full border border-input bg-card pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
            />
          </label>
        </form>

        <nav aria-label="Account and utilities" className="flex shrink-0 items-center gap-1">
          <Link to="/glossary" className={utilityLinkClass} {...pinned}>
            How it works
          </Link>
          <Link
            to="/create-listing"
            className="hidden h-9 items-center gap-1.5 bg-accent px-3.5 text-[12.5px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:inline-flex"
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
            className="inline-flex h-9 min-h-11 items-center gap-1.5 border border-foreground px-3.5 text-[12.5px] font-medium transition-colors hover:bg-foreground hover:text-background md:min-h-9"
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
            className="inline-flex h-11 w-11 items-center justify-center border border-input text-foreground transition-colors hover:bg-secondary lg:hidden"
          >
            {menuOpen ? <X size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </div>

      {/* Level 2 — Gem State classifieds taxonomy. */}
      <nav aria-label="Categories" className="hidden border-t border-border bg-card lg:block">
        <ul className="no-scrollbar mx-auto flex max-w-[1400px] flex-nowrap items-center justify-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-8">
          <li>
            <Link to="/browse" search={{}} className={navLinkClass} {...pinned}>
              All listings
            </Link>
          </li>
          {motorsCategories.map((c) => (
            <li key={c.slug}>
              <Link to="/browse" search={{ category: c.slug }} className={navLinkClass} {...pinned}>
                {c.name}
              </Link>
            </li>
          ))}
          <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
          {generalCategories.slice(0, 5).map((c) => (
            <li key={c.slug}>
              <Link to="/browse" search={{ category: c.slug }} className={navLinkClass} {...pinned}>
                {c.name}
              </Link>
            </li>
          ))}
          {isSignedIn && (
            <>
              <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
              <li>
                <Link to="/watchlist" className={navLinkClass} {...pinned}>
                  Saved
                </Link>
              </li>
              <li>
                <Link to="/selling" className={navLinkClass} {...pinned}>
                  Selling
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>

      {/* Condensed mobile menu. Search stays in level 1 and remains prominent. */}
      {menuOpen && (
        <div id="marketplace-menu" className="border-t border-border bg-surface lg:hidden">
          <ul className="mx-auto grid max-w-[1360px] grid-cols-2 gap-1 px-3 py-3">
            {[
              { label: "Post a listing", to: "/create-listing" as const, search: {} },
              { label: "All listings", to: "/browse" as const, search: {} },
              { label: "Newest", to: "/browse" as const, search: { sort: "newest" } },
              ...classifiedCategories.map((c) => ({
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
