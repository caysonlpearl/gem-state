import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect } from "react";

import { brand } from "@/config/brand";
import { inline } from "@/components/guides/GuideArticle";
import {
  glossaryAnchor,
  glossaryReviewed,
  glossarySections,
  glossarySources,
} from "@/content/glossary";
import { trackEvent } from "@/lib/analytics";
import { jsonLdScript } from "@/lib/structured-data";

const title = "Glossary: Idaho buying and selling terms";
const description =
  "Plain-language definitions for buying and selling in Idaho: vehicle titles, liens, bills of sale, release of liability, title brands, rentals and deposits, job pay, and how Bluebird Marketplace works.";

export const Route = createFileRoute("/glossary")({
  head: () => ({
    meta: [
      { title: `${title} — ${brand.name}` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
    scripts: [
      jsonLdScript({
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        name: title,
        url: `${brand.urls.siteUrl}/glossary`,
        hasDefinedTerm: glossarySections.flatMap((section) =>
          section.terms.map((item) => ({
            "@type": "DefinedTerm",
            name: item.term,
            description: item.body.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
            url: `${brand.urls.siteUrl}/glossary#${glossaryAnchor(item.term)}`,
          })),
        ),
      }),
    ],
  }),
  component: GlossaryPage,
});

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
        Glossary
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        What the terms mean when you buy or sell in Idaho, and on {brand.name}. No jargon and no
        promises the platform can&apos;t keep.
      </p>

      <nav aria-label="Glossary sections" className="mt-6 flex flex-wrap gap-2">
        {glossarySections.map((section) => (
          <a
            key={section.heading}
            href={`#${glossaryAnchor(section.heading)}`}
            className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-4 text-[13px] font-medium hover:border-primary"
          >
            {section.heading}
          </a>
        ))}
      </nav>

      {glossarySections.map((section) => (
        <section
          key={section.heading}
          id={glossaryAnchor(section.heading)}
          className="mt-10 scroll-mt-24"
        >
          <h2 className="text-[20px] font-bold tracking-tight">{section.heading}</h2>
          <dl className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            {section.terms.map((item) => (
              <div
                key={item.term}
                id={glossaryAnchor(item.term)}
                className="hairline-b scroll-mt-24 px-5 py-5 last:border-b-0"
              >
                <dt className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] font-semibold tracking-tight">{item.term}</span>
                  <span className="text-[12px] text-muted-foreground">{item.short}</span>
                </dt>
                <dd className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {inline(item.body)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <div className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold tracking-tight">How payment works right now</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {brand.name} does not process payment or hold funds through the marketplace. Confirm the
          item, price, ownership, meeting or shipping details, and payment method directly with the
          seller. Bluebird does not authenticate or grade items.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/browse"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse listings
          </Link>
          <Link
            to="/guides"
            className="inline-flex h-9 items-center rounded-md border border-input px-4 text-[13px] font-medium transition-colors hover:bg-secondary"
          >
            Buying and selling guides
          </Link>
        </div>
      </div>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-[15px] font-bold">Sources</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Idaho fees, deadlines and rules were last checked against these sources on{" "}
          {new Date(`${glossaryReviewed}T12:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
          . They change; check with the agency before you rely on them. General information, not
          legal advice.
        </p>
        <ul className="mt-3 space-y-1.5 text-[13.5px]">
          {glossarySources.map((source) => (
            <li key={source.url} className="flex items-start gap-1.5">
              <ArrowSquareOut size={14} className="mt-1 shrink-0 text-muted-foreground" />
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2 hover:no-underline"
              >
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
