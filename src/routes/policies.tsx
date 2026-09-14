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
        buyer before purchase.
      </p>
    </>
  ),
  privacy: (
    <>
      <p>
        We store the account email held by our authentication provider, the display name and
        marketplace preferences you enter, your marketplace activity, and — only when you take part in a
        transaction — a shipping address snapshot for that order.
      </p>
      <p>
        Product-usage analytics record event names, counts, route names and price buckets. They
        never record search text, address contents, receipt contents, government-ID details or
        anything else you typed into a form.
      </p>
      <p>
        Addresses, evidence files and identity documents are stored in private storage and reached
        only through short-lived signed links, restricted to the order's participants and an
        authorised administrator. Administrative access to identity documents and receipts is
        logged.
      </p>
    </>
  ),
  "buyer-terms": (
    <>
      <p>
        An offer records what you are willing to pay for one exact listing. A Buy Now action
        starts checkout for that listing, where payment is processed by Stripe. The order advances
        once that payment is confirmed.
      </p>
      <p>
        Fees are snapshotted onto the order when it is created and are not recalculated afterwards.
        The applicable total is shown before payment.
      </p>
      <p>
        {brand.name} does not hold your funds and does not operate escrow. Seller payouts are
        delayed until delivery or completion is confirmed.
      </p>
    </>
  ),
  "seller-terms": (
    <>
      <p>
        A listing states a price for one specific item. You are responsible for describing the item
        accurately, providing clear photos, fulfilling it promptly after payment, and taking down
        the listing if the item is no longer available.
      </p>
      <p>
        Payout is recorded from the immutable order snapshot and marked pending until delivery is
        confirmed and the completion period has passed. A pending payout is never described as paid.
      </p>
    </>
  ),
  cancellation: (
    <>
      <p>
        Before payment evidence is recorded, either side may cancel and nothing is owed. Unpaid
        reservations release automatically and the listing returns to the market.
      </p>
      <p>
        If an item is unavailable or an order problem is confirmed, the order may be cancelled or
        refunded through the payment provider. Refunds and disputes can block or reverse completion
        and payout.
      </p>
    </>
  ),
  "prohibited-items": (
    <>
      <p>
        No stolen goods, counterfeit or illegal items, regulated goods offered without required
        authorization, unsafe hazardous materials, or listings for an item you do not hold or cannot
        lawfully sell. Sellers are responsible for following applicable laws.
      </p>
    </>
  ),
  "identity-verification": (
    <>
      <p>
        Some sellers may be asked to provide government-issued identity information so an operator
        or payment provider can confirm the person receiving marketplace payouts.
      </p>
      <p>
        Identity information is stored privately and is not shown to buyers or other members. Access
        is limited to authorized marketplace operations and payment-provider workflows.
      </p>
      <p>
        Identity information is retained only as long as needed for the account, payout and legal
        obligations described on this page.
      </p>
    </>
  ),
  "evidence-privacy": (
    <>
      <p>
        Listing photos, purchase receipts and delivery evidence live in private storage. The
        submitting seller or buyer and an authorized administrator may open the original file
        through a short-lived signed link when needed for an order or dispute.
      </p>
      <p>
        Buyers and sellers see order status and relevant confirmations — not payment-instrument
        information. {brand.name} never stores card numbers or bank
        credentials.
      </p>
    </>
  ),
  "contact-takedown": (
    <>
      <p>
        Use the contact us form for support, account questions, or a rights-holder takedown request.
        Include the listing URL and the specific content at issue.
      </p>
      <p>
        Listings may be removed when they violate these policies, applicable law, or a substantiated
        rights-holder request. Use the contact us form for support and takedown enquiries.
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
          rule the marketplace applies today. By creating an account, placing an offer, buying or
          listing an item, you agree to the sections that apply to
          you. If we change a rule, this page is updated and the effective date above changes.
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
