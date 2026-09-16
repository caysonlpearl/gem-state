import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

const title = `How ParkVault works — offers, listings, Buy Now, Sell Now`;
const description =
  "Plain-language definitions of the ParkVault marketplace: what an offer is, what a listing is, how Buy Now and Sell Now work, and how prepaid in-park sourcing and sightings work.";

export const Route = createFileRoute("/glossary")({
  head: () => ({
    meta: [
      { title: `${title} — ${brand.name}` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: GlossaryPage,
});

const terms: { term: string; short: string; body: string }[] = [
  {
    term: "Listing",
    short: "What a seller wants for an item",
    body: "A listing is a seller's price for one exact variation of a product — a specific size, colorway, edition or release. Every listing sits on the product page for that item, so buyers can compare all of them side by side. The lowest listing price is the cheapest price anyone is currently willing to sell at.",
  },
  {
    term: "Offer",
    short: "What a buyer will pay",
    body: "An offer is the price a buyer is willing to pay for one exact variation. The best offer is the most anyone is currently offering. An offer is recorded as interest in a variation at that price; a seller can accept it, and payment is collected at checkout.",
  },
  {
    term: "Buy Now",
    short: "Take the lowest listing price",
    body: "Taking the lowest listing price on a variation instead of waiting for a seller to accept your offer. The price you see is the seller's price, and marketplace fees are always recalculated by ParkVault on the server. Buy Now reserves the listing for you and takes you straight to checkout.",
  },
  {
    term: "Accept the best offer",
    short: "Take the best offer",
    body: "Accepting the best offer on a variation instead of posting your own listing and waiting. The sale is created at that price and the buyer is asked to complete payment before you ship.",
  },
  {
    term: "Variation",
    short: "The exact version of a product",
    body: "Park merchandise is often released in several versions of the same design. A variation captures the exact one: size, colorway, edition, park exclusivity, release. Listings and offers always attach to a variation, never to the general product, so prices stay comparable.",
  },
  {
    term: "Sighting",
    short: "Someone saw it in a park store",
    body: "A sighting is a timestamped report that an item was seen at a specific resort, park or district, and store. Sightings are about availability and location — they are not offers and never set a price.",
  },
  {
    term: "Sourcing listing",
    short: "A shopper's fixed price to find it in park",
    body: "An approved in-park shopper sets fixed earnings and a sourcing window for covered products. The buyer sees the item estimate, shopper earnings, ParkVault sourcing and protection fee, and tracked shipping before paying. There is no negotiation or direct messaging.",
  },
  {
    term: "In-park shopper",
    short: "An approved member who buys on your behalf",
    body: "Shoppers apply and are approved after manual identity review. They choose $10–$25 in earnings per item, and ParkVault does not deduct from that amount. ParkVault's separate buyer-paid sourcing and protection fee is disclosed before checkout.",
  },
  {
    term: "Watchlist",
    short: "Variations you follow, privately",
    body: "Following a variation saves it to your own watchlist so you can check its listing prices, offers and sighting activity in one place. It is private to you.",
  },
  {
    term: "Product suggestion",
    short: "How a missing product gets added",
    body: "ParkVault trades on one canonical page per product, so members cannot create catalog entries. If a product is missing, suggest it and a curator decides whether to add it, merge it with an existing page, or decline it.",
  },
  {
    term: "Verified sale",
    short: "A completed transaction",
    body: "Only eligible completed transactions count toward last sale, sales count and price history. Seed, demonstration, cancelled, disputed and refunded transactions are excluded, so market statistics stay trustworthy.",
  },
];

function GlossaryPage() {
  useEffect(() => {
    void trackEvent("glossary_viewed", { route: "/glossary" });
  }, []);

  return (
    <div className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
        Plain language
      </p>
      <h1 className="mt-3 text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
        How {brand.name} works
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        No jargon and no promises the platform can't keep. Here is exactly what each term means on
        this site.
      </p>

      <dl className="mt-10 overflow-hidden rounded-lg border border-border bg-card">
        {terms.map((item) => (
          <div key={item.term} className="hairline-b px-5 py-5 last:border-b-0">
            <dt className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight">{item.term}</span>
              <span className="text-[12px] text-muted-foreground">{item.short}</span>
            </dt>
            <dd className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {item.body}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold tracking-tight">How payment works</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {brand.legal.checkoutNotice} {brand.name} does not authenticate or grade items, and does
          not operate escrow — nothing on this site should be read as offering either.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/browse"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse the catalog
          </Link>
          <Link
            to={brand.urls.auth}
            className="inline-flex h-9 items-center rounded-md border border-input px-4 text-[13px] font-medium transition-colors hover:bg-secondary"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
