import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { brand, policyEffectiveDate, policyTopics } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

/**
 * Trust and policy surface.
 *
 * Every statement here describes what the marketplace actually does today. Nothing
 * promises escrow, held funds, guaranteed availability or guaranteed payment.
 * These are the operator's published terms, carrying an effective date.
 */
export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: `Policies, privacy and disclosures — ${brand.name}` },
      {
        name: "description",
        content:
          "Gem State Classifieds policies: marketplace disclosures, privacy, buyer and seller terms, cancellation rules, prohibited items, identity verification and contact information.",
      },
      { property: "og:title", content: `Policies and disclosures — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Read Gem State Classifieds' marketplace disclosure, privacy explanation, buyer and seller terms, cancellation rules and contact information.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Policies,
});

function policyBodies(): Record<string, React.ReactNode> {
  return {
    "marketplace-disclosure": (
      <>
        <p>{brand.legal.disclaimer}</p>
        <p>
          {brand.name} does not inspect, authenticate, manufacture or warrant items listed by
          sellers. Listing information is supplied by the seller and should be evaluated by the
          buyer before contacting the seller, meeting, shipping or paying.
        </p>
      </>
    ),
    privacy: (
      <>
        <p>
          We store the account email held by our authentication provider, the display name and
          marketplace preferences you enter, your marketplace activity, and the contact details and
          message you submit when you inquire about a listing. Your inquiry is shared with that
          listing's seller so they can reply.
        </p>
        <p>
          Product-usage analytics record event names, counts, route names and price buckets. They
          never record search text, address contents, receipt contents, government-ID details or
          anything else you typed into a form.
        </p>
        <p>
          Listing photos and account data are protected by account and staff permissions. Gem State
          does not collect payment-card or bank details through the direct-contact listing flow.
        </p>
      </>
    ),
    "buyer-terms": (
      <>
        <p>
          Contact the seller through the listing page to ask questions about one exact item. Confirm
          the item's condition, ownership, price, location and availability before you meet, arrange
          shipping or make payment.
        </p>
        <p>
          {brand.name} does not process payment, hold funds or provide escrow through the
          marketplace. Arrange the payment method and any shipping cost directly with the seller.
        </p>
        <p>
          Future transaction features may add hosted payment and payout flows. Those features are
          not part of the current direct-contact marketplace experience.
        </p>
      </>
    ),
    "seller-terms": (
      <>
        <p>
          A listing states a price for one specific item. You are responsible for describing the
          item accurately, providing clear photos, responding to buyer inquiries, arranging pickup
          or shipping details directly, and taking down the listing if the item is no longer
          available.
        </p>
        <p>
          Do not request a buyer's government ID, bank credentials or card details through Gem State
          messages. Future payment features, if enabled, will use their own hosted flow.
        </p>
      </>
    ),
    cancellation: (
      <>
        <p>
          There is no platform order, reservation or payment to cancel at this time. Either party
          should communicate directly if an item becomes unavailable or plans change.
        </p>
        <p>
          Report unsafe, prohibited, fraudulent or misleading listings through Contact us. Any
          payment disagreement arranged directly between buyer and seller must be handled by those
          parties and their chosen payment provider.
        </p>
      </>
    ),
    "prohibited-items": (
      <>
        <p>
          No stolen goods, counterfeit or illegal items, regulated goods offered without required
          authorization, unsafe hazardous materials, or listings for an item you do not hold or
          cannot lawfully sell. Sellers are responsible for following applicable laws.
        </p>
      </>
    ),
    "identity-verification": (
      <>
        <p>
          The current listing and contact flow does not ask sellers for government-issued identity
          information, bank details or payout credentials. A future payment feature may require
          hosted verification.
        </p>
        <p>
          If hosted verification is added later, identity information will be stored privately and
          not shown to buyers or other members. Access will be limited to authorized marketplace
          operations and payment-provider workflows.
        </p>
        <p>
          Any future identity information will be retained only as long as needed for the account,
          payout and legal obligations described on this page.
        </p>
      </>
    ),
    "evidence-privacy": (
      <>
        <p>
          Listing photos and buyer inquiry messages are protected by account and staff permissions.
          The seller of the referenced listing can read an inquiry so they can reply, and an
          authorized administrator may review listing or message content when needed for moderation.
        </p>
        <p>
          {brand.name} does not collect or store card numbers or bank credentials in the
          direct-contact listing flow. Future transaction evidence will be governed by the policies
          in effect if those features are enabled.
        </p>
      </>
    ),
    "contact-takedown": (
      <>
        <p>
          Use the contact us form for support, account questions, or a rights-holder takedown
          request. Include the listing URL and the specific content at issue.
        </p>
        <p>
          Listings may be removed when they violate these policies, applicable law, or a
          substantiated rights-holder request. Use the contact us form for support and takedown
          enquiries.
        </p>
      </>
    ),
  };
}

function Policies() {
  const bodies = policyBodies();

  useEffect(() => {
    void trackEvent("page_view", { route: "/policies" });
  }, []);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Policy topics" className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Topics
        </h2>
        <ul className="mt-2">
          {policyTopics.map((topic) => (
            <li key={topic.slug}>
              <a
                href={`#${topic.slug}`}
                className="inline-block py-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {topic.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Policies and disclosures</h1>
        <p className="mt-1.5 text-[11.5px] uppercase tracking-[0.08em] text-muted-foreground">
          Effective {policyEffectiveDate}
        </p>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          These are the terms that govern buying and selling on {brand.name}. Each section states a
          rule the marketplace applies today. By creating an account, contacting a seller, or
          listing an item, you agree to the sections that apply to you. If we change a rule, this
          page is updated and the effective date above changes.
        </p>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
          Questions about these terms:{" "}
          <a className="text-foreground underline" href={`mailto:${brand.supportEmail}`}>
            {brand.supportEmail}
          </a>
          .
        </p>

        <div className="mt-7 space-y-2.5">
          {policyTopics.map((topic) => (
            <section
              key={topic.slug}
              id={topic.slug}
              className="scroll-mt-28 rounded-lg border border-border bg-card p-5"
            >
              <h2 className="text-[14px] font-semibold tracking-tight">{topic.title}</h2>

              <div className="mt-2.5 space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {bodies[topic.slug]}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
