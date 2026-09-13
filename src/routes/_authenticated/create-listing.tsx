import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, MagnifyingGlass, Plus } from "@phosphor-icons/react";

import { SellerCenterNav } from "@/components/seller/SellerCenterNav";
import { browseProducts } from "@/lib/catalog.functions";
import { getSellerSetup } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/create-listing")({
  component: CreateListingPage,
});

function CreateListingPage() {
  const fetchSetup = useServerFn(getSellerSetup);
  const searchCatalog = useServerFn(browseProducts);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const setup = useQuery({ queryKey: ["seller-setup"], queryFn: () => fetchSetup() });
  const products = useQuery({
    queryKey: ["seller-create-catalog", query],
    queryFn: () => searchCatalog({ data: { q: query || undefined, sort: "newest", page: 1 } }),
  });

  const profileReady = Boolean(
    setup.data?.exists &&
    setup.data?.termsAccepted &&
    setup.data?.stripeDetailsSubmitted &&
    setup.data?.stripePayoutsEnabled,
  );

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            Seller center
          </p>
          <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
            Create a listing
          </h1>
          <p className="mt-1 max-w-[650px] text-[12.5px] leading-relaxed text-muted-foreground">
            Find the matching ParkVault product first. Your price, condition and exact-item photos
            become an individual listing beneath that product page.
          </p>
        </div>
      </div>

      <SellerCenterNav storefrontSlug={setup.data?.slug} />

      {!setup.isLoading && !profileReady ? (
        <section className="mt-8 border border-brand-warm/40 bg-brand-warm/10 p-6">
          <p className="text-[15px] font-semibold">Complete seller verification first</p>
          <p className="mt-2 max-w-[640px] text-[12px] leading-relaxed text-muted-foreground">
            Add your seller profile and ship-from address, accept the seller agreement, and finish
            Stripe identity and payout verification before creating a listing.
          </p>
          <Link
            to="/seller-setup"
            className="mt-4 inline-flex h-11 items-center gap-2 bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground"
          >
            Start seller setup
            <ArrowRight size={15} />
          </Link>
        </section>
      ) : (
        <>
          <form
            className="mt-8 flex max-w-[980px] flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(draftQuery.trim());
            }}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search for a product to list</span>
              <MagnifyingGlass
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search product, character, collection or park"
                className="h-12 w-full border border-input bg-card pl-10 pr-3 text-[13px] focus:border-foreground focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="h-12 bg-foreground px-5 text-[12.5px] font-semibold text-background"
            >
              Search
            </button>
            <Link
              to="/create-missing-listing"
              search={{ name: query || draftQuery.trim() || undefined }}
              className="inline-flex h-12 shrink-0 items-center justify-center bg-primary px-5 text-[12px] font-semibold text-primary-foreground"
            >
              Product not found, create new listing
            </Link>
          </form>

          <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-border pb-3">
            <h2 className="text-[13px] font-semibold">
              {query ? `Results for “${query}”` : "Choose the product you have"}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {products.data?.total ?? 0} products
            </span>
          </div>

          {products.isLoading ? (
            <p className="py-12 text-[13px] text-muted-foreground">Loading products…</p>
          ) : products.data?.products.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 py-6 sm:grid-cols-3 lg:grid-cols-4">
              {products.data.products.map((product) => (
                <article key={product.id} className="min-w-0">
                  <Link
                    to="/products/$slug"
                    params={{ slug: product.slug }}
                    search={{ sell: true }}
                    hash="create-listing"
                    className="group block"
                  >
                    <div className="aspect-square overflow-hidden bg-card">
                      {product.primaryImage ? (
                        <img
                          src={product.primaryImage.src}
                          alt={product.primaryImage.alt}
                          className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[11px] text-muted-foreground">
                          Photo coming soon
                        </div>
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-[12.5px] font-semibold leading-snug">
                      {product.name}
                    </p>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      {product.categoryName ?? "Park merchandise"} · {product.variantCount}{" "}
                      {product.variantCount === 1 ? "variation" : "variations"}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary">
                      <Plus size={13} weight="bold" />
                      List this product
                    </span>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="py-12">
              <p className="text-[13px] font-semibold">Product not found</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                ParkVault uses one shared product page per item. Try another search or use the
                button beside search to submit the missing product and your exact item together.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
