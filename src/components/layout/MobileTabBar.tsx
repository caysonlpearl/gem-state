import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookmarkSimple,
  ChatCircleDots,
  House,
  MagnifyingGlass,
  PlusCircle,
} from "@phosphor-icons/react";

// Pages with their own pinned bottom action (a listing's contact bar, a form's
// submit) or no need for site navigation hide the tab bar.
function hidesTabBar(pathname: string) {
  return (
    pathname.startsWith("/listings/") ||
    pathname.startsWith("/create-listing") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/admin")
  );
}

const tabClass =
  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium";

/**
 * Phone navigation that keeps selling, saved items and messages one tap away
 * from anywhere, like the apps buyers already use for local marketplaces.
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = useRouterState({
    select: (s) => (s.location.search as { section?: string }).section,
  });
  const hidden = hidesTabBar(pathname);

  useEffect(() => {
    if (hidden) return;
    document.documentElement.classList.add("has-mobile-tab-bar");
    return () => document.documentElement.classList.remove("has-mobile-tab-bar");
  }, [hidden]);

  if (hidden) return null;

  const tone = (active: boolean) => (active ? "text-primary" : "text-muted-foreground");
  const onAccount = pathname.startsWith("/account");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-[640px] items-stretch px-1">
        <Link to="/" className={`${tabClass} ${tone(pathname === "/")}`}>
          <House size={22} weight={pathname === "/" ? "fill" : "regular"} aria-hidden="true" />
          Home
        </Link>
        <Link to="/browse" className={`${tabClass} ${tone(pathname.startsWith("/browse"))}`}>
          <MagnifyingGlass size={22} aria-hidden="true" />
          Search
        </Link>
        <Link to="/create-listing" className={`${tabClass} text-primary`}>
          <PlusCircle size={26} weight="fill" aria-hidden="true" />
          Sell
        </Link>
        <Link
          to="/account"
          search={{ section: "saved" }}
          className={`${tabClass} ${tone(onAccount && section === "saved")}`}
        >
          <BookmarkSimple size={22} aria-hidden="true" />
          Saved
        </Link>
        <Link
          to="/account"
          search={{ section: "messages" }}
          className={`${tabClass} ${tone(onAccount && section === "messages")}`}
        >
          <ChatCircleDots size={22} aria-hidden="true" />
          Messages
        </Link>
      </div>
    </nav>
  );
}
