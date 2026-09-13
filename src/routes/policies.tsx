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
          "ParkVault policies: non-affiliation with The Walt Disney Company, what data is stored, buyer, seller and park shopper terms, cancellation rules, prohibited items, identity verification and takedown contact.",
      },
      { property: "og:title", content: `Policies and disclosures — ${brand.name}` },
      {
        property: "og:description",
        content:
          "Read ParkVault's non-affiliation statement, privacy explanation, buyer, seller and shopper terms, cancellation rules and takedown contact.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Policies,
});

function policyBodies(): Record<string, React.ReactNode> {
  return {
  "non-affiliation": (
    <>
      <p>{brand.legal.disclaimer}</p>
      <p>
        {brand.name} does not sell, manufacture or authenticate on behalf of any rights holder. All
        catalog entries are descriptive records created so members can refer to the same item.
      </p>
    </>
  ),
  privacy: (
    <>
      <p>
        We store the account email held by our authentication provider, the display name and
        shopping intent you enter, your marketplace activity, and — only when you take part in a
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
        An offer records what you are willing to pay. A Buy Now action reserves the listing and
        takes you to checkout, where payment is processed by Stripe. The order advances once that
        payment is confirmed.
      </p>
      <p>
        Fees are snapshotted onto the order when a match is created and never recalculated
        afterwards. For a park-sourced order you approve a maximum purchase cost in advance; a
        shopper may not exceed it without your explicit approval of a revised maximum.
      </p>
      <p>
        {brand.name} does not hold your funds and does not operate escrow. Payouts to sellers and
        shoppers are delayed until delivery is confirmed.
      </p>
    </>
  ),
  "seller-terms": (
    <>
      <p>
        A listing states a fixed price for one exact variation you already hold. You are responsible
        for describing the item accurately, shipping it promptly once a match is confirmed, and
        cancelling your listing if the item is no longer available.
      </p>
      <p>
        Payout is recorded from the immutable order snapshot and marked pending until delivery is
        confirmed and the completion period has passed. A pending payout is never described as paid.
      </p>
    </>
  ),
  "shopper-terms": (
    <>
      <p>
        Park shoppers are approved individually after identity verification. Availability means you
        are willing to attempt a purchase inside the window you disclosed — it never claims that the
        merchandise is in stock.
      </p>
      <p>
        You may not be instructed to purchase until external evidence confirms the buyer's full
        payment obligation is committed. You must submit a purchase receipt and item photograph, and
        must not exceed the buyer-approved maximum without an approved revision.
      </p>
      <p>
        Your compensation is the flat fee shown on the option at the time it was selected, plus
        reimbursement of the merchandise cost and agreed shipping. It is frozen when the transaction
        is created.
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
        If a park shopper cannot find the item, the order is closed as unavailable and any external
        payment is refunded through the same external provider. Refunds and disputes block or
        reverse completion and payout.
      </p>
    </>
  ),
  "prohibited-items": (
    <>
      <p>
        No counterfeit or replica merchandise, no stolen goods, no items obtained by breaking park
        rules or purchase limits, no food or perishable items, no gift cards or park admission
        media, and no listings for an item you do not hold or cannot lawfully resell.
      </p>
    </>
  ),
  "identity-verification": (
    <>
      <p>
        Applicants to source in park upload a government-issued photo ID so an operator can confirm
        the person accepting funds and buyer instructions is a real, identifiable adult.
      </p>
      <p>
        The file is written to private storage. The applicant can reopen their own upload; reviewers
        access it through an audited internal channel, and every administrative access is logged. It
        is never shown to buyers, sellers or other shoppers, and is never used for marketing.
      </p>
      <p>
        Documents are retained only while an application or approval is active, and are removed when
        an application is withdrawn or approval ends.
      </p>
    </>
  ),
  "evidence-privacy": (
    <>
      <p>
        Purchase receipts, item photographs and delivery evidence live in private storage. The
        submitting shopper or seller and an authorised administrator may open the original file
        through a short-lived signed link.
      </p>
      <p>
        Buyers see the verified purchase amount and item confirmation — not the receipt itself, and
        never payment-instrument information. {brand.name} never stores card numbers or bank
        credentials.
      </p>
    </>
  ),
  "contact-takedown": (
    <>
      <p>
        Use the contact us form for support, account questions, or a rights-holder takedown request.
        Include the product page address and the specific content at issue.
      </p>
      <p>
        Catalog entries are removed on a substantiated rights-holder request. Use the contact us
        form for press and partnership enquiries.
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
          These are the terms that govern buying, selling and park sourcing on {brand.name}. Each
          section states a rule the marketplace applies today. By creating an account, placing an
          offer, buying, listing an item or sourcing in park, you agree to the sections that apply to
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
