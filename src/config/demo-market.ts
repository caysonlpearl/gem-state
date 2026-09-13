import type { MarketDepth } from "@/lib/market.functions";

export type DemoVariantMarket = MarketDepth & {
  activeAskCount: number;
  activeBidCount: number;
  lowestAskCents: number;
  highestBidCents: number;
  lastSaleCents: number;
};

const ask = (priceCents: number, quantity: number, condition = "new_with_tags") => ({
  priceCents,
  currency: "USD",
  quantity,
  condition,
});

const bid = (priceCents: number, quantity: number) => ({
  priceCents,
  currency: "USD",
  quantity,
  condition: null,
});

const sale = (priceCents: number, origin: "in_hand" | "sourcing", soldAt: string) => ({
  priceCents,
  currency: "USD",
  origin,
  soldAt,
});

const holidayMugMarkets: Record<string, DemoVariantMarket> = {
  "DEMO-HCM-PI-14": {
    activeAskCount: 11,
    activeBidCount: 24,
    lowestAskCents: 4400,
    highestBidCents: 3800,
    lastSaleCents: 4200,
    asks: [
      ask(4400, 1),
      ask(4600, 2),
      ask(4800, 1, "new_without_tags"),
      ask(5000, 3),
      ask(5200, 1, "used_excellent"),
      ask(5500, 2),
      ask(5900, 1, "new_without_tags"),
    ],
    bids: [bid(3800, 2), bid(3600, 4), bid(3500, 3), bid(3300, 5), bid(3000, 6), bid(2800, 4)],
    sales: [
      sale(4200, "in_hand", "2026-08-24T18:20:00Z"),
      sale(4500, "sourcing", "2026-08-19T15:45:00Z"),
      sale(4100, "in_hand", "2026-08-11T20:10:00Z"),
      sale(4400, "in_hand", "2026-08-03T17:32:00Z"),
      sale(4800, "sourcing", "2026-07-27T19:05:00Z"),
      sale(3999, "in_hand", "2026-07-16T16:48:00Z"),
      sale(4600, "in_hand", "2026-07-05T21:14:00Z"),
    ],
  },
  "DEMO-HCM-CA-14": {
    activeAskCount: 9,
    activeBidCount: 18,
    lowestAskCents: 4700,
    highestBidCents: 4100,
    lastSaleCents: 4500,
    asks: [
      ask(4700, 1),
      ask(4900, 2),
      ask(5100, 1, "new_without_tags"),
      ask(5400, 2),
      ask(5700, 1, "used_excellent"),
      ask(6100, 2),
    ],
    bids: [bid(4100, 1), bid(4000, 3), bid(3800, 4), bid(3500, 5), bid(3200, 3), bid(3000, 2)],
    sales: [
      sale(4500, "in_hand", "2026-08-22T17:10:00Z"),
      sale(4700, "sourcing", "2026-08-17T19:42:00Z"),
      sale(4400, "in_hand", "2026-08-08T14:25:00Z"),
      sale(4900, "in_hand", "2026-07-31T20:18:00Z"),
      sale(4600, "sourcing", "2026-07-21T18:06:00Z"),
      sale(4300, "in_hand", "2026-07-09T16:33:00Z"),
    ],
  },
  "DEMO-HCM-CW-14": {
    activeAskCount: 7,
    activeBidCount: 16,
    lowestAskCents: 5200,
    highestBidCents: 4600,
    lastSaleCents: 4900,
    asks: [
      ask(5200, 1),
      ask(5400, 1),
      ask(5600, 2, "new_without_tags"),
      ask(6000, 1),
      ask(6400, 1),
      ask(6800, 1, "used_excellent"),
    ],
    bids: [bid(4600, 2), bid(4400, 3), bid(4200, 2), bid(3900, 4), bid(3600, 3), bid(3300, 2)],
    sales: [
      sale(4900, "in_hand", "2026-08-25T20:35:00Z"),
      sale(5300, "sourcing", "2026-08-20T16:11:00Z"),
      sale(5000, "in_hand", "2026-08-14T18:48:00Z"),
      sale(5500, "in_hand", "2026-08-02T21:26:00Z"),
      sale(5200, "sourcing", "2026-07-24T15:52:00Z"),
      sale(4800, "in_hand", "2026-07-12T19:39:00Z"),
    ],
  },
  "DEMO-HCM-PI-18": {
    activeAskCount: 8,
    activeBidCount: 20,
    lowestAskCents: 5800,
    highestBidCents: 5000,
    lastSaleCents: 5400,
    asks: [
      ask(5800, 1),
      ask(6100, 2),
      ask(6400, 1, "new_without_tags"),
      ask(6800, 2),
      ask(7200, 1, "used_excellent"),
      ask(7600, 1),
    ],
    bids: [bid(5000, 2), bid(4800, 3), bid(4500, 4), bid(4200, 5), bid(3900, 4), bid(3500, 2)],
    sales: [
      sale(5400, "in_hand", "2026-08-23T19:50:00Z"),
      sale(5900, "sourcing", "2026-08-18T17:15:00Z"),
      sale(5600, "in_hand", "2026-08-10T21:03:00Z"),
      sale(6100, "in_hand", "2026-08-01T18:27:00Z"),
      sale(5700, "sourcing", "2026-07-22T16:40:00Z"),
      sale(5300, "in_hand", "2026-07-08T20:12:00Z"),
    ],
  },
};

export function getDemoVariantMarket(
  productSlug: string,
  skuLabel: string | null | undefined,
): DemoVariantMarket | null {
  if (productSlug !== "holiday-ceramic-mug" || !skuLabel) return null;
  return holidayMugMarkets[skuLabel] ?? null;
}
