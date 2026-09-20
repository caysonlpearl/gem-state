import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChatCircleText,
  CheckCircle,
  CreditCard,
  Flag,
  HandPalm,
  LockKey,
  MapPin,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

const title = `${brand.name} Safety Center`;
const description =
  "Learn how to spot common marketplace scams, stay safer when buying or selling, and report a problem on Gem State Classifieds.";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: `${title} — scam awareness and safer marketplace habits` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SafetyPage,
});

const scamSignals = [
  {
    title: "Overpayment or refund tricks",
    signal:
      "A buyer sends too much, asks you to refund the difference, or says a payment is pending.",
    action:
      "Do not send money back based on a screenshot or email. Confirm funds directly with the payment provider before handing anything over.",
    icon: CreditCard,
  },
  {
    title: "Urgency and pressure",
    signal:
      "Someone demands a deposit immediately, refuses reasonable questions, or says several people are waiting.",
    action:
      "Slow down. Verify the item, the person, the price, and the meeting details before you commit.",
    icon: WarningCircle,
  },
  {
    title: "Off-platform links and requests",
    signal:
      "A message asks you to click a delivery link, share a login code, or continue through an unfamiliar site.",
    action:
      "Do not share passwords, one-time codes, card details, or bank credentials. Open GemList directly instead of using an unexpected link.",
    icon: LockKey,
  },
  {
    title: "Fake shipping or courier stories",
    signal:
      "A buyer claims a courier will collect the item and asks you to pay an insurance, release, or verification fee.",
    action:
      "Stop and verify independently. GemList does not require a seller to pay a fee to release a buyer's payment.",
    icon: ChatCircleText,
  },
  {
    title: "Too-good-to-be-true listings",
    signal:
      "The price is far below comparable listings, photos look copied, or the seller avoids specific questions.",
    action:
      "Compare details, request current photos, verify ownership when appropriate, and walk away if the story does not add up.",
    icon: ShieldCheck,
  },
  {
    title: "Unsafe or suspicious meetups",
    signal:
      "The other person changes the location, insists on an isolated meeting, or will not let you inspect the item.",
    action:
      "Meet in a public place, bring someone when possible, tell someone where you are going, and never trade safety for a deal.",
    icon: MapPin,
  },
];

const protections = [
  {
    title: "Account-controlled contact",
    body: "Marketplace messages are connected to the listing and protected by account access. Keep important conversation details inside GemList.",
    icon: ChatCircleText,
  },
  {
    title: "Listing reports",
    body: "Use Flag This Listing when content appears fraudulent, unsafe, prohibited, misleading, or otherwise out of bounds.",
    icon: Flag,
  },
  {
    title: "Moderation review",
    body: "Reports and listings can be reviewed by marketplace operations. Listings may be removed when they violate policy or applicable law.",
    icon: ShieldCheck,
  },
  {
    title: "No card collection in direct contact",
    body: "The current direct-contact marketplace flow does not collect card numbers or bank credentials. Never send those details in a message.",
    icon: LockKey,
  },
];

const buyerChecklist = [
  "Ask specific questions about condition, ownership, availability, and location.",
  "Compare the price and photos with similar listings.",
  "Inspect the item before paying when an in-person inspection is possible.",
  "Use a public meeting location and tell someone your plans.",
  "Never pay a fee to unlock, verify, insure, or release a payment.",
];

const sellerChecklist = [
  "Use your own current photos and describe the item accurately.",
  "Do not accept a screenshot as proof that money has cleared.",
  "Do not share a login code, password, bank detail, or government ID in a message.",
  "Confirm pickup, shipping, and payment details before releasing the item.",
  "Remove or deactivate the listing when it is no longer available.",
];

function SafetyPage() {
  useEffect(() => {
    void trackEvent("page_view", { route: "/safety" });
  }, []);

  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-border bg-primary text-primary-foreground">
        <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-brand-warm/25" />
        <div className="pointer-events-none absolute -bottom-44 left-[38%] size-96 rounded-full border-[42px] border-white/5" />
        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-8 sm:py-20">
          <div className="max-w-[760px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
              <ShieldCheck size={16} weight="fill" aria-hidden="true" />
              GemList Safety Center
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Stay one step ahead of the scam.
            </h1>
            <p className="mt-5 max-w-[680px] text-[16px] leading-relaxed text-primary-foreground/75 sm:text-[18px]">
              Most marketplace scams rely on pressure, secrecy, or a request that does not make
              sense. Use this guide before you buy, sell, meet, or send money.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#common-scams"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-[13px] font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                See common scams
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </a>
              <Link
                to="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-primary-foreground/35 px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Report a concern
              </Link>
            </div>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              ["Before you pay", "Verify the person, item, and payment."],
              ["Before you meet", "Choose a public, safe location."],
              ["When in doubt", "Stop, save evidence, and report it."],
            ].map(([label, body]) => (
              <div
                key={label}
                className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"
              >
                <p className="text-[13px] font-semibold">{label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/65">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8 sm:py-20">
        <section id="common-scams" className="scroll-mt-24" aria-labelledby="scams-heading">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Know the pattern
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
            <h2
              id="scams-heading"
              className="max-w-[680px] text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Common marketplace scams and what to do instead.
            </h2>
            <p className="max-w-[330px] text-[13px] leading-relaxed text-muted-foreground">
              A legitimate buyer or seller should be able to answer reasonable questions without
              rushing you.
            </p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scamSignals.map(({ title: scamTitle, signal, action, icon: Icon }) => (
              <article
                key={scamTitle}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
                  <Icon size={23} weight="duotone" aria-hidden="true" />
                </div>
                <h3 className="mt-6 text-[17px] font-semibold tracking-tight">{scamTitle}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{signal}</p>
                <div className="mt-5 rounded-xl bg-secondary p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                    Do this instead
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">{action}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="protections-heading">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            What GemList does
          </p>
          <h2
            id="protections-heading"
            className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Helpful protections, with clear limits.
          </h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {protections.map(({ title: protectionTitle, body, icon: Icon }) => (
              <article
                key={protectionTitle}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <Icon size={24} weight="duotone" className="text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{protectionTitle}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-5 lg:grid-cols-2" aria-label="GemList safety boundaries">
          <div className="rounded-2xl border border-primary/20 bg-primary p-6 text-primary-foreground sm:p-8">
            <div className="flex items-center gap-3">
              <CheckCircle size={24} weight="fill" className="text-accent" aria-hidden="true" />
              <h2 className="text-2xl font-semibold tracking-tight">What we can help with</h2>
            </div>
            <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-primary-foreground/80">
              {[
                "Reviewing a listing report or suspicious message.",
                "Pointing you to the relevant marketplace policy.",
                "Protecting account and listing surfaces with access controls.",
                "Connecting you with support when something on GemList looks wrong.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <HandPalm
                size={24}
                weight="duotone"
                className="text-destructive"
                aria-hidden="true"
              />
              <h2 className="text-2xl font-semibold tracking-tight">What we do not do</h2>
            </div>
            <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              {[
                "We do not inspect, authenticate, or guarantee an item or seller.",
                "We do not provide escrow or hold funds in the current direct-contact flow.",
                "We do not recover money sent directly to another person.",
                "We will never ask for your password, one-time code, or full card number by message.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <WarningCircle
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="checklists-heading">
          <div className="border-b border-border pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Use before you act
            </p>
            <h2
              id="checklists-heading"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Two quick safety checklists.
            </h2>
          </div>
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            {(
              [
                ["Buying", "Before you send money or meet", buyerChecklist],
                ["Selling", "Before you release an item", sellerChecklist],
              ] as const
            ).map(([label, subtitle, items]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  {label}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{subtitle}</h3>
                <ul className="mt-6 space-y-3">
                  {(items as string[]).map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground"
                    >
                      <CheckCircle
                        size={18}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-20 rounded-2xl bg-secondary p-6 sm:p-10"
          aria-labelledby="incident-heading"
        >
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Something happened?
              </p>
              <h2
                id="incident-heading"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Stop, save, report.
              </h2>
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
                If you think you encountered a scam, stop communicating and do not send more money.
                Save the listing URL, messages, usernames, receipts, and screenshots.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/contact"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Contact GemList
                  <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </Link>
                <Link
                  to="/policies"
                  hash="contact-takedown"
                  className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-[13px] font-semibold hover:bg-background"
                >
                  Read reporting policy
                </Link>
              </div>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["01", "Stop", "Do not click, pay, refund, or share more information."],
                ["02", "Preserve", "Keep the listing, conversation, and payment evidence."],
                [
                  "03",
                  "Report",
                  "Flag the listing and contact the payment provider if money moved.",
                ],
              ].map(([number, heading, body]) => (
                <li key={number} className="rounded-xl border border-border bg-card p-4">
                  <span className="text-2xl font-semibold text-accent">{number}</span>
                  <h3 className="mt-4 text-[14px] font-semibold">{heading}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="safety-faq-heading">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            More answers
          </p>
          <h2
            id="safety-faq-heading"
            className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Safety questions
          </h2>
          <div className="mt-7 divide-y divide-border rounded-xl border border-border bg-card">
            {[
              [
                "Should I pay before seeing the item?",
                "For local transactions, inspect the item and confirm the details before paying whenever possible. Never pay an unexplained fee to unlock or release a payment.",
              ],
              [
                "What if a seller wants to move the conversation off GemList?",
                "Use your judgment and keep the conversation on GemList while you evaluate the listing. Do not follow unexpected links or share credentials, codes, or financial information.",
              ],
              [
                "Does GemList verify every seller or item?",
                "No. GemList provides a marketplace and moderation surfaces, but does not inspect, authenticate, or guarantee sellers or items. You are responsible for evaluating the transaction.",
              ],
              [
                "Where do I report a suspicious listing?",
                "Use Flag This Listing on the listing page. You can also contact GemList with the listing URL and a description of what looks wrong.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
                  {question}
                  <span className="text-xl font-normal text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-[820px] pt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
