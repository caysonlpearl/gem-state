import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Buildings,
  Briefcase,
  ChartLineUp,
  CheckCircle,
  Car,
  MapPin,
  Megaphone,
  Storefront,
  UsersThree,
  Wrench,
} from "@phosphor-icons/react";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { trackEvent } from "@/lib/analytics";

const title = `Advertise with ${brand.name}`;
const description =
  "Reach local Idaho buyers, sellers, homeowners, job seekers, and service customers with Gem State Classifieds.";

export const Route = createFileRoute("/advertise")({
  head: () => ({
    meta: [
      { title: `${title} — reach local Idaho buyers` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvertisePage,
});

const audiences = [
  { label: "Dealerships", icon: Car },
  { label: "Local businesses", icon: Storefront },
  { label: "Service providers", icon: Wrench },
  { label: "Employers", icon: Briefcase },
  { label: "Community organizations", icon: UsersThree },
];

const opportunities = [
  {
    eyebrow: "Marketplace visibility",
    title: "Featured placements",
    body: "Put a business, collection, service, or promotion in front of people already browsing the marketplace. We can shape the placement around your goal and audience.",
    icon: Megaphone,
    tag: "Conversation-based",
  },
  {
    eyebrow: "For dealerships",
    title: "Inventory that stays current",
    body: "Start with a sample CSV, XML, or JSON feed. GemList can map the source fields, preview changes, and reconcile new, changed, sold, and removed vehicles before a live connection.",
    icon: Car,
    tag: "Feed pilots welcome",
  },
  {
    eyebrow: "Local services",
    title: "Be found when help is needed",
    body: "Make your service easier to discover alongside local listings for homes, cars, projects, and everyday needs. Highlight the areas and work you serve.",
    icon: Wrench,
    tag: "Built for local reach",
  },
  {
    eyebrow: "Hiring locally",
    title: "Promote open roles",
    body: "Reach candidates looking for work by role, pay, schedule, and region. Share the details that help the right person decide to apply.",
    icon: Briefcase,
    tag: "Jobs and employers",
  },
];

const benefits = [
  "A marketplace organized around local intent, not a generic ad feed.",
  "Clear paths to cars, classifieds, homes, jobs, and services.",
  "Direct seller and business contact options when a visitor is ready to act.",
  "Flexible pilots for businesses that want to learn before committing to a larger campaign.",
];

function AdvertisePage() {
  useEffect(() => {
    void trackEvent("page_view", { route: "/advertise" });
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-primary text-primary-foreground">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-warm/25" />
        <div className="pointer-events-none absolute -bottom-40 left-[38%] h-80 w-80 rounded-full border-[38px] border-white/5" />
        <div className="relative mx-auto grid max-w-[1240px] gap-10 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              GemList for business
            </p>
            <h1 className="mt-4 max-w-[700px] text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Put your business in front of local buyers.
            </h1>
            <p className="mt-6 max-w-[620px] text-[16px] leading-relaxed text-primary-foreground/75 sm:text-[18px]">
              Reach people across Idaho who are already looking for a vehicle, a home, a service, a
              job, or their next local find. Tell us what you want to promote and we will help shape
              the right starting point.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-[13px] font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                Start a conversation
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
              <Link
                to="/browse"
                className="inline-flex h-11 items-center rounded-md border border-primary-foreground/35 px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Explore the marketplace
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-primary-foreground/65">
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} weight="bold" aria-hidden="true" />
                Idaho-first audience
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Buildings size={15} weight="bold" aria-hidden="true" />
                Local categories
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ChartLineUp size={15} weight="bold" aria-hidden="true" />
                Practical pilots
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[480px]">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur-sm">
              <div className="rounded-xl bg-background p-5 text-foreground sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Local discovery
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      Meet people at the moment they are looking.
                    </h2>
                  </div>
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/20 text-primary">
                    <Megaphone size={23} weight="duotone" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-7 space-y-3">
                  {[
                    ["Cars", "Dealers and local inventory"],
                    ["Services", "Projects and trusted local help"],
                    ["Jobs", "Open roles in the community"],
                  ].map(([label, detail]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                    >
                      <span className="text-[13px] font-semibold">{label}</span>
                      <span className="text-right text-[11px] text-muted-foreground">{detail}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
                  We are building useful, transparent ways for local businesses to show up without
                  losing the marketplace experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8 sm:py-20">
        <section aria-labelledby="audience-heading">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Who it is for
          </p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <h2
              id="audience-heading"
              className="max-w-[650px] text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Built for the businesses that make a place feel local.
            </h2>
            <p className="max-w-[360px] text-[13px] leading-relaxed text-muted-foreground">
              Whether you sell inventory, offer expertise, or are hiring, we can start with a clear
              goal and a focused audience.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {audiences.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 shadow-sm"
              >
                <Icon
                  size={21}
                  weight="duotone"
                  className="shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="text-[13px] font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="opportunities-heading">
          <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Ways to work together
              </p>
              <h2
                id="opportunities-heading"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Start with the opportunity that fits.
              </h2>
            </div>
            <span className="text-[12px] text-muted-foreground">
              Flexible starting points for local partners
            </span>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {opportunities.map(({ eyebrow, title, body, icon: Icon, tag }) => (
              <article
                key={title}
                className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md sm:p-7"
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={23} weight="duotone" aria-hidden="true" />
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {tag}
                  </span>
                </div>
                <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  {eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
                <Link
                  to="/contact"
                  className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
                >
                  Talk about this option
                  <ArrowRight size={15} weight="bold" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mt-20 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start"
          aria-labelledby="benefits-heading"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Why GemList
            </p>
            <h2
              id="benefits-heading"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Useful attention beats empty impressions.
            </h2>
            <p className="mt-4 max-w-[470px] text-[14px] leading-relaxed text-muted-foreground">
              GemList is designed around the next local action: compare an option, ask a question,
              schedule a conversation, apply, or find the right help.
            </p>
          </div>
          <ul className="grid gap-3 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 sm:p-7">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3 text-[13px] leading-relaxed text-foreground">
                <CheckCircle
                  size={19}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20" aria-labelledby="process-heading">
          <div className="border-b border-border pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              A simple starting point
            </p>
            <h2
              id="process-heading"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              From idea to local reach in three steps.
            </h2>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              [
                "01",
                "Tell us your goal",
                "Share what you are promoting, who you want to reach, and the communities or categories that matter.",
              ],
              [
                "02",
                "Choose a starting point",
                "We will outline a practical placement, feed pilot, or local promotion that matches your current needs.",
              ],
              [
                "03",
                "Learn and expand",
                "Review what is working, refine the audience, and decide whether a larger campaign or ongoing partnership makes sense.",
              ],
            ].map(([number, heading, body]) => (
              <div key={number} className="rounded-2xl border border-border bg-card p-6 sm:p-7">
                <span className="text-3xl font-semibold tracking-tight text-accent">{number}</span>
                <h3 className="mt-7 text-lg font-semibold tracking-tight">{heading}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-20 rounded-2xl bg-secondary p-6 sm:p-10"
          aria-labelledby="faq-heading"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Questions, answered
          </p>
          <h2 id="faq-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Before you reach out
          </h2>
          <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
            {[
              [
                "Who is a good fit?",
                "Dealerships, local businesses, service providers, employers, and community organizations that want to reach people in Idaho.",
              ],
              [
                "Do you have a fixed advertising rate card?",
                "Not yet. We would rather understand the audience, placement, and goal first than promise a package that does not fit. Contact us to discuss a pilot.",
              ],
              [
                "Can a dealership connect its inventory?",
                "Yes, we can start by reviewing a sample feed and mapping it before any live connection. CSV is the easiest first step; XML, JSON, API, or SFTP adapters can follow when the source is known.",
              ],
              [
                "Can I promote a job or service instead of a product?",
                "Yes. GemList includes jobs, services, homes, cars, and classifieds, so the starting point can be built around the kind of local action you want.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
                  {question}
                  <span className="text-xl font-normal text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-[780px] pt-3 text-[13px] leading-relaxed text-muted-foreground">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="mt-14 overflow-hidden rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground sm:px-10 sm:py-14"
          aria-labelledby="cta-heading"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Let’s make it useful
          </p>
          <h2
            id="cta-heading"
            className="mx-auto mt-3 max-w-[700px] text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Tell us what you want local customers to do next.
          </h2>
          <p className="mx-auto mt-4 max-w-[600px] text-[14px] leading-relaxed text-primary-foreground/70">
            We will help you choose a focused starting point for GemList instead of sending you a
            generic media kit.
          </p>
          <Link
            to="/contact"
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-[13px] font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            Contact the GemList team
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </div>
  );
}
