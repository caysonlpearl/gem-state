import { Link } from "@tanstack/react-router";
import { Plus, Storefront, UserCircle, Star, Package } from "@phosphor-icons/react";

const itemClass =
  "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap border border-border bg-card px-3 text-[12px] font-medium transition-colors hover:border-foreground hover:bg-secondary";

export function SellerCenterNav({ storefrontSlug }: { storefrontSlug?: string | null | undefined }) {
  return (
    <nav aria-label="Seller center" className="mt-6 overflow-x-auto">
      <div className="flex min-w-max gap-2 pb-1">
        <Link to="/selling" className={itemClass}>
          <Storefront size={15} />
          Dashboard
        </Link>
        <Link to="/create-listing" className={`${itemClass} bg-primary text-primary-foreground`}>
          <Plus size={15} weight="bold" />
          Create listing
        </Link>
        <Link to="/selling" hash="sales" className={itemClass}>
          <Package size={15} />
          Sales &amp; shipping
        </Link>
        <Link to="/selling" hash="reviews" className={itemClass}>
          <Star size={15} />
          Reviews
        </Link>
        <Link to="/seller-setup" className={itemClass}>
          <UserCircle size={15} />
          Profile &amp; payouts
        </Link>
        {storefrontSlug ? (
          <Link to="/sellers/$slug" params={{ slug: storefrontSlug }} className={itemClass}>
            View storefront
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
