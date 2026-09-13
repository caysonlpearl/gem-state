import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Star } from "@phosphor-icons/react";

import { formatUsd } from "@/config/fees";
import { getPublicShopper } from "@/lib/shopper.functions";

const shopperQuery = (slug: string) =>
  queryOptions({
    queryKey: ["shopper-profile", slug],
    queryFn: () => getPublicShopper({ data: { slug } }),
  });

export const Route = createFileRoute("/shoppers/$slug")({
  loader: async ({ context, params }) => {
    const shopper = await context.queryClient.ensureQueryData(shopperQuery(params.slug));
    if (!shopper) throw notFound();
    return { shopper };
  },
  component: ShopperProfilePage,
  head: () => ({
    meta: [
      { title: "In-park shopper profile · ParkVault" },
      {
        name: "description",
        content:
          "An approved ParkVault in-park shopper: where they shop, their disclosed flat service fee, and reviews from completed orders.",
      },
      { property: "og:title", content: "In-park shopper profile · ParkVault" },
      {
        property: "og:description",
        content: "Approved ParkVault in-park shopper profile with disclosed fee and real reviews.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => (
    <main className="mx-auto max-w-[720px] px-4 py-20 text-center">
      <h1 className="font-editorial text-[32px]">This shopper profile could not be loaded</h1>
      <Link to="/browse" search={{}} className="mt-4 inline-block underline">
        Browse products
      </Link>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-[720px] px-4 py-20 text-center">
      <h1 className="font-editorial text-[34px]">Shopper not found</h1>
      <Link to="/browse" search={{}} className="mt-4 inline-block underline">
        Browse products
      </Link>
    </main>
  ),
});

function ShopperProfilePage() {
  const { slug } = Route.useParams();
  const { data: shopper } = useSuspenseQuery(shopperQuery(slug));
  if (!shopper) return null;

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-10 sm:px-8">
      <section className="border-b border-border pb-7">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-[22px] font-semibold text-primary-foreground">
            {shopper.avatarUrl ? (
              <img src={shopper.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              shopper.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-editorial text-[38px] font-normal tracking-[-0.035em]">
              {shopper.displayName}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              @{shopper.slug} · In-park shopper · Member since{" "}
              {new Date(shopper.memberSince).getFullYear()}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {[shopper.publicLocation, shopper.homeResort].filter(Boolean).join(" · ") ||
                "Location not shared"}
            </p>
            {shopper.bio ? (
              <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-muted-foreground">
                {shopper.bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid max-w-[720px] grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          <Metric label="Completed shopping orders" value={shopper.completedOrders} />
          <Metric
            label="Rating"
            value={
              shopper.ratingAverage == null ? "New" : `${shopper.ratingAverage.toFixed(1)} / 5`
            }
          />
          <Metric
            label="Shopper earnings"
            value={shopper.flatFeeCents == null ? "Not set" : formatUsd(shopper.flatFeeCents)}
          />
          <Metric
            label="Purchase window"
            value={
              shopper.purchaseWindowDays == null ? "Not set" : `${shopper.purchaseWindowDays} days`
            }
          />
        </div>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          {shopper.availableNow
            ? "Marked available for in-park shopping right now."
            : "Not currently marked available for in-park shopping."}{" "}
          Shopper earnings are disclosed before you commit, paid entirely to the shopper and never
          change after an order is created. Merchandise is reimbursed separately at receipt cost.
        </p>
      </section>

      <section className="pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-editorial text-[27px] font-normal">Shopper reviews</h2>
          <span className="text-[11.5px] text-muted-foreground">{shopper.reviewCount} total</span>
        </div>
        {shopper.reviews.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {shopper.reviews.map((review) => (
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
                  Verified member · {new Date(review.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            This shopper has not received a completed-order review yet.
          </p>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-[14px] font-semibold">{value}</p>
    </div>
  );
}
