import { backWithinApp } from "./native-navigation";
import { browseDestination } from "./browse-state";
import { mobilePrimaryCategories } from "../../../src/config/mobile-navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, List, UserCircle, X } from "@phosphor-icons/react";
import { BrandMark } from "../../../src/components/layout/BrandMark";
import { SiteHeaderBar } from "../../../src/components/layout/SiteHeaderBar";
import {
  MarketplaceMobileMenu,
  type MarketplaceMenuLinkProps,
} from "../../../src/components/layout/MarketplaceMobileMenu";
import { mobileCategoryAllowed } from "../../../src/lib/mobile-contract";
import { apiOrigin } from "./client";

export function NativeHeader({
  path,
  signedIn,
  onNavigate,
  onPrivacy,
}: {
  path: string;
  signedIn: boolean;
  onNavigate: (path: string) => void;
  onPrivacy: () => void;
}) {
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
          {(path.startsWith("/listings/") || path.startsWith("/messages/")) && (
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
          <button
            type="button"
            aria-label={signedIn ? "Account" : "Sign in"}
            onClick={() => onNavigate("/account")}
            className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-foreground text-[12px] font-medium transition-colors hover:bg-foreground hover:text-background sm:w-auto sm:px-4 sm:text-[12.5px]"
          >
            <UserCircle size={20} aria-hidden="true" />
            <span className="hidden sm:inline">{signedIn ? "Account" : "Sign in"}</span>
          </button>
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
          isSignedIn={false}
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
  const destination = to === "/create-listing" ? "/post" : browseDestination(search ?? {});
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
