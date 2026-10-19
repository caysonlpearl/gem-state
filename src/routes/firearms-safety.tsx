import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowSquareOut, Flag, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

const title = "Firearm Listing & Transaction Safety";
const description =
  "Bluebird Marketplace guidance for safer, lawful firearm listings and private transactions.";

export const Route = createFileRoute("/firearms-safety")({
  head: () => ({
    meta: [
      { title: `${title} — ${brand.name}` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} — ${brand.name}` },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FirearmsSafetyPage,
});

const guidance = [
  {
    title: "Know the rules that apply",
    body: "Know and follow the federal, state, and local laws that apply to you, the other person, the firearm, and the location. If you are unsure, pause and ask a licensed firearms dealer or qualified legal professional.",
  },
  {
    title: "Check eligibility",
    body: "Do not transfer a firearm to someone you know, or have reasonable cause to believe, is prohibited by law from receiving or possessing it. Prohibited categories can include certain felony convictions, fugitives, some controlled-substance users, and some people subject to qualifying domestic-violence orders or convictions. Confirm the age and eligibility requirements for the specific transfer; rules can differ for private transfers and dealer sales.",
  },
  {
    title: "Handle interstate transfers carefully",
    body: "Do not directly transfer a firearm to an unlicensed person who lives in another state. Interstate transfers generally must go through a federally licensed firearms dealer in the recipient’s state.",
  },
  {
    title: "Walk away from suspicious items",
    body: "Do not buy or list stolen firearms or ammunition, firearms with removed or altered serial numbers, or items prohibited by law or Bluebird’s listing rules. If ownership or legality is unclear, stop and seek qualified guidance.",
  },
  {
    title: "Protect personal information",
    body: "Keep serial numbers, government IDs, exact home addresses, and other sensitive information out of public listings and photos. Never share passwords, bank details, card details, or one-time verification codes in a marketplace message.",
  },
  {
    title: "Make a safe plan",
    body: "Choose a well-lit public place for an in-person meeting. Consider arranging a transfer through a licensed dealer. Tell someone where you are going, and leave if you feel pressured, the other person appears impaired, or you feel unsafe.",
  },
];

function FirearmsSafetyPage() {
  useEffect(() => {
    void trackEvent("page_view", { route: "/firearms-safety" });
  }, []);

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-9 sm:px-8 sm:py-14">
      <Link
        to="/browse"
        search={{ category: "firearms" }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[12px] font-semibold text-primary transition-colors hover:bg-secondary"
      >
        <ArrowLeft size={15} weight="bold" aria-hidden="true" />
        Browse firearms
      </Link>

      <header className="relative mt-6 overflow-hidden rounded-[28px] border border-brand-blue/20 bg-secondary px-5 py-8 sm:px-10 sm:py-11">
        <span
          className="pointer-events-none absolute -right-16 -top-28 size-72 rounded-full bg-brand-blue/10"
          aria-hidden="true"
        />
        <div className="relative max-w-[780px]">
          <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            <ShieldCheck size={16} weight="fill" aria-hidden="true" /> Bluebird Marketplace Safety
          </p>
          <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-tight sm:text-[42px]">
            {title}
          </h1>
          <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-muted-foreground sm:text-[16px]">
            Practical reminders for people considering a firearm listing or private transaction.
            Bluebird provides listings and messaging; people arranging a transaction are responsible
            for following the law and making safe choices.
          </p>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="before-you-contact">
        <div className="flex items-start gap-3 rounded-2xl border border-brand-warm/50 bg-brand-warm/10 p-4 sm:p-5">
          <WarningCircle
            size={21}
            weight="fill"
            className="mt-0.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2 id="before-you-contact" className="text-[14px] font-bold">
              Before you contact a seller or arrange a transfer
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
              Bluebird does not sell, possess, transfer, broker, or process payment for firearms. A
              listing or message on Bluebird does not confirm that an item or transaction is lawful.
            </p>
          </div>
        </div>

        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {guidance.map((item, index) => (
            <li key={item.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-[11px] font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="text-[14px] font-bold">{item.title}</h2>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
                    {item.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-labelledby="official-guidance"
      >
        <h2 id="official-guidance" className="text-[18px] font-bold tracking-tight">
          Check official guidance
        </h2>
        <p className="mt-2 max-w-[75ch] text-[13px] leading-relaxed text-muted-foreground">
          Laws and exceptions depend on the details of a transfer. Review current federal guidance
          and consult a licensed dealer or qualified legal professional when you need help applying
          it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            [
              "ATF: Minimum age for sales and transfers",
              "https://www.atf.gov/resource-center/infographics/minimum-age-gun-sales-and-transfers",
            ],
            [
              "ATF: Firearms questions and answers",
              "https://www.atf.gov/firearms/questions-and-answers?field_q_a_category_target_id=8791&textsearch=",
            ],
            [
              "ATF: Identify prohibited persons",
              "https://www.atf.gov/firearms/tools-services-law-enforcement/identify-prohibited-persons",
            ],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-[11px] font-semibold text-primary hover:bg-secondary"
            >
              {label} <ArrowSquareOut size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <Flag
            size={20}
            weight="fill"
            className="mt-0.5 shrink-0 text-accent"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-[14px] font-bold">See something unsafe or suspicious?</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/75">
              Report the listing to Bluebird. If there is immediate danger, contact law enforcement.
            </p>
          </div>
        </div>
        <Link
          to="/contact"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-accent px-4 text-[12px] font-bold text-accent-foreground hover:opacity-90"
        >
          Report a concern
        </Link>
      </section>

      <p className="mx-auto mt-7 max-w-[82ch] text-center text-[11px] leading-relaxed text-muted-foreground">
        This page is for general awareness, not a complete legal checklist or legal advice. It does
        not replace checking the laws that apply to your situation. Bluebird may remove listings or
        restrict accounts that violate its rules or applicable law.
      </p>
    </main>
  );
}
