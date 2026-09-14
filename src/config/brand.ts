/**
 * Central brand configuration.
 *
 * Brand-facing names, contact details, and policy language live here so no
 * URLs, legal language — lives here so no component hardcodes brand strings.
 */

export const brand = {
  name: "Gem State Classifieds",
  shortName: "Gem State",
  wordmarkInitials: "GSC",
  tagline: "Idaho's local marketplace for cars, gear, home goods, and more.",
  description:
    "Idaho classifieds for cars, trucks, outdoor gear, tools, home goods, and more from local sellers.",
  domain: "gemstateclassifieds.com",
  supportEmail: "support@gemstateclassifieds.com",
  pressEmail: "hello@gemstateclassifieds.com",
  urls: {
    home: "/",
    auth: "/auth",
    account: "/account",
    stripePlatformSetup: "https://dashboard.stripe.com/register",
    // Absolute origin for building fully-qualified URLs in <meta> tags
    // (og:image etc.), which crawlers require rather than resolving relative.
    siteUrl: "https://gemstateclassifieds.com",
  },
  legal: {
    disclaimer:
      "Gem State Classifieds is an independent marketplace. Listings are created by individual sellers, who are responsible for their descriptions, photos, pricing, and legal right to sell each item.",
    checkoutNotice:
      "Card payments on Gem State Classifieds are processed by Stripe. Gem State Classifieds does not operate escrow. Seller payouts follow the delivery and order-completion terms shown at checkout.",
    copyright: (year: number) => `© ${year} ${brand.name}.`,
  },
  markets: [{ code: "ID", label: "Idaho", currency: "USD" }],
  defaultCurrency: "USD",
} as const;

/**
 * Trust and policy surfaces. Every entry is reachable from the footer and from
 * `/policies`. These are the operator's published terms: each section states a
 * binding rule the marketplace actually applies today.
 */
export const policyEffectiveDate = "September 13, 2026";

export const policyTopics = [
  { slug: "marketplace-disclosure", title: "Marketplace disclosure" },
  { slug: "privacy", title: "Privacy and what we store" },
  { slug: "buyer-terms", title: "Buyer terms" },
  { slug: "seller-terms", title: "Seller terms" },
  { slug: "cancellation", title: "Cancellation and refunds" },
  { slug: "prohibited-items", title: "Prohibited items" },
  {
    slug: "identity-verification",
    title: "Government ID: purpose, access, retention",
  },
  { slug: "evidence-privacy", title: "Receipts and evidence privacy" },
  { slug: "contact-takedown", title: "Contact and takedown" },
] as const;

export type PolicyTopicSlug = (typeof policyTopics)[number]["slug"];

export type BrandMarketCode = (typeof brand.markets)[number]["code"];
