/**
 * Central brand configuration.
 *
 * "ParkVault" is a working name. Everything replaceable — name, logo, contact,
 * URLs, legal language — lives here so no component hardcodes brand strings.
 */

export const brand = {
  name: "ParkVault",
  shortName: "ParkVault",
  wordmarkInitials: "PV",
  tagline: "One page per product. Every seller, shopper, and offer in one place.",
  description:
    "A curated marketplace for Walt Disney World and Disneyland park merchandise: one canonical page per product, with real listings and offers underneath.",
  domain: "parkvault.example",
  supportEmail: "support@parkvault.example",
  pressEmail: "hello@parkvault.example",
  urls: {
    home: "/",
    auth: "/auth",
    account: "/account",
    stripePlatformSetup: "https://dashboard.stripe.com/register",
    // Absolute origin for building fully-qualified URLs in <meta> tags
    // (og:image etc.), which crawlers require rather than resolving relative.
    siteUrl: "https://www.getparkvault.com",
  },
  legal: {
    disclaimer:
      "ParkVault is an independent marketplace and is not affiliated with, endorsed by, or sponsored by The Walt Disney Company. All product names, trademarks, and registered trademarks are the property of their respective owners.",
    checkoutNotice:
      "Card payments on ParkVault are processed by Stripe. ParkVault does not operate escrow: sellers and in-park shoppers are paid after the item is delivered and the order completes.",
    copyright: (year: number) => `© ${year} ${brand.name}.`,
  },
  markets: [
    { code: "WDW", label: "Walt Disney World Resort", currency: "USD" },
    { code: "DLR", label: "Disneyland Resort", currency: "USD" },
  ],
  defaultCurrency: "USD",
} as const;

/**
 * Trust and policy surfaces. Every entry is reachable from the footer and from
 * `/policies`. These are the operator's published terms: each section states a
 * binding rule the marketplace actually applies today.
 */
export const policyEffectiveDate = "September 3, 2026";

export const policyTopics = [
  { slug: "non-affiliation", title: "Non-affiliation" },
  { slug: "privacy", title: "Privacy and what we store" },
  { slug: "buyer-terms", title: "Buyer terms" },
  { slug: "seller-terms", title: "Seller terms" },
  { slug: "shopper-terms", title: "Park shopper terms" },
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
