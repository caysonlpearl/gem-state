import type { ComponentType, ReactNode, Ref } from "react";
import {
  BookmarkSimple,
  ChatCircleDots,
  House,
  MagnifyingGlass,
  PlusCircle,
} from "@phosphor-icons/react";

export type MobileTabLinkProps = {
  to: "/" | "/browse" | "/create-listing" | "/account";
  section?: "saved" | "messages";
  className: string;
  children: ReactNode;
};

export const mobileTabBaseClass =
  "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 font-medium";

/** Shared frame; the native app opts into the owner's floating five-control layout. */
export function MobileNavigationFrame({
  children,
  floating = false,
  navigationRef,
}: {
  children: ReactNode;
  floating?: boolean;
  navigationRef?: Ref<HTMLElement>;
}) {
  return (
    <nav
      ref={navigationRef}
      aria-label="Primary"
      className={
        floating
          ? "native-floating-navigation fixed z-40 rounded-full border border-white/70 bg-background/80 p-1 shadow-[0_4px_24px_rgb(20_35_50_/_14%)] backdrop-blur-xl"
          : "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      }
    >
      <div className="mx-auto flex max-w-[640px] items-stretch px-1">{children}</div>
    </nav>
  );
}

/** The phone website keeps its established navigation. */
export function MobileTabBarView({
  pathname,
  section,
  renderLink: RenderLink,
}: {
  pathname: string;
  section?: string;
  renderLink: ComponentType<MobileTabLinkProps>;
}) {
  const tabClass = `${mobileTabBaseClass} text-[10.5px]`;
  const tone = (active: boolean) => (active ? "text-primary" : "text-muted-foreground");
  const onAccount = pathname.startsWith("/account");
  return (
    <MobileNavigationFrame>
      <RenderLink to="/" className={`${tabClass} ${tone(pathname === "/")}`}>
        <House size={22} weight={pathname === "/" ? "fill" : "regular"} aria-hidden="true" />
        Home
      </RenderLink>
      <RenderLink to="/browse" className={`${tabClass} ${tone(pathname.startsWith("/browse"))}`}>
        <MagnifyingGlass size={22} aria-hidden="true" />
        Search
      </RenderLink>
      <RenderLink to="/create-listing" className={`${tabClass} text-primary`}>
        <PlusCircle size={26} weight="fill" aria-hidden="true" />
        Sell
      </RenderLink>
      <RenderLink
        to="/account"
        section="saved"
        className={`${tabClass} ${tone(onAccount && section === "saved")}`}
      >
        <BookmarkSimple size={22} aria-hidden="true" />
        Saved
      </RenderLink>
      <RenderLink
        to="/account"
        section="messages"
        className={`${tabClass} ${tone(onAccount && section === "messages")}`}
      >
        <ChatCircleDots size={22} aria-hidden="true" />
        Messages
      </RenderLink>
    </MobileNavigationFrame>
  );
}
