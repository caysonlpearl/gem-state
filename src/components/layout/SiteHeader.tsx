import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, UserCircle, List, X } from "@phosphor-icons/react";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { useHydrated } from "@/hooks/useHydrated";
import logoAsset from "@/assets/parkvault-logo.png.asset.json";

/*
 * Two-level marketplace header.
 *
 * Level 1: brand mark, the primary product search, account and utility links.
 * Level 2: secondary marketplace navigation generated from real catalog rows —
 *          resorts from `resorts`, categories from `categories`. Nothing is
 *          hardcoded, so an empty category never appears just to fill the bar.
 *
 * Header links are never styled by active state. Pinning the active and
 * inactive class names to the same value keeps the server-rendered markup and
 * the hydrated markup identical even when the router resolves a redirect
 * (for example a protected route bouncing to sign-in) after the SSR pass.
 */
const navLinkClass =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap px-3 text-[14.5px] font-semibold tracking-[-0.01em] text-foreground transition-colors hover:text-nav-accent";

/*
 * Display-only shortening for the dense navigation bar. The catalog rows keep
 * their full names everywhere else; only the header chrome is abbreviated so
 * every entry fits on a single line.
 */
const navLabelOverrides: Record<string, string> = {
  "Walt Disney World": "Disney World",
  "Ears & Headwear": "Headwear",
  "Pins & Trading": "Pins",
  "Drinkware & Sippers": "Drinkware",
  "Bags & Loungefly-style": "Bags",
  "Home & Collectibles": "Home",
};

/*
 * The header bar shows only the original short list of headline categories, in
 * this order. New catalog categories stay browsable on /browse but do not grow
 * the nav bar.
 */
const navCategorySlugs = [
  "ears-headwear",
  "apparel",
  "pins",
  "plush",
  "drinkware",
  "bags",
  "home-decor",
] as const;

const navCategoryLabels: Record<string, string> = {
  "ears-headwear": "Headwear",
  apparel: "Apparel",
  pins: "Pins",
  plush: "Plush",
  drinkware: "Drinkware",
  bags: "Bags",
  "home-decor": "Home",
};

function orderNavCategories<T extends { slug: string }>(rows: T[]) {
  return navCategorySlugs
    .map((slug) => rows.find((r) => r.slug === slug))
    .filter((r): r is T => Boolean(r));
}

function navLabel(label: string) {
  if (navLabelOverrides[label]) return navLabelOverrides[label];
  // Fall back to the segment before an ampersand or "and" pairing.
  const split = label.split(/\s+(?:&|and)\s+/i)[0];
  return split || label;
}
const utilityLinkClass =
  "hidden h-9 items-center px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-primary md:inline-flex";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hydrated = useHydrated();
  const facets = useQuery({
    queryKey: ["catalog-facets"],
    queryFn: () => getCatalogFacets(),
    staleTime: 5 * 60 * 1000,
  });

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

  // Catalog navigation is client-data driven. Streaming SSR can resolve this
  // query on the server while the hydrating client cache is still empty, so the
  // rows only render once hydrated — otherwise the two passes disagree.
  const resorts = hydrated ? (facets.data?.geography ?? []) : [];
  const categories = hydrated
    ? orderNavCategories(facets.data?.categories ?? []).filter((c) => c.slug !== "home-decor")
    : [];

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
      <div className="mx-auto grid h-[68px] max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-3 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center" {...pinned}>
          <img
            src={logoAsset.url}
            alt={`${brand.name} home`}
            width={216}
            height={48}
            className="h-12 w-auto object-contain"
          />
        </Link>

        <form className="min-w-0" onSubmit={submitSearch} role="search">
          <label className="relative block">
            <span className="sr-only">Search park merchandise</span>
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
              placeholder="Search by product, collection or park"
              className="h-10 w-full border border-input bg-card pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
            />
          </label>
        </form>

        <nav aria-label="Account and utilities" className="flex shrink-0 items-center gap-1">
          <Link to="/sell" className={utilityLinkClass} {...pinned}>
            Selling
          </Link>
          <Link to="/glossary" className={utilityLinkClass} {...pinned}>
            How it works
          </Link>
          {isSignedIn && <NotificationBell />}
          {/*
            A button rather than a router Link: this control's destination can
            equal the current location, and the router's active-state attribute
            would then differ between the server-rendered shell of a protected
            route and the sign-in screen the client resolves after the auth
            gate redirects. A plain button carries no active state, so the
            markup is identical on both passes.
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

      {/* Level 2 — generated from real catalog rows only. */}
      <nav aria-label="Marketplace" className="hidden border-t border-border bg-card lg:block">
        <ul className="no-scrollbar mx-auto flex max-w-[1400px] flex-nowrap items-center justify-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-8">
          <li>
            <Link to="/browse" search={{}} className={navLinkClass} {...pinned}>
              All
            </Link>
          </li>
          <li>
            <Link to="/browse" search={{ sort: "newest" }} className={navLinkClass} {...pinned}>
              New
            </Link>
          </li>
          {resorts.map((r) => (
            <li key={r.resortCode}>
              <Link
                to="/browse"
                search={{ resort: r.resortCode }}
                className={navLinkClass}
                {...pinned}
              >
                {navLabel(r.resortName.replace(" Resort", ""))}
              </Link>
            </li>
          ))}
          <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
          {categories.map((c) => (
            <li key={c.slug}>
              <Link to="/browse" search={{ category: c.slug }} className={navLinkClass} {...pinned}>
                {navCategoryLabels[c.slug] ?? navLabel(c.name)}
              </Link>
            </li>
          ))}
          {isSignedIn && (
            <>
              <li aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
              <li>
                <Link to="/watchlist" className={navLinkClass} {...pinned}>
                  Watchlist
                </Link>
              </li>
              <li>
                <Link to="/shopper" className={navLinkClass} {...pinned}>
                  Park shopper
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
              { label: "All products", to: "/browse" as const, search: {} },
              { label: "New to catalog", to: "/browse" as const, search: { sort: "newest" } },
              ...resorts.map((r) => ({
                label: r.resortName.replace(" Resort", ""),
                to: "/browse" as const,
                search: { resort: r.resortCode },
              })),
              ...categories.map((c) => ({
                label: navCategoryLabels[c.slug] ?? c.name,
                to: "/browse" as const,
                search: { category: c.slug },
              })),
              { label: "Park shopper", to: "/shopper" as const, search: {} },
              ...(isSignedIn
                ? [
                    { label: "Watchlist", to: "/watchlist" as const, search: {} },
                    { label: "Notifications", to: "/notifications" as const, search: {} },
                  ]
                : []),
              { label: "How it works", to: "/glossary" as const, search: {} },
              { label: "Selling on ParkVault", to: "/sell" as const, search: {} },
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
