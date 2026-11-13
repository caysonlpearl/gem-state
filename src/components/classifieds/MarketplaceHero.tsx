import type { ReactNode, Ref } from "react";
/** The same homepage hero presentation is bundled by the web and native apps. */
export function MarketplaceHero({
  items: headlineItems,
  rotated: headlineRotated = false,
  headingRef: headlineRef,
  children,
}: {
  items: readonly string[];
  rotated?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <section className="classifieds-hero-shell homepage-hero-shell relative mt-6 overflow-hidden rounded-[28px] border border-brand-blue/20 bg-secondary px-4 py-4 shadow-lg sm:px-10 sm:py-8">
      <span
        className="classifieds-hero-orb classifieds-hero-orb--blue absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-blue/12"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-orb classifieds-hero-orb--warm absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-brand-warm/18"
        aria-hidden="true"
      />
      <span
        className="classifieds-hero-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/3 skew-x-[-18deg] bg-white/20"
        aria-hidden="true"
      />
      <div className="relative z-10">
        <div className="homepage-hero-top">
          <div className="min-w-0">
            <h1
              ref={headlineRef}
              className="homepage-hero-headline block max-w-[34ch] text-[22px] sm:mt-2 font-bold leading-[1.08] tracking-tight sm:text-[48px]"
            >
              {/* Phones: fixed three lines "Find A to / B to C / to D."
                Tablet/desktop: two lines "Find A to B to / C to D." */}
              <span className="whitespace-nowrap sm:whitespace-normal">
                Find{" "}
                <span
                  key={headlineItems.join("|")}
                  className={`${headlineRotated ? "classifieds-hero-rotating-item " : ""}text-brand-blue`}
                  aria-live="polite"
                >
                  {headlineItems[0]}
                </span>{" "}
                to
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> </span>
                {headlineItems[1]} to
                <br className="hidden sm:inline" />
                <span className="sm:hidden"> </span>
                {headlineItems[2]}
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> </span>
                to {headlineItems[3]}.
              </span>
            </h1>
            <p className="mt-1 max-w-[56ch] text-xs leading-snug text-muted-foreground sm:mt-1.5 sm:whitespace-nowrap sm:leading-relaxed">
              And so much more across Idaho and surrounding states.
            </p>
            <div
              className="classifieds-hero-accent mt-3 hidden sm:flex items-center gap-1.5"
              aria-hidden="true"
            >
              <span className="classifieds-hero-accent-bar h-1.5 w-9 rounded-full bg-brand-blue" />
              <span className="classifieds-hero-accent-bar classifieds-hero-accent-bar--warm h-1.5 w-5 rounded-full bg-brand-warm" />
              <span className="classifieds-hero-accent-bar h-1.5 w-2.5 rounded-full bg-brand-blue/60" />
            </div>
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}
