import {
  interests,
  rankShopping,
  type ShoppingCard,
  type ShoppingEvent,
} from "./shopping-contract.ts";

/** Campaign names describe real situations, never manufactured urgency. */
export const MARKETING_CAMPAIGNS = {
  welcome: {
    name: "Welcome picks",
    heading: "Your next great find starts here.",
    intro:
      "Welcome to Bluebird. Explore listings from Idaho and beyond, and save a search to hear when the right one arrives.",
    action: "Explore Bluebird",
    priority: 30,
    group: "discovery",
    layout: "grid",
  },
  search_match: {
    name: "Saved-search matches",
    heading: "Your search has new finds.",
    intro: "These listings are new to a search you saved. Take a look at your latest matches.",
    action: "See your matches",
    priority: 90,
    group: "searches",
    layout: "grid",
  },
  price_drop: {
    name: "Price drops",
    heading: "Something you liked costs less.",
    intro:
      "The asking price has dropped. Here’s the latest price on a listing you’ve been following.",
    action: "See the new price",
    priority: 100,
    group: "prices",
    layout: "lead",
  },
  saved_reminder: {
    name: "Saved-item follow-up",
    heading: "Still on your shortlist?",
    intro: "You saved this listing for later. It’s still available if you’d like another look.",
    action: "View your saved find",
    priority: 50,
    group: "followups",
    layout: "lead",
  },
  viewed_reminder: {
    name: "Browsing follow-up",
    heading: "Pick up where you left off.",
    intro:
      "You came back to this listing. Here it is again when you’re ready to take a closer look.",
    action: "Take another look",
    priority: 40,
    group: "followups",
    layout: "lead",
  },
  similar_new: {
    name: "New similar listings",
    heading: "More like what you’re looking for.",
    intro: "New listings have arrived that fit your recent shopping interests.",
    action: "Explore these finds",
    priority: 70,
    group: "discovery",
    layout: "grid",
  },
  local_finds: {
    name: "Local finds",
    heading: "A little closer to home.",
    intro:
      "Fresh finds in a city you’ve been shopping in, selected from categories you’ve explored.",
    action: "See local finds",
    priority: 60,
    group: "discovery",
    layout: "grid",
  },
  category_finds: {
    name: "Category finds",
    heading: "More in your kind of aisle.",
    intro: "Fresh listings in a category you’ve been exploring, with a mix of sellers and prices.",
    action: "Browse these finds",
    priority: 55,
    group: "discovery",
    layout: "grid",
  },
  weekly_picks: {
    name: "Weekly picks",
    heading: "A few finds worth your time.",
    intro: "Your weekly edit of fresh listings, picked around your shopping interests.",
    action: "Explore your picks",
    priority: 35,
    group: "discovery",
    layout: "grid",
  },
  comeback: {
    name: "New since your last visit",
    heading: "A fresh reason to come back.",
    intro:
      "It’s been a little while. Here are relevant listings that arrived since your last visit.",
    action: "See what’s new",
    priority: 25,
    group: "discovery",
    layout: "grid",
  },
} as const;
export type MarketingCampaign = keyof typeof MARKETING_CAMPAIGNS;
export type MarketingGroup = (typeof MARKETING_CAMPAIGNS)[MarketingCampaign]["group"];
export type MarketingPreferences = {
  dailySearches?: boolean;
  prices?: boolean;
  searches?: boolean;
  followups?: boolean;
  discovery?: boolean;
};
export type MarketingInventory = {
  listing_id: string;
  card: ShoppingCard;
  first_seen_at: string;
  valid_until: string;
};
const day = 86400000;
export function marketingCampaign(value: unknown): MarketingCampaign | null {
  return typeof value === "string" && Object.hasOwn(MARKETING_CAMPAIGNS, value)
    ? (value as MarketingCampaign)
    : null;
}
export function marketingAllowed(
  account: { marketing_preferences?: MarketingPreferences },
  campaign: MarketingCampaign,
) {
  return account.marketing_preferences?.[MARKETING_CAMPAIGNS[campaign].group] !== false;
}
export function campaignForItem(item: {
  kind: string;
  payload?: Record<string, unknown>;
}): MarketingCampaign {
  return (
    marketingCampaign(item.payload?.campaign) ??
    (item.kind === "match"
      ? "search_match"
      : item.kind === "price_drop"
        ? "price_drop"
        : item.kind === "reminder"
          ? "saved_reminder"
          : "similar_new")
  );
}
export function marketingSubject(campaign: MarketingCampaign, title: string, count: number) {
  const short = title.replace(/[\r\n]+/g, " ").slice(0, 75);
  switch (campaign) {
    case "welcome":
      return "Welcome to Bluebird. Let’s find your next favorite.";
    case "search_match":
      return `${count === 1 ? "A new match" : `${count} new matches`} for your saved search`;
    case "price_drop":
      return `Price dropped: ${short}`;
    case "saved_reminder":
      return `Still interested? ${short}`;
    case "viewed_reminder":
      return `Take another look: ${short}`;
    case "similar_new":
      return "New finds like the ones you’ve been looking at";
    case "local_finds":
      return "Fresh finds a little closer to home";
    case "category_finds":
      return "New arrivals in a category you like";
    case "weekly_picks":
      return "Your weekly Bluebird picks are here";
    case "comeback":
      return "Here’s what’s new since your last visit";
  }
}
export function marketingPrice(cents: number) {
  return Number.isFinite(cents) && cents > 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: cents % 100 ? 2 : 0,
      }).format(cents / 100)
    : "Contact for price";
}
export function safeMarketingImage(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function seller(card: ShoppingCard) {
  const attribution = card.businessAttribution as { key?: string } | undefined;
  return attribution?.key ?? String(card.sellerId ?? card.dealerId ?? card.sellerName ?? card.id);
}
/** Round-robin known sellers; Idaho first only within already relevant candidates. */
export function variedMarketingCards(cards: ShoppingCard[], limit = 6) {
  const result: ShoppingCard[] = [];
  for (const tier of [
    cards.filter((c) => c.state === "ID"),
    cards.filter((c) => c.state !== "ID"),
  ]) {
    const pools = new Map<string, ShoppingCard[]>();
    for (const card of tier) {
      const key = seller(card);
      pools.set(key, [...(pools.get(key) ?? []), card]);
    }
    while (pools.size && result.length < limit) {
      for (const [key, pool] of pools) {
        result.push(pool.shift()!);
        if (!pool.length) pools.delete(key);
        if (result.length === limit) break;
      }
    }
  }
  return result;
}
export function lastMarketingActivity(activity: ShoppingEvent[]) {
  return activity
    .filter((e) =>
      ["view", "save", "search", "recommendation_click", "notification_click"].includes(e.kind),
    )
    .reduce((last, e) => Math.max(last, Date.parse(e.at ?? "") || 0), 0);
}
export function nextMarketingWindow(now: number, timezone = "America/Boise") {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Boise",
      hour: "numeric",
      hourCycle: "h23",
    });
  }
  for (let candidate = now; candidate < now + 25 * 3600000; candidate += 3600000) {
    const hour = Number(
      formatter.formatToParts(new Date(candidate)).find((p) => p.type === "hour")?.value,
    );
    if (hour >= 8 && hour < 20) return candidate;
  }
  return now + 12 * 3600000;
}
export function marketingDiscovery({
  account,
  activity,
  inventory,
  launchedAt,
  excludeListingIds = new Set<string>(),
  now = Date.now(),
}: {
  account: {
    shopping_alerts?: boolean;
    alerts_updated_at?: string;
    marketing_preferences?: MarketingPreferences;
  };
  activity: ShoppingEvent[];
  inventory: MarketingInventory[];
  launchedAt: number;
  excludeListingIds?: Set<string>;
  now?: number;
}) {
  if (account.shopping_alerts !== true) return [];
  const active = inventory.filter((r) => Date.parse(r.valid_until) > now);
  const profile = interests(activity, now);
  const byId = new Map(active.map((r) => [r.listing_id, r]));
  const last = lastMarketingActivity(activity);
  const start = Date.parse(account.alerts_updated_at ?? "");
  const period = Math.floor(now / (7 * day));
  const fresh = active.filter(
    (r) => Date.parse(r.first_seen_at) > Math.max(launchedAt, now - 7 * day),
  );
  const freshById = new Map(fresh.map((r) => [r.listing_id, r]));
  const ranked = rankShopping(
    active.map((r) => r.card),
    activity,
    undefined,
    now,
  )
    .filter(
      (r) =>
        freshById.has(r.card.id) &&
        r.score >= 15 &&
        !profile.has(r.card.id) &&
        !excludeListingIds.has(r.card.id),
    )
    .map((r) => r.card);
  const contexts = [...profile.values()]
    .filter((i) => !i.dismissed && !i.purchased && i.lastAt > now - 30 * day)
    .map((i) => byId.get(i.listingId)?.card)
    .filter((c): c is ShoppingCard => Boolean(c));
  const cities = new Set(
    contexts.filter((c) => c.city && c.state).map((c) => `${c.city!.toLowerCase()}|${c.state}`),
  );
  const categories = new Set(contexts.map((c) => c.categorySlug));
  const pending: {
    campaign: MarketingCampaign;
    cards: ShoppingCard[];
    eventKey: string;
    expiresAt: number;
    anchor?: number;
  }[] = [];
  if (start >= launchedAt && start > now - 7 * day && account.shopping_alerts) {
    const picks = variedMarketingCards(
      active
        .filter((r) => r.card.state === "ID" && !excludeListingIds.has(r.card.id))
        .map((r) => r.card),
    );
    if (picks.length >= 3)
      pending.push({
        campaign: "welcome",
        cards: picks,
        eventKey: "marketing:welcome:v1",
        expiresAt: start + 7 * day,
        anchor: start,
      });
  }
  if (!activity.length || !last)
    return pending.filter((p) => marketingAllowed(account, p.campaign));
  const inactiveDays = (now - last) / day;
  if (inactiveDays >= 14 && inactiveDays <= 30) {
    const picks = ranked.filter((c) => Date.parse(freshById.get(c.id)!.first_seen_at) > last);
    if (picks.length >= 3)
      pending.push({
        campaign: "comeback",
        cards: variedMarketingCards(picks),
        eventKey: `marketing:comeback:${last}`,
        expiresAt: Math.min(now + 2 * day, last + 30 * day),
        anchor: last,
      });
    return pending.filter((p) => marketingAllowed(account, p.campaign));
  }
  if (inactiveDays > 14) return pending.filter((p) => marketingAllowed(account, p.campaign));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    weekday: "short",
  }).format(new Date(now));
  // Weekly discovery windows keep category/local/weekly messages distinct.
  const campaign: MarketingCampaign | null =
    weekday === "Tue"
      ? "category_finds"
      : weekday === "Thu"
        ? "local_finds"
        : weekday === "Sat"
          ? "weekly_picks"
          : null;
  if (campaign) {
    const picks = ranked.filter((c) =>
      campaign === "local_finds"
        ? cities.has(`${c.city?.toLowerCase()}|${c.state}`) && categories.has(c.categorySlug)
        : campaign === "category_finds"
          ? categories.has(c.categorySlug)
          : true,
    );
    if (picks.length >= 3)
      pending.push({
        campaign,
        cards: variedMarketingCards(picks),
        eventKey: `marketing:${campaign}:${period}`,
        expiresAt: now + day,
        anchor: last,
      });
  }
  return pending.filter((p) => marketingAllowed(account, p.campaign));
}
