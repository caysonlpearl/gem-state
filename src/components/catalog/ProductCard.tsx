import { Link } from "@tanstack/react-router";

import { WatchHeartButton } from "@/components/community/WatchHeartButton";


import { estimateBuyerTotalCents, formatUsd } from "@/config/fees";
import type {
  CatalogImage,
  MarketCard,
  ProductCard as ProductCardData,
} from "@/lib/catalog.functions";

function ProductWell({ image }: { image?: CatalogImage | null }) {
  if (image) {
    return (
      <div className="relative aspect-square overflow-hidden bg-white">
        <img
          src={image.src}
          alt={image.alt}
          className="h-full w-full object-contain p-2.5 sm:p-3.5"
          loading="lazy"
        />
        {image.isExample && (
          <span className="absolute bottom-2 left-2 border border-border bg-card/95 px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.09em] text-product-ink">
            Example photo
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="product-placeholder relative flex aspect-square items-center justify-center overflow-hidden">
      <span className="border border-border bg-card px-2 py-1 font-mono text-[8.5px] font-medium uppercase tracking-[0.11em] text-product-ink">
        Product shot
      </span>
    </div>
  );
}

const shell =
  "group relative min-w-0 border border-border bg-card transition-colors hover:border-primary";
const demoClass =
  "inline-flex rounded-sm bg-brand-warm/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-brand-warm";

export function CatalogCard({
  product,
  action,
}: {
  product: ProductCardData;
  action?: React.ReactNode;
}) {
  return (
    <article className={shell}>
      <div className="relative">
        <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
          <ProductWell image={product.primaryImage} />
        </Link>
        <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5">
          <WatchHeartButton
            productId={product.id}
            productSlug={product.slug}
            productName={product.name}
            isDemo={product.isDemo}
          />
          {action}
        </div>
      </div>

      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="block border-t border-border px-3 py-3"
      >
        <h3 className="line-clamp-2 min-h-8 text-[12.5px] font-semibold leading-4 transition-colors group-hover:text-primary">
          {product.name}
        </h3>
        <p className="mt-1 truncate text-[10.5px] text-muted-foreground">
          {product.categoryName || "Collectible"}
        </p>
        {product.lowestListingPriceCents != null && product.activeListingCount > 0 ? (
          <p className="numeric mt-2 font-mono text-[12px] leading-none text-product-ink">
            {product.activeListingCount} listing{product.activeListingCount === 1 ? "" : "s"} from{" "}
            <span className="text-[14px] font-semibold">
              {formatUsd(product.lowestListingPriceCents)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-[10.5px] text-muted-foreground">0 listings</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {product.resortCodes.map((code) => (
            <span
              key={code}
              className="rounded-sm bg-secondary px-1.5 py-0.5 text-[9.5px] font-semibold text-secondary-foreground"
            >
              {code}
            </span>
          ))}
          {product.isDemo && <span className={demoClass}>Demo</span>}
        </div>
      </Link>
    </article>
  );
}

export function MarketRowCard({ card }: { card: MarketCard }) {
  const estimate = card.priceCents != null ? estimateBuyerTotalCents(card.priceCents) : null;
  return (
    <article className={shell}>
      <Link to="/products/$slug" params={{ slug: card.productSlug }} className="block">
        <ProductWell />
        <div className="border-t border-border px-3 py-3">
          <h3 className="line-clamp-2 min-h-8 text-[12.5px] font-semibold leading-4 transition-colors group-hover:text-primary">
            {card.productName}
          </h3>
          <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{card.variantLabel}</p>
          <p className="mt-2 text-[9.5px] text-muted-foreground">{card.marketLabel}</p>
          {card.priceCents != null ? (
            <>
              <p className="numeric mt-0.5 font-mono text-[14px] leading-none">
                {formatUsd(card.priceCents)}
              </p>
              {estimate && (
                <p className="numeric mt-1 text-[10px] text-muted-foreground">
                  {formatUsd(estimate.totalCents)} estimated total
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">
              Price confirmation needed
            </p>
          )}
          {card.detail && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{card.detail}</p>
          )}
          {card.isDemo && <span className={`${demoClass} mt-2`}>Demo</span>}
        </div>
      </Link>
    </article>
  );
}
