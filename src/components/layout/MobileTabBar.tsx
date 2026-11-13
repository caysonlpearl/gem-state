import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MobileTabBarView, type MobileTabLinkProps } from "./MobileTabBarView";

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

  return <MobileTabBarView pathname={pathname} section={section} renderLink={WebsiteTabLink} />;
}

function WebsiteTabLink({ to, section, children, className }: MobileTabLinkProps) {
  return (
    <Link to={to} {...(section ? { search: { section } } : {})} className={className}>
      {children}
    </Link>
  );
}
