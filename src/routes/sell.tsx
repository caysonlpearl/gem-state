import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  IdentificationCard,
  Package,
  Storefront,
} from "@phosphor-icons/react";

import { brand } from "@/config/brand";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/sell")({
  head: () => ({
    meta: [
      { title: `Sell on ${brand.name}` },
      {
        name: "description",
        content:
          "Create a verified seller profile, connect payouts and list cars, trucks, outdoor gear, tools, home goods and more across Idaho.",
      },
    ],
  }),
  component: SellLandingPage,
});

function SellLandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <main>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Gem State seller
            </p>
            <h1 className="mt-3 max-w-[760px] font-editorial text-[48px] font-normal leading-[0.98] tracking-[-0.045em] sm:text-[64px]">
              Turn what you own into a trusted local listing.
            </h1>
            <p className="mt-5 max-w-[650px] text-[14px] leading-relaxed text-muted-foreground">
              Build a seller profile, connect your payout account and list the exact item you own.
              Buyers across Idaho see your photos, price, condition, location and fulfillment record
              in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {isSignedIn ? (
                <Link
                  to="/selling"
                  className="inline-flex h-12 items-center gap-2 bg-primary px-5 text-[13px] font-semibold text-primary-foreground"
                >
                  Open Seller Center
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link
                  to="/auth"
                  search={{ redirect: "/selling", mode: "signup" }}
                  className="inline-flex h-12 items-center gap-2 bg-primary px-5 text-[13px] font-semibold text-primary-foreground"
                >
                  Become a Gem State seller
                  <ArrowRight size={16} />
                </Link>
              )}
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center border border-foreground px-5 text-[13px] font-semibold"
              >
                How selling works
              </a>
            </div>
          </div>

          <div className="border border-border bg-background p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Seller setup
            </p>
            <ol className="mt-5 space-y-5">
              <Step
                number="1"
                title="Create your seller profile"
                text="Add your photo, seller name, bio and private return address."
              />
              <Step
                number="2"
                title="Verify identity and payouts"
                text="Complete Stripe's hosted identity, tax and bank-account setup."
              />
              <Step
                number="3"
                title="Create your first listing"
                text="Choose a category, add exact-item photos, location, condition and your price."
              />
            </ol>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8">
        <div className="grid gap-px border border-border bg-border md:grid-cols-4">
          <Feature
            icon={<Storefront size={21} />}
            title="Your storefront"
            text="A public seller page with your listings, bio, reviews and sales history."
          />
          <Feature
            icon={<Camera size={21} />}
            title="Exact-item listings"
            text="Every listing carries its own photos, price, condition and fulfillment details."
          />
          <Feature
            icon={<IdentificationCard size={21} />}
            title="Verified payouts"
            text="Identity and banking details are collected in Stripe's secure hosted flow."
          />
          <Feature
            icon={<Package size={21} />}
            title="Shipping center"
            text="Find orders, shipping addresses, labels, tracking and payout status together."
          />
        </div>
        <div className="mt-8 flex items-start gap-2 border-l-2 border-primary pl-4 text-[12px] leading-relaxed text-muted-foreground">
          <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
          Gem State Classifieds never asks sellers to send government ID or bank details through
          messages. Those details belong in the connected payout provider's hosted form.
        </div>
      </section>
    </main>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
        {number}
      </span>
      <div>
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="bg-card p-5">
      <div className="text-primary">{icon}</div>
      <h2 className="mt-4 text-[13px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
