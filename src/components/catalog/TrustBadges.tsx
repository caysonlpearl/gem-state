import { Link } from "@tanstack/react-router";
import { ShieldCheck, Tag, Storefront } from "@phosphor-icons/react";

/**
 * ParkVault's own trust statements. Deliberately worded to claim only what the
 * platform actually does: no authentication service and no escrow.
 */
export function TrustBadges({ className = "" }: { className?: string }) {
  return (
    <section className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      <article className="border border-border bg-secondary/40 p-4">
        <ShieldCheck size={20} className="text-nav-accent" />
        <h3 className="mt-2.5 text-[13px] font-semibold">Buyer protection</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          If an item never ships, arrives materially different from the listing, or a Park Shopper
          cannot find it, the order is refunded in full. ParkVault does not operate escrow.
        </p>
        <Link
          to="/policies"
          hash="cancellation"
          className="mt-2 inline-block text-[11.5px] font-semibold underline underline-offset-[3px]"
        >
          Refund policy
        </Link>
      </article>

      <article className="border border-border bg-secondary/40 p-4">
        <Tag size={20} className="text-nav-accent" />
        <h3 className="mt-2.5 text-[13px] font-semibold">Condition stated by the seller</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          ParkVault does not authenticate or grade items. Every listing shows photos of the exact
          item in the seller&apos;s hands and the condition they declared.
        </p>
        <Link
          to="/glossary"
          className="mt-2 inline-block text-[11.5px] font-semibold underline underline-offset-[3px]"
        >
          How conditions work
        </Link>
      </article>

      <article className="border border-border bg-secondary/40 p-4">
        <Storefront size={20} className="text-nav-accent" />
        <h3 className="mt-2.5 text-[13px] font-semibold">Sell or shop the parks</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          List an item you already own, or get approved as a Park Shopper and earn a disclosed
          service fee sourcing items for other members.
        </p>
        <Link
          to="/sell"
          className="mt-2 inline-block text-[11.5px] font-semibold underline underline-offset-[3px]"
        >
          Start selling
        </Link>
      </article>
    </section>
  );
}
