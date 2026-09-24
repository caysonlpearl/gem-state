import { Link } from "@tanstack/react-router";

import { brand, policyTopics } from "@/config/brand";
import { classifiedCategories, idahoRegions } from "@/config/classifieds";

/*
 * Dense multi-column footer for Gem State Classifieds. Columns are generated
 * from the classifieds taxonomy and Idaho regions; nothing is padded out with
 * placeholder links, review scores, or trust marks.
 */
const linkClass =
  "inline-block py-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground";
const headingClass = "text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

const motorsCategories = classifiedCategories.filter((c) => c.group === "motors");
const generalCategories = classifiedCategories.filter((c) => c.group === "classifieds");

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-secondary/45">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <h2 className={headingClass}>Cars &amp; motors</h2>
            <ul className="mt-2">
              {motorsCategories.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/browse"
                    search={{ category: c.slug }}
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
            <h2 className={headingClass}>Other classifieds</h2>
            <ul className="mt-2">
              {generalCategories.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/browse"
                    search={{ category: c.slug }}
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
            <h2 className={headingClass}>Idaho regions</h2>
            <ul className="mt-2">
              {idahoRegions.map((region) => (
                <li key={region}>
                  <Link to="/browse" search={{ q: region }} className={linkClass} {...pinned}>
                    {region}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className={headingClass}>Buying and selling</h2>
            <ul className="mt-2">
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
            <h2 className={headingClass}>Help and policies</h2>
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

        <div className="mt-12 border-t border-border pt-7">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {brand.legal.disclaimer}
          </p>
        </div>

        <p className="mt-5 text-[11.5px] text-muted-foreground">
          {brand.legal.copyright(new Date().getFullYear())}
        </p>
      </div>
    </footer>
  );
}
