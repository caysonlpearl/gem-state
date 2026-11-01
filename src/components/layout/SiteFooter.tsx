import { Link } from "@tanstack/react-router";
import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { categoryUrlSlug, placeSlug } from "@/lib/place-pages";

import { brand, policyTopics } from "@/config/brand";
import { classifiedCategories, idahoCities } from "@/config/classifieds";

// Native disclosures keep the complete link directory in the server-rendered
// HTML while letting readers choose when to expand it, even without JavaScript.
const linkClass =
  "inline-flex min-h-9 items-center py-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground hover:underline";
const headingClass = "text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground";
const quickLinkClass =
  "inline-flex min-h-11 items-center text-[12.5px] font-semibold text-primary underline-offset-4 hover:underline";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

const motorsCategories = classifiedCategories.filter((c) => c.group === "motors");
const generalCategories = classifiedCategories.filter((c) => c.group === "classifieds");

function FooterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group min-w-0 self-start rounded-xl border border-border bg-card/50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 hover:bg-secondary [&::-webkit-details-marker]:hidden">
        <h2 className="text-[12.5px] font-semibold text-foreground">{title}</h2>
        <CaretDown
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border bg-secondary/45">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-8 sm:py-6">
        <nav aria-label="Footer quick links" className="flex flex-wrap gap-x-6 gap-y-0.5">
          <Link to="/create-listing" className={quickLinkClass} {...pinned}>
            Post a listing
          </Link>
          <a href="/news" className={quickLinkClass}>
            News &amp; guides
          </a>
          <Link to="/contact" className={quickLinkClass} {...pinned}>
            Contact us
          </Link>
          <a href={`mailto:${brand.supportEmail}`} className={`${quickLinkClass} break-all`}>
            {brand.supportEmail}
          </a>
          <Link to="/policies" className={quickLinkClass} {...pinned}>
            Privacy &amp; terms
          </Link>
        </nav>
        <nav aria-label="Bluebird link directory" className="mt-3 grid gap-3 md:grid-cols-3">
          <FooterGroup title="Browse categories">
            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <div>
                <h3 className={headingClass}>Cars &amp; motors</h3>
                <ul className="mt-2">
                  {motorsCategories.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to="/idaho/$place"
                        params={{ place: categoryUrlSlug(c.slug) }}
                        className={linkClass}
                        {...pinned}
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className={headingClass}>Other classifieds</h3>
                <ul className="mt-2">
                  {generalCategories.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to="/idaho/$place"
                        params={{ place: categoryUrlSlug(c.slug) }}
                        className={linkClass}
                        {...pinned}
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FooterGroup>

          <FooterGroup title="Browse Idaho cities">
            <ul className="grid grid-cols-2 gap-x-3">
              {idahoCities.map((city) => (
                <li key={city}>
                  <Link
                    to="/idaho/$place"
                    params={{ place: placeSlug(city) }}
                    className={linkClass}
                    {...pinned}
                  >
                    {city}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterGroup>

          <FooterGroup title="Help & account">
            <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <div>
                <h3 className={headingClass}>Buying and selling</h3>
                <ul className="mt-2">
                  <li>
                    <a href="/news" className={linkClass}>
                      Bluebird Local news &amp; guides
                    </a>
                  </li>
                  <li>
                    <Link to="/create-listing" className={linkClass} {...pinned}>
                      Post a listing
                    </Link>
                  </li>
                  <li>
                    <Link to="/selling" className={linkClass} {...pinned}>
                      Your listings and sales
                    </Link>
                  </li>
                  <li>
                    <Link to="/buying" className={linkClass} {...pinned}>
                      Your purchases
                    </Link>
                  </li>
                  <li>
                    <Link to="/watchlist" className={linkClass} {...pinned}>
                      Saved listings
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className={headingClass}>Help and policies</h3>
                <ul className="mt-2">
                  <li>
                    <Link to="/contact" className={linkClass} {...pinned}>
                      Contact us
                    </Link>
                  </li>
                  <li>
                    <Link to="/advertise" className={linkClass} {...pinned}>
                      Advertise with us
                    </Link>
                  </li>
                  <li>
                    <Link to="/safety" className={linkClass} {...pinned}>
                      Safety center
                    </Link>
                  </li>
                  <li>
                    <Link to="/firearms-safety" className={linkClass} {...pinned}>
                      Firearm safety statement
                    </Link>
                  </li>
                  <li>
                    <Link to="/guides" className={linkClass} {...pinned}>
                      Buying and selling guides
                    </Link>
                  </li>
                  {policyTopics.map((topic) => (
                    <li key={topic.slug}>
                      <Link to="/policies" hash={topic.slug} className={linkClass} {...pinned}>
                        {topic.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FooterGroup>
        </nav>

        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11.5px] leading-5 text-muted-foreground">{brand.legal.disclaimer}</p>
        </div>

        <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">
          {brand.legal.copyright(new Date().getFullYear())}
        </p>
      </div>
    </footer>
  );
}
