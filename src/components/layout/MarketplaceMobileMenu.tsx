import { mobilePrimaryCategories } from "../../config/mobile-navigation";
import type { ComponentType, ReactNode } from "react";
import { CategoryArtwork } from "../classifieds/CategoryIcon";

export type MarketplaceMenuLinkProps = {
  to: "/browse" | "/create-listing" | "/notifications" | "/policies";
  search?: { allCategories?: boolean; group?: string; category?: string; sort?: string };
  onClick: () => void;
  className: string;
  children: ReactNode;
};

export function MarketplaceMobileMenu({
  categories = mobilePrimaryCategories,
  isSignedIn,
  onClose,
  renderLink: RenderLink,
  privacyAction,
}: {
  categories?: readonly { slug: string; name: string; description: string; group?: string }[];
  isSignedIn: boolean;
  onClose: () => void;
  renderLink: ComponentType<MarketplaceMenuLinkProps>;
  privacyAction?: ReactNode;
}) {
  return (
    <div id="marketplace-menu" className="border-t border-border bg-surface lg:hidden">
      <div className="mx-auto w-full min-w-0 max-w-[1360px] overflow-x-hidden px-4 py-4 sm:px-8">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Browse marketplace
            </p>
            <p className="mt-1 text-[13px] text-foreground">Find your next local gem.</p>
          </div>
          <RenderLink
            to="/create-listing"
            onClick={onClose}
            className="inline-flex min-h-10 max-w-[48%] shrink-0 items-center overflow-hidden rounded-full bg-accent px-3 text-[12px] font-semibold whitespace-nowrap text-ellipsis text-accent-foreground"
          >
            Post a listing
          </RenderLink>
        </div>

        <ul className="grid grid-cols-2 gap-2" aria-label="Main categories">
          {categories.map((category) => (
            <li key={category.slug} className={category.slug === "general" ? "col-span-2" : ""}>
              <RenderLink
                to="/browse"
                search={
                  category.slug === "general"
                    ? { allCategories: true }
                    : "group" in category
                      ? { group: category.group }
                      : { category: category.slug }
                }
                onClick={onClose}
                className="group flex w-full min-w-0 min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
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
              </RenderLink>
            </li>
          ))}
        </ul>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <RenderLink
            to="/browse"
            search={{ sort: "newest" }}
            onClick={onClose}
            className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
          >
            Newest listings
          </RenderLink>
          {isSignedIn && (
            <RenderLink
              to="/notifications"
              onClick={onClose}
              className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
            >
              Notifications
            </RenderLink>
          )}
          {privacyAction}
          <RenderLink
            to="/policies"
            onClick={onClose}
            className="flex min-h-10 items-center rounded-xl border border-border bg-card px-3 text-[12px] font-medium"
          >
            Policies
          </RenderLink>
        </div>
      </div>
    </div>
  );
}
