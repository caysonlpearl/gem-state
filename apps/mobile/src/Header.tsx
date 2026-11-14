import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { BrandMark } from "../../../src/components/layout/BrandMark";
import { NativeHomeLocation, NativeHomeShortcuts } from "./HomeNavigation";
import { parseLocationSearch } from "../../../src/lib/location-search";
import { backWithinApp } from "./native-navigation";
import { browseDestination, browseLocation } from "./browse-state";

/** Brand scrolls with the page; search and Saved remain within reach. */
export function NativeHeader({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState(() => browseLocation(window.location.hash).search.q ?? "");
  const [area, setArea] = useState("Idaho");
  useEffect(() => {
    const sync = () => setQuery(browseLocation(window.location.hash).search.q ?? "");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const back =
    path.startsWith("/listings/") ||
    path.startsWith("/messages/") ||
    path.startsWith("/sellers/") ||
    path.startsWith("/dealers/");
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-card"
      />
      <div className="native-brand-row bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[1400px] px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <a
              href="#/"
              aria-label="Bluebird home"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/");
              }}
            >
              <BrandMark mobile />
            </a>
            {path === "/" && (
              <NativeHomeLocation
                area={area}
                onApply={(value) => {
                  setArea(value);
                  onNavigate(
                    browseDestination({
                      q: query.trim() || undefined,
                      ...parseLocationSearch(value),
                    }),
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>
      <header
        aria-label="Search and saved listings"
        className="native-search-header sticky top-[env(safe-area-inset-top)] z-40 bg-card/95 backdrop-blur-xl"
      >
        <a
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            const main = document.getElementById("main-content");
            main?.focus({ preventScroll: true });
            main?.scrollIntoView({ block: "start" });
          }}
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2">
          {back && (
            <button
              type="button"
              aria-label="Go back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              onClick={() => {
                if (!backWithinApp()) onNavigate("/");
              }}
            >
              <ArrowLeft size={22} />
            </button>
          )}
          <form
            role="search"
            aria-label="Search Bluebird"
            className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-secondary/70"
            onSubmit={(event) => {
              event.preventDefault();
              const current = browseLocation(window.location.hash);
              onNavigate(
                browseDestination(
                  {
                    ...(current.path === "/" ? parseLocationSearch(area) : {}),
                    q: query.trim() || undefined,
                  },
                  current.path === "/search" ? current.params : undefined,
                ),
              );
              document.getElementById("native-header-search")?.blur();
            }}
          >
            <button
              type="submit"
              aria-label="Submit search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <MagnifyingGlass size={22} aria-hidden="true" />
            </button>
            <input
              id="native-header-search"
              type="search"
              aria-label="Search for anything"
              aria-describedby={path === "/" ? "native-home-search-area" : undefined}
              placeholder="Search for anything"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 min-w-0 flex-1 rounded-full border-0 bg-transparent pr-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </form>
          <a
            href="#/saved"
            aria-label="Saved listings"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/saved");
            }}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/70 ${path === "/saved" ? "bg-primary/10 text-primary" : "text-foreground"}`}
          >
            <BookmarkSimple
              size={24}
              weight={path === "/saved" ? "fill" : "regular"}
              aria-hidden="true"
            />
          </a>
        </div>
      </header>
      {path === "/" && (
        <NativeHomeShortcuts
          onBrowse={(scope) =>
            onNavigate(
              browseDestination({
                ...parseLocationSearch(area),
                q: query.trim() || undefined,
                ...scope,
              }),
            )
          }
        />
      )}
    </>
  );
}
