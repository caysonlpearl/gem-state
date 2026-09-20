import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

const title = `How Gem State Classifieds works — listings, contact and selling`;
const description =
  "Plain-language definitions of Gem State Classifieds: how listings, seller contact, buying, selling, pickup, shipping and reviews work across Idaho.";

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
    body: "A listing is one seller's offer to sell one specific item. It includes the item's title, condition, price, photos, location and pickup or shipping options. Cars and trucks can also include year, make, model, mileage, drivetrain, title status and other vehicle details.",
  },
  {
    term: "Offer",
    short: "A price discussed with the seller",
    body: "Offers and checkout are reserved for a future marketplace phase. For now, contact the seller directly to discuss price, condition and availability before making payment.",
  },
  {
    term: "Contact seller",
    short: "Message the person who listed the item",
    body: "Contact seller sends your message and email address to the seller of that exact listing. Continue the conversation directly to confirm the item, price, meeting place, shipping and payment details.",
  },
  {
    term: "Seller review",
    short: "Moderation before publication",
    body: "New listings are reviewed for prohibited items, missing information and clear photos before they appear publicly. Approval does not authenticate, inspect or guarantee an item.",
  },
  {
    term: "Pickup or shipping",
    short: "How the buyer receives the item",
    body: "A seller chooses local pickup, shipping, or both when creating a listing. Ask the seller about pickup details, shipping availability and cost, then arrange the details directly.",
  },
  {
    term: "Saved listing",
    short: "A private listing bookmark",
    body: "Saving a listing adds it to your private saved list so you can find the exact item again. Saved listings are not public and do not reserve the item.",
  },
  {
    term: "Moderation",
    short: "A marketplace safety review",
    body: "Gem State Classifieds may review listing content and photos before publication and may remove listings that violate the published policies. Moderation is not an inspection or a warranty.",
  },
  {
    term: "Buyer inquiry",
    short: "A message about one listing",
    body: "A buyer inquiry is a message attached to one exact listing. The seller can read it in Seller Center and reply to the buyer by email.",
  },
  {
    term: "Seller payout",
    short: "Not currently available",
    body: "Gem State Classifieds does not process buyer payments or seller payouts through the marketplace. If hosted payment and payout features are added, this page will explain how they work.",
  },
  {
    term: "Report a problem",
    short: "Tell Gem State about a listing issue",
    body: "Use Contact us or report the listing when content appears unsafe, prohibited, fraudulent or otherwise violates the published policies. Gem State does not process payment or hold funds through the marketplace.",
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
        <h2 className="text-[13px] font-semibold tracking-tight">How payment works right now</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {brand.name} does not process payment or hold funds through the marketplace. Confirm the
          item, price, ownership, meeting or shipping details, and payment method directly with the
          seller. Gem State does not authenticate or grade items.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/browse"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse listings
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
