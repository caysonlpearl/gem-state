import type { ComponentType, ReactNode } from "react";
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

const tabClass =
  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium";

/** The phone website and bundled app render this same navigation. */
export function MobileTabBarView({
  pathname,
  section,
  renderLink: RenderLink,
}: {
  pathname: string;
  section?: string;
  renderLink: ComponentType<MobileTabLinkProps>;
}) {
  const tone = (active: boolean) => (active ? "text-primary" : "text-muted-foreground");
  const onAccount = pathname.startsWith("/account");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-[640px] items-stretch px-1">
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
      </div>
    </nav>
  );
}
