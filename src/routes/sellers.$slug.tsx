import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle, Star } from "@phosphor-icons/react";

import { getPublicSeller } from "@/lib/seller.functions";
import { SellerListingGrid } from "@/components/market/SellerListingGrid";

const sellerQuery = (slug: string) =>
  queryOptions({ queryKey: ["seller", slug], queryFn: () => getPublicSeller({ data: { slug } }) });

export const Route = createFileRoute("/sellers/$slug")({
  loader: async ({ context, params }) => {
    const seller = await context.queryClient.ensureQueryData(sellerQuery(params.slug));
    if (!seller) throw notFound();
    return { seller };
  },
  component: SellerPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.seller
          ? `${loaderData.seller.displayName} — Seller on Gem State Classifieds`
          : `Seller profile — Gem State Classifieds`,
      },
      {
        name: "description",
        content: loaderData?.seller
          ? `${loaderData.seller.displayName}'s active listings on Gem State Classifieds.`
          : "Seller profile on Gem State Classifieds.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: () => (
    <main className="mx-auto max-w-[720px] px-4 py-20 text-center">
      <h1 className="font-editorial text-[34px]">Seller not found</h1>
      <Link to="/browse" search={{}} className="mt-4 inline-block underline">
        Browse listings
      </Link>
    </main>
  ),
});

function SellerPage() {
  const { slug } = Route.useParams();
  const { data: seller } = useSuspenseQuery(sellerQuery(slug));
  if (!seller) return null;
  return (
    <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
      <section className="border-b border-border pb-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-[22px] font-semibold text-primary-foreground">
            {seller.avatarUrl ? (
              <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              seller.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 font-editorial text-[38px] font-normal tracking-[-0.035em]">
              {seller.displayName}
              {seller.payoutVerified ? (
                <CheckCircle
                  size={21}
                  weight="fill"
                  className="text-primary"
                  aria-label="Payout identity verified"
                />
              ) : null}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              @{seller.slug} · Member since {new Date(seller.memberSince).getFullYear()}
            </p>
            {seller.bio ? (
              <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
                {seller.bio}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid max-w-[560px] grid-cols-3 gap-px bg-border border border-border">
          <Metric label="Active listings" value={seller.activeListingCount} />
          <Metric label="Verified sales" value={seller.completedSalesCount} />
          <Metric
            label="Rating"
            value={seller.ratingAverage == null ? "New" : `${seller.ratingAverage.toFixed(1)} / 5`}
            icon={seller.ratingAverage != null ? <Star size={12} weight="fill" /> : null}
          />
        </div>
      </section>
      <section className="pt-7">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-editorial text-[27px] font-normal">Listings</h2>
          <span className="text-[11.5px] text-muted-foreground">Seller listings</span>
        </div>
        <SellerListingGrid listings={seller.listings} showProduct />
      </section>
      <section className="mt-10 border-t border-border pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Seller reviews</h2>
          <span className="text-[11.5px] text-muted-foreground">{seller.reviewCount} total</span>
        </div>
        {seller.reviews.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {seller.reviews.map((review) => (
              <li key={review.id} className="border border-border bg-card p-4">
                <p
                  className="flex gap-0.5 text-primary"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      size={13}
                      weight={index < review.rating ? "fill" : "regular"}
                    />
                  ))}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed">
                  {review.comment || "Verified transaction rating"}
                </p>
                <p className="mt-3 text-[10.5px] text-muted-foreground">
                  Verified buyer · {new Date(review.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            This seller has not received a completed-order review yet.
          </p>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 flex items-center gap-1 text-[14px] font-semibold">
        {value}
        {icon}
      </p>
    </div>
  );
}
