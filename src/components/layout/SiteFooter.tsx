import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { brand, policyTopics } from "@/config/brand";
import { getCatalogFacets } from "@/lib/catalog.functions";
import { useHydrated } from "@/hooks/useHydrated";

/*
 * Dense multi-column footer. Resort and category columns are generated from
 * real catalog rows; nothing is padded out with placeholder links. There are no
 * app-store badges, review scores, social accounts or trust marks, because none
 * of those exist.
 */
const linkClass =
  "inline-block py-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground";
const headingClass = "text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground";
const pinned = { activeProps: { className: "" }, inactiveProps: { className: "" } } as const;

export function SiteFooter() {
  const facets = useQuery({
    queryKey: ["catalog-facets"],
    queryFn: () => getCatalogFacets(),
    staleTime: 5 * 60 * 1000,
  });
  // See SiteHeader: gate client-query data behind hydration.
  const hydrated = useHydrated();
  const geography = hydrated ? (facets.data?.geography ?? []) : [];
  const categories = hydrated ? (facets.data?.categories ?? []) : [];

  return (
    <footer className="mt-14 border-t border-border bg-surface">
      <div className="mx-auto max-w-[1360px] px-4 py-9 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <h2 className={headingClass}>Browse</h2>
            <ul className="mt-2">
              <li>
                <Link to="/browse" search={{}} className={linkClass} {...pinned}>
                  All products
                </Link>
              </li>
              <li>
                <Link to="/browse" search={{ sort: "newest" }} className={linkClass} {...pinned}>
                  New to catalog
                </Link>
              </li>
              {categories.slice(0, 8).map((c) => (
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
            <h2 className={headingClass}>Resorts and parks</h2>
            <ul className="mt-2">
              {geography.map((r) => (
                <li key={r.resortCode}>
                  <Link
                    to="/browse"
                    search={{ resort: r.resortCode }}
                    className={linkClass}
                    {...pinned}
                  >
                    {r.resortName}
                  </Link>
                </li>
              ))}
              {geography.flatMap((r) =>
                r.parks.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/browse"
                      search={{ resort: r.resortCode, park: p.slug }}
                      className={linkClass}
                      {...pinned}
                    >
                      {p.name}
                    </Link>
                  </li>
                )),
              )}
            </ul>
          </div>

          <div>
            <h2 className={headingClass}>Buying and selling</h2>
            <ul className="mt-2">
              <li>
                <Link to="/glossary" className={linkClass} {...pinned}>
                  How listings and offers work
                </Link>
              </li>
              <li>
                <Link to="/buying" className={linkClass} {...pinned}>
                  Your purchase requests
                </Link>
              </li>
              <li>
                <Link to="/sell" className={linkClass} {...pinned}>
                  Your listings and sales
                </Link>
              </li>
              <li>
                <Link to="/watchlist" className={linkClass} {...pinned}>
                  Watchlist
                </Link>
              </li>
              <li>
                <Link to="/suggest" className={linkClass} {...pinned}>
                  Suggest a missing product
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className={headingClass}>Park shoppers</h2>
            <ul className="mt-2">
              <li>
                <Link to="/shopper" className={linkClass} {...pinned}>
                  Apply to source in park
                </Link>
              </li>
              <li>
                <Link to="/policies" hash="shopper-terms" className={linkClass} {...pinned}>
                  Park shopper terms
                </Link>
              </li>
              <li>
                <Link to="/policies" hash="identity-verification" className={linkClass} {...pinned}>
                  Government ID: purpose and access
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className={headingClass}>Help and policies</h2>
            <ul className="mt-2">
              <li>
                <Link to="/glossary" className={linkClass} {...pinned}>
                  Glossary
                </Link>
              </li>
              <li>
                <Link to="/contact" className={linkClass} {...pinned}>
                  Contact us
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

        <div className="mt-9 border-t border-border pt-6">
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
