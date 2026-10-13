import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { guides } from "@/content/guides";

const title = `Idaho buying and selling guides — ${brand.name}`;
const description =
  "Plain-language guides to buying and selling in Idaho: titles, bills of sale, release of liability, sales tax and staying safe, checked against official sources.";

export const Route = createFileRoute("/guides/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: GuidesIndex,
});

function GuidesIndex() {
  return (
    <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
        Idaho buying and selling guides
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Step-by-step help with the paperwork and safety side of buying and selling locally. Every
        fee, form and deadline links to the official Idaho source it came from.
      </p>
      <ul className="mt-8 space-y-4">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <a
              href={`/guides/${guide.slug}`}
              className="group block rounded-2xl border border-border bg-card px-5 py-4 transition hover:border-primary"
            >
              <h2 className="text-[17px] font-bold tracking-tight group-hover:text-primary">
                {guide.title}
              </h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                {guide.description}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                Read the guide <ArrowRight size={13} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
