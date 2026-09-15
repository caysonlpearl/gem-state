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
          "Create a seller profile and list cars, trucks, outdoor gear, tools, home goods and more across Idaho.",
      },
    ],
  }),
  component: SellLandingPage,
});

function SellLandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <main>
      <section className="border-b border-border bg-secondary/45">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Gem State seller
            </p>
            <h1 className="mt-4 max-w-[760px] font-editorial text-[48px] font-normal leading-[1] tracking-[-0.045em] sm:text-[68px]">
              Turn what you own into a trusted local listing.
            </h1>
            <p className="mt-5 max-w-[650px] text-[14px] leading-relaxed text-muted-foreground">
              Build a seller profile and list the exact item you own. Buyers across Idaho see your
              photos, price, condition, location and pickup or shipping details in one place, then
              contact you directly.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {isSignedIn ? (
                <Link
                  to="/selling"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground shadow-sm"
                >
                  Open Seller Center
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link
                  to="/auth"
                  search={{ redirect: "/selling", mode: "signup" }}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground shadow-sm"
                >
                  Become a Gem State seller
                  <ArrowRight size={16} />
                </Link>
              )}
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center rounded-full border border-foreground px-6 text-[13px] font-semibold"
              >
                How selling works
              </a>
            </div>
          </div>

          <div className="floating-card p-6 sm:p-7">
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
                title="Add listing details"
                text="Choose a category, location, condition, price and how buyers can receive the item."
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
        <div className="grid gap-4 md:grid-cols-4">
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
            title="Direct buyer contact"
            text="Buyers can message you about the exact listing and reply to your email."
          />
          <Feature
            icon={<Package size={21} />}
            title="Flexible handoff"
            text="Arrange local pickup or shipping details directly with the buyer."
          />
        </div>
        <div className="mt-8 flex items-start gap-2 border-l-2 border-primary pl-4 text-[12px] leading-relaxed text-muted-foreground">
          <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-primary" />
          Gem State Classifieds never asks sellers to send government ID or bank details through
          messages. Payment and payout features are reserved for a future marketplace phase.
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
    <article className="soft-card p-6">
      <div className="text-primary">{icon}</div>
      <h2 className="mt-4 text-[13px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
