import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { brand } from "@/config/brand";
import { formatUsd } from "@/config/fees";
import { getDemoVariantMarket } from "@/config/demo-market";
import { trackEvent } from "@/lib/analytics";
import { getProductBySlug, type ProductDetail } from "@/lib/catalog.functions";
import { getProductMarket } from "@/lib/market.functions";
import { getPriceHistory } from "@/lib/community.functions";
import { MarketPanel } from "@/components/market/MarketPanel";
import { ActiveSellerListings } from "@/components/market/ActiveSellerListings";
import { MarketDrawer } from "@/components/market/MarketDrawer";
import { SourcingOptionsPanel } from "@/components/market/SourcingOptionsPanel";
import { SightingsPanel } from "@/components/community/SightingsPanel";
import { PriceHistory } from "@/components/community/PriceHistory";
import { illustrativeActivity } from "@/config/illustrative-activity";
import { WatchButton } from "@/components/community/WatchButton";
import { WatcherCount } from "@/components/community/WatcherCount";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { TrustBadges } from "@/components/catalog/TrustBadges";

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
  });

const releaseTypeLabels: Record<string, string> = {
  open_edition: "Open edition",
  limited_edition: "Limited edition",
  limited_release: "Limited release",
  seasonal: "Seasonal release",
  event_exclusive: "Event exclusive",
  annual_passholder: "Annual passholder",
  unknown: "Release type unknown",
};

function formatCatalogDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export const Route = createFileRoute("/products/$slug")({
  validateSearch: (search: Record<string, unknown>): { sell?: boolean | undefined } => ({
    sell:
      search["sell"] === true || search["sell"] === "1" || search["sell"] === "true"
        ? true
        : undefined,
  }),
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    const product = (loaderData as { product: ProductDetail } | undefined)?.product;
    if (!product) return {};
    const title = `${product.name} — ${brand.name}`;
    const description = `${product.name}: ${product.variants.length} tracked ${
      product.variants.length === 1 ? "variation" : "variations"
    }${product.retailPriceCents != null ? `, ${formatUsd(product.retailPriceCents)} retail reference` : ""}. Available at ${product.resorts.map((r) => r.name).join(" and ")}.`;
    const imagePath = product.images[0]?.src;
    const imageUrl = imagePath
      ? imagePath.startsWith("http")
        ? imagePath
        : `${brand.urls.siteUrl}${imagePath}`
      : undefined;
    const meta = [
      { title },
      { name: "description", content: description.slice(0, 158) },
      { property: "og:title", content: title },
      { property: "og:description", content: description.slice(0, 158) },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(imageUrl
        ? [
            { property: "og:image", content: imageUrl },
            { name: "twitter:image", content: imageUrl },
          ]
        : []),
    ];

    // Demonstration records are never indexed and never emit Product structured
    // data, so no simulated offer or availability can reach search engines.
    if (product.isDemo) {
      return { meta: [...meta, { name: "robots", content: "noindex, nofollow" }] };
    }

    return {
      meta,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description ?? undefined,
            category: product.categoryName ?? undefined,
            brand: product.brandName ? { "@type": "Brand", name: product.brandName } : undefined,
            releaseDate: product.releaseDate ?? undefined,
          }),
        },
      ],
    };
  },
  component: ProductPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-[720px] px-4 py-20 text-center sm:px-6">
      <h1 className="text-[20px] font-semibold tracking-tight">Product not found</h1>
      <p className="mt-2 text-[13.5px] text-muted-foreground">
        This product is not published, or the link is out of date.
      </p>
      <Link
        to="/browse"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13.5px] font-medium text-primary-foreground"
      >
        Back to the catalog
      </Link>
    </div>
  ),
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { sell } = Route.useSearch();
  const { data } = useSuspenseQuery(productQuery(slug));
  // The query can resolve to null (unpublished/removed) or, during a client
  // refetch, to a payload without collections; never index those blindly.
  const product = data as ProductDetail | null;
  const variants = product?.variants ?? [];
  const images = product?.images ?? [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [buyBoxVisible, setBuyBoxVisible] = useState(true);
  const buyBoxRef = useRef<HTMLDivElement | null>(null);

  const fetchMarket = useServerFn(getProductMarket);
  // Shares the cache key MarketPanel uses, so the sticky bar costs no extra request.
  const marketQuery = useQuery({
    queryKey: ["product-market", product?.id ?? ""],
    queryFn: () => fetchMarket({ data: { productId: product!.id } }),
    enabled: Boolean(product?.id) && !product?.isDemo,
  });
  const fetchPriceHistory = useServerFn(getPriceHistory);
  // Shares the cache key PriceHistory uses below, so real last-sale data is
  // available here too — real activity must win over illustrative filler.
  const priceHistoryQuery = useQuery({
    queryKey: ["price-history", variantId],
    queryFn: () => fetchPriceHistory({ data: { variantId } }),
    enabled: Boolean(variantId) && !product?.isDemo,
  });

  useEffect(() => {
    if (!product) return;
    void trackEvent(
      "product_viewed",
      { product_slug: product.slug, variations: variants.length },
      { isDemo: product.isDemo },
    );
  }, [product, variants.length]);

  useEffect(() => {
    const node = buyBoxRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setBuyBoxVisible(entries[0]?.isIntersecting ?? true),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [product?.id]);

  if (!product) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-20 text-center sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Product not found</h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          This product is not published, or the link is out of date.
        </p>
        <Link
          to="/browse"
          search={{}}
          className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-[13.5px] font-medium text-primary-foreground"
        >
          Back to the catalog
        </Link>
      </main>
    );
  }

  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const illustrative = illustrativeActivity({ ...product, id: variant?.id ?? product.id });
  const demoMarket = getDemoVariantMarket(product.slug, variant?.skuLabel);
  const variantMarket = marketQuery.data?.find((m) => m.variantId === variant?.id);
  // Real captured last-sale price always wins; illustrative is only a
  // placeholder for a variation with no verified sale yet.
  const realLastSaleCents = [...(priceHistoryQuery.data ?? [])]
    .reverse()
    .find((point) => point.lastSaleCents != null)?.lastSaleCents;
  const lastSaleCents =
    realLastSaleCents ??
    (demoMarket ? demoMarket.lastSaleCents : null) ??
    illustrative?.sales[0]?.priceCents ??
    null;
  const stickyPriceCents = demoMarket
    ? demoMarket.lowestAskCents
    : (variantMarket?.lowestAskCents ?? null);
  const subtitle = [product.brandName, product.collectionName, product.categoryName]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-8 sm:py-7 lg:pb-10">
      <nav aria-label="Breadcrumb" className="hidden lg:block">
        <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
          <li>
            <Link to="/browse" search={{}} className="hover:text-foreground">
              Catalog
            </Link>
          </li>
          {product.categoryName && (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <span>{product.categoryName}</span>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-3 grid gap-7 lg:mt-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(400px,1fr)] xl:gap-10">
        {/* Gallery */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative overflow-hidden border border-border bg-card">
            <ProductGallery images={images} model={product.model} productName={product.name} />
            {variant && !product.isDemo && (
              <div className="pointer-events-none absolute right-3 top-3 z-10">
                <WatcherCount variantId={variant.id} floating />
              </div>
            )}
          </div>
        </div>

        {/* Title, variation control and buy box */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {product.resorts.map((resort) => (
              <span
                key={resort.code}
                className="rounded-sm bg-secondary px-1.5 py-0.5 text-[9.5px] font-semibold text-secondary-foreground"
              >
                {resort.name}
              </span>
            ))}
            {product.isDemo && (
              <span className="rounded-sm bg-brand-warm/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-brand-warm">
                Demo
              </span>
            )}
          </div>

          <h1 className="mt-2.5 font-editorial text-[30px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[36px] lg:text-[40px] lg:leading-[1.02]">
            {product.name}
          </h1>
          {variant && (
            <p className="mt-1 text-[13px] font-medium text-muted-foreground">{variant.label}</p>
          )}
          {subtitle && <p className="mt-1 text-[11.5px] text-muted-foreground">{subtitle}</p>}

          {product.isDemo && (
            <p className="mt-2.5 border-l-2 border-brand-warm/60 pl-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Demonstration catalog record. Trading is disabled and it is excluded from market
              statistics.
            </p>
          )}

          {/* Variation control */}
          {variants.length > 0 && (
            <div className="mt-4 border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                <label htmlFor="variation-select" className="text-[13px] font-semibold">
                  Variation
                </label>
                {variants.length === 1 ? (
                  <span className="text-[13px] text-muted-foreground">{variants[0]?.label}</span>
                ) : (
                  <select
                    id="variation-select"
                    value={variant?.id ?? ""}
                    onChange={(event) => {
                      setVariantId(event.target.value);
                      void trackEvent(
                        "variation_selected",
                        { product_slug: product.slug, variant_id: event.target.value },
                        { isDemo: product.isDemo },
                      );
                    }}
                    className="max-w-[62%] truncate bg-transparent text-right text-[13px] font-medium outline-none"
                  >
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                        {v.skuLabel ? ` · ${v.skuLabel}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Buy box */}
          {variant && (
            <div ref={buyBoxRef}>
              <MarketPanel
                productId={product.id}
                productSlug={product.slug}
                variantId={variant.id}
                variantLabel={variant.label}
                isDemo={product.isDemo}
                demoMarket={demoMarket}
                defaultOpenAsk={sell}
                onViewMarketData={() => setDrawerOpen(true)}
                lastSaleCents={lastSaleCents}
              />
            </div>
          )}

          {variant && !product.isDemo && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <WatchButton
                productSlug={product.slug}
                variantId={variant.id}
                isDemo={product.isDemo}
              />
            </div>
          )}
        </div>
      </div>

      {/* Used listings, then Park Shopper sourcing — side by side on desktop. */}
      {variant && !product.isDemo && (
        <div className="mt-8 grid gap-7 border-t border-border pt-6 lg:grid-cols-2 lg:gap-9">
          <section>
            <h2 className="text-[16px] font-semibold tracking-tight">Shop used listings</h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Photos show the exact item offered by each member. ParkVault does not authenticate
              items.
            </p>
            <ActiveSellerListings
              variantId={variant.id}
              productName={product.name}
              productSlug={product.slug}
              variantLabel={variant.label}
            />
          </section>

          <section>
            <h2 className="text-[16px] font-semibold tracking-tight">Have a shopper get this</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Approved Park Shoppers who cover this location can attempt the purchase inside a
              disclosed window. Availability is not guaranteed until the item is purchased.
            </p>
            <SourcingOptionsPanel
              productSlug={product.slug}
              variantId={variant.id}
              variantLabel={variant.label}
              isDemo={product.isDemo}
            />
          </section>
        </div>
      )}

      {/* Sell / source entry points */}
      {variant && !product.isDemo && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 border-t border-border pt-6">
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            search={{ sell: true }}
            className="inline-flex h-10 items-center rounded-full border border-input px-5 text-[12.5px] font-semibold hover:bg-secondary"
          >
            Sell this item →
          </Link>
          <Link
            to="/shopper"
            className="inline-flex h-10 items-center rounded-full border border-input px-5 text-[12.5px] font-semibold hover:bg-secondary"
          >
            Offer to source this →
          </Link>
        </div>
      )}

      {/* Trust and policy disclosures */}
      <div className="mt-8 border-y border-border">
        <Accordion title="Transaction details">
          Sellers state item condition. Payments are processed by Stripe at checkout, and seller and
          shopper payouts remain pending until delivery is confirmed. ParkVault does not
          authenticate items and does not operate escrow.
        </Accordion>
        <Accordion title="Cancellation and refunds">
          Orders that never ship, arrive materially different from the listing, or cannot be sourced
          are refunded in full. See the{" "}
          <Link to="/policies" hash="cancellation" className="underline underline-offset-2">
            cancellation and refund policy
          </Link>
          .
        </Accordion>
        <Accordion title="Non-affiliation">{brand.legal.disclaimer}</Accordion>
      </div>

      {/* Product details */}
      <section className="mt-8">
        <h2 className="text-[16px] font-semibold tracking-tight">Product details</h2>
        <dl className="mt-2 overflow-hidden border-y border-border text-[11.5px]">
          {variant?.skuLabel && <Row label="Variation code">{variant.skuLabel}</Row>}
          <Row label="Category">{product.categoryName ?? "Not recorded"}</Row>
          <Row label="Release">{releaseTypeLabels[product.releaseType] ?? product.releaseType}</Row>
          <Row label="Release date">{formatCatalogDate(product.releaseDate)}</Row>
          <Row label="Retail reference">
            {product.retailPriceCents != null ? formatUsd(product.retailPriceCents) : "Unknown"}
          </Row>
          <Row label="Retail price source">{product.retailPriceSource ?? "Not recorded"}</Row>
          <Row label="Availability">
            {product.resorts.map((r) => r.name).join(", ") || "Not recorded"}
          </Row>
        </dl>
        {product.description && <ProductDescription text={product.description} />}
      </section>

      {/* Price history and in-park sightings */}
      {variant && (
        <div className="mt-9 grid gap-8 lg:grid-cols-2">
          <section className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-tight">Price history</h2>
            <PriceHistory
              variantId={variant.id}
              isDemo={product.isDemo}
              illustrative={illustrative}
            />
          </section>
          <section className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-tight">In-park sightings</h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Store sightings and price observations reported by members for this variation.
            </p>
            <SightingsPanel
              productSlug={product.slug}
              illustrative={illustrative}
              variantId={variant.id}
              variantLabel={variant.label}
              isDemo={product.isDemo}
            />
          </section>
        </div>
      )}

      <CatalogEvidence product={product} className="mt-9" />

      <TrustBadges className="mt-9" />

      <p className="mt-7 text-center text-[12px] text-muted-foreground">
        Looking for something that is not here?{" "}
        <Link to="/suggest" className="underline underline-offset-2">
          Suggest a product
        </Link>{" "}
        and a curator reviews it for the canonical catalog.
      </p>

      {/* Mobile sticky buy bar — mirrors the buy box, never a second price source. */}
      {variant && !buyBoxVisible && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/98 px-4 py-2.5 backdrop-blur lg:hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] text-muted-foreground">
                {stickyPriceCents != null ? "Buy now for" : "Lowest price"}
              </p>
              <p
                className={
                  stickyPriceCents != null
                    ? "numeric truncate text-[19px] font-semibold leading-tight"
                    : "truncate text-[12.5px] text-muted-foreground"
                }
              >
                {stickyPriceCents != null ? formatUsd(stickyPriceCents) : "No active listings"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                buyBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="h-11 shrink-0 rounded-full bg-nav-accent px-7 text-[14px] font-semibold text-primary-foreground"
            >
              Buy now
            </button>
          </div>
        </div>
      )}

      {variant && (
        <MarketDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          variantId={variant.id}
          variantLabel={variant.label}
          productName={product.name}
          illustrativeSales={illustrative?.sales}
          demoMarket={demoMarket}
        />
      )}
    </main>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[13px] font-semibold">
        {title}
        <span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <p className="pb-4 text-[11.5px] leading-relaxed text-muted-foreground">{children}</p>
    </details>
  );
}

function ProductDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 320;
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-semibold">Product description</h3>
      <p
        className={`mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground ${
          long && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 text-[12px] font-semibold text-nav-accent underline underline-offset-[3px]"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function CatalogEvidence({
  product,
  className = "",
}: {
  product: ProductDetail;
  className?: string;
}) {
  if (product.facts.length === 0 && product.sources.length === 0) return null;

  return (
    <div className={className}>
      {product.facts.length > 0 && (
        <section>
          <h2 className="text-[16px] font-semibold tracking-tight">Catalog facts</h2>
          <dl className="mt-2 overflow-hidden border-y border-border text-[11.5px]">
            {product.facts.map((fact) => (
              <Row key={fact.id} label={fact.label}>
                {fact.value}
              </Row>
            ))}
          </dl>
        </section>
      )}

      {product.sources.length > 0 && (
        <section className={product.facts.length > 0 ? "mt-6" : ""}>
          <h2 className="text-[16px] font-semibold tracking-tight">Reference sources</h2>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            Catalog details and retail references were checked against these pages. Park inventory
            can change without notice.
          </p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {product.sources.map((source) => (
              <li key={source.id} className="py-2.5">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-medium leading-snug underline decoration-border-strong underline-offset-2 hover:text-primary"
                >
                  {source.label}
                </a>
                {source.observedOn && (
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    Checked {formatCatalogDate(source.observedOn)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline-b flex items-start justify-between gap-4 px-4 py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
