import type { ReactNode } from "react";
import { ArrowSquareOut, CaretRight, Info } from "@phosphor-icons/react";

import type { Guide, GuideBlock } from "@/content/guides";

const linkClass = "font-medium text-primary underline underline-offset-2 hover:no-underline";

/** Renders **bold** and [label](href) inside guide text. */
export function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    if (match[1]) {
      parts.push(
        <strong key={index} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else {
      const href = match[3]!;
      const external = /^https?:\/\//.test(href);
      parts.push(
        <a
          key={index}
          href={href}
          className={linkClass}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {match[2]}
        </a>,
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Block({ block }: { block: GuideBlock }) {
  if (block.kind === "p") return <p>{inline(block.text)}</p>;
  if (block.kind === "note") {
    return (
      <div className="flex gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3.5 text-[14.5px]">
        <Info size={18} weight="fill" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>{inline(block.text)}</p>
      </div>
    );
  }
  if (block.kind === "steps") {
    return (
      <ol className="space-y-3">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span className="numeric mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span>{inline(item)}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
      {block.items.map((item, index) => (
        <li key={index}>{inline(item)}</li>
      ))}
    </ul>
  );
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function GuideArticle({ guide }: { guide: Guide }) {
  return (
    <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
      >
        <a href="/guides" className="hover:text-foreground">
          Guides
        </a>
        <CaretRight size={13} aria-hidden="true" />
        <span className="truncate text-foreground">{guide.title}</span>
      </nav>

      <article className="mt-4">
        <header>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[38px]">
            {guide.title}
          </h1>
          <p className="mt-3 text-[13px] text-muted-foreground">
            By the <span className="font-medium text-foreground">Bluebird Marketplace</span> team ·
            Last checked against official sources {formatDate(guide.reviewed)}
          </p>
        </header>

        <p className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-[16px] leading-relaxed">
          {guide.answer}
        </p>

        <div className="mt-8 space-y-10 text-[15.5px] leading-relaxed text-foreground/90">
          {guide.sections.map((section) => (
            <section key={section.heading} className="space-y-4">
              <h2 className="text-[22px] font-bold tracking-tight text-foreground">
                {section.heading}
              </h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </section>
          ))}

          {guide.faqs.length ? (
            <section className="space-y-4">
              <h2 className="text-[22px] font-bold tracking-tight text-foreground">
                Common questions
              </h2>
              <dl className="space-y-5">
                {guide.faqs.map((faq) => (
                  <div key={faq.question}>
                    <dt className="font-semibold text-foreground">{faq.question}</dt>
                    <dd className="mt-1">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <section className="mt-12 border-t border-border pt-6">
          <h2 className="text-[15px] font-bold">Sources</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Fees and forms change. Check with the Idaho Transportation Department or your county
            assessor&apos;s motor vehicle office before you file. This guide is general information,
            not legal advice.
          </p>
          <ul className="mt-3 space-y-1.5 text-[13.5px]">
            {guide.sources.map((source) => (
              <li key={source.url} className="flex items-start gap-1.5">
                <ArrowSquareOut size={14} className="mt-1 shrink-0 text-muted-foreground" />
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {guide.related.length ? (
          <nav aria-label="Related" className="mt-8 flex flex-wrap gap-2">
            {guide.related.map((link) => (
              <a
                key={link.path}
                href={link.path}
                className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-4 text-[13px] font-medium hover:border-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </article>
    </main>
  );
}
