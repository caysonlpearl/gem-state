import { idahoRegions } from "../config/classifieds.ts";
import { findIdahoPlace } from "../config/idaho-places.ts";

/**
 * Numbers for the landing pages, computed from Bluebird's own live listings.
 * Pure functions so the copy they feed can be tested; nothing here invents a
 * figure, and every helper returns nothing when there's too little data to
 * say something honest.
 */

export type PriceSummary = {
  count: number;
  medianCents: number;
  lowCents: number;
  highCents: number;
  /** True when low/high are the middle half (25th–75th percentile), not the extremes. */
  typicalRange: boolean;
};

export type PriceBand = { label: string; count: number; medianCents: number };

export type FaqEntry = { question: string; answer: string };

export type Tally = { label: string; count: number };

function percentileOf(sorted: number[], fraction: number) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Math.round(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower));
}

export function medianCents(values: number[]) {
  return percentileOf([...values].sort((a, b) => a - b), 0.5);
}

/** Median and range of asking prices, once at least `minCount` listings have a price. */
export function priceSummary(cents: number[], minCount = 3): PriceSummary | null {
  const values = cents.filter((value) => value > 0).sort((a, b) => a - b);
  if (values.length < minCount) return null;
  // With five or more prices the middle half is a fairer "typical" range
  // than the cheapest and dearest listings.
  const typicalRange = values.length >= 5;
  return {
    count: values.length,
    medianCents: percentileOf(values, 0.5),
    lowCents: typicalRange ? percentileOf(values, 0.25) : values[0]!,
    highCents: typicalRange ? percentileOf(values, 0.75) : values[values.length - 1]!,
    typicalRange,
  };
}

type VehiclePriced = {
  priceCents: number;
  vehicle: { year: number | null; mileage: number | null } | null;
};

function bands<T>(
  items: T[],
  value: (item: T) => number | null | undefined,
  edges: { label: string; min: number; max: number }[],
  priceOf: (item: T) => number,
): PriceBand[] {
  const rows: PriceBand[] = [];
  let covered = 0;
  for (const edge of edges) {
    const prices = items
      .filter((item) => {
        const v = value(item);
        return v != null && v >= edge.min && v <= edge.max;
      })
      .map(priceOf)
      .filter((cents) => cents > 0);
    covered += prices.length;
    if (prices.length) rows.push({ label: edge.label, count: prices.length, medianCents: medianCents(prices) });
  }
  // A table needs a few vehicles behind it before it says anything.
  return covered >= 3 ? rows : [];
}

/** Median asking price by model-year band, newest first. */
export function priceByYear(listings: VehiclePriced[], now = new Date()): PriceBand[] {
  const year = now.getFullYear();
  return bands(
    listings,
    (listing) => listing.vehicle?.year,
    [
      { label: `${year - 5} and newer`, min: year - 5, max: year + 2 },
      { label: `${year - 10}–${year - 6}`, min: year - 10, max: year - 6 },
      { label: `${year - 15}–${year - 11}`, min: year - 15, max: year - 11 },
      { label: `${year - 16} and older`, min: 1900, max: year - 16 },
    ],
    (listing) => listing.priceCents,
  );
}

/** Median asking price by mileage band, lowest mileage first. */
export function priceByMileage(listings: VehiclePriced[]): PriceBand[] {
  return bands(
    listings,
    (listing) => listing.vehicle?.mileage,
    [
      { label: "Under 50,000 miles", min: 0, max: 49_999 },
      { label: "50,000–99,999 miles", min: 50_000, max: 99_999 },
      { label: "100,000–149,999 miles", min: 100_000, max: 149_999 },
      { label: "150,000 miles or more", min: 150_000, max: Number.MAX_SAFE_INTEGER },
    ],
    (listing) => listing.priceCents,
  );
}

/** The Bluebird region a listing belongs to: its saved region, else its Idaho city's. */
export function regionOfListing(listing: { region?: string | null; city?: string | null; state?: string | null }) {
  const saved = idahoRegions.find((region) => region === listing.region);
  if (saved) return saved;
  if ((listing.state ?? "ID").toUpperCase() !== "ID") return undefined;
  return findIdahoPlace(listing.city)?.[1];
}

export const wholeDollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );

/** "October 14, 2026", in Idaho (Mountain) time. */
export function idahoDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function listPhrase(items: Tally[]) {
  const parts = items.map((item) => `${item.label} (${item.count})`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Three to five questions a searcher would ask about a landing page, each
 * answered in its first sentence from the page's live numbers. Questions
 * without data behind them are left out rather than answered vaguely.
 */
export function landingFaq(input: {
  /** "trailers", "Toyota Tacomas", "listings" */
  noun: string;
  /** "in and around Boise", "across Idaho" */
  where: string;
  total: number;
  newest: string | null;
  price: PriceSummary | null;
  otherPlaces?: Tally[];
  /** "elsewhere" (default) when otherPlaces excludes this page's own place; "all" when it's every place. */
  placesScope?: "elsewhere" | "all";
  topCategories?: Tally[];
  topMakes?: Tally[];
  recentlySold?: number;
  now?: Date;
}): FaqEntry[] {
  if (input.total === 0) return [];
  const asOf = idahoDate(input.now ?? new Date());
  const faq: FaqEntry[] = [];
  if (input.price) {
    const { price } = input;
    const range = price.typicalRange
      ? `most are between ${wholeDollars(price.lowCents)} and ${wholeDollars(price.highCents)}`
      : `they range from ${wholeDollars(price.lowCents)} to ${wholeDollars(price.highCents)}`;
    faq.push({
      question: `How much do ${input.noun} cost ${input.where}?`,
      answer: `The median asking price for ${input.noun} ${input.where} is ${wholeDollars(price.medianCents)} across ${price.count} priced listings on Bluebird, and ${range} (as of ${asOf}). Asking prices are what sellers list for; the final price is agreed between buyer and seller.`,
    });
  }
  faq.push({
    question: `How many ${input.noun} are for sale ${input.where}?`,
    answer: `${input.total} ${input.total === 1 ? "listing is" : "listings are"} live on Bluebird ${input.where} as of ${asOf}${
      input.newest ? `; the newest was posted ${idahoDate(input.newest)}` : ""
    }.`,
  });
  if (input.topMakes?.length) {
    faq.push({
      question: `Which makes are listed most ${input.where}?`,
      answer: `The most-listed makes ${input.where} right now are ${listPhrase(input.topMakes.slice(0, 3))}.`,
    });
  }
  if (input.topCategories?.length) {
    faq.push({
      question: `What's for sale ${input.where}?`,
      answer: `The biggest categories ${input.where} right now are ${listPhrase(input.topCategories.slice(0, 3))}.`,
    });
  }
  if (input.otherPlaces?.length) {
    const all = input.placesScope === "all";
    faq.push({
      question: all
        ? `Where in Idaho are ${input.noun} listed?`
        : `Where else in Idaho are ${input.noun} listed?`,
      answer: `${all ? "The most listings are" : "Elsewhere in Idaho, the most listings are"} in ${listPhrase(input.otherPlaces.slice(0, 3))}.`,
    });
  }
  if (input.recentlySold) {
    faq.push({
      question: `Have any ${input.noun} sold ${input.where} recently?`,
      answer: `${input.recentlySold} ${input.recentlySold === 1 ? "listing" : "listings"} ${input.where} sold on Bluebird in the last 60 days; they're shown under Recently sold on this page.`,
    });
  }
  return faq.slice(0, 5);
}
