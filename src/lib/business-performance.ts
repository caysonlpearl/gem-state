import { eligibleTrafficEvents, type TrafficEvent } from "./traffic-summary.ts";

export type BusinessKind = "dealer" | "service" | "employer" | "broker" | "retailer";
export type BusinessIdentity = {
  key: string;
  canonicalKey: string;
  kind: BusinessKind;
  name: string;
  city: string;
  state: string;
  website: string;
  dealerSlug: string;
  sellerSlug?: string;
  postalCode: string;
};
export type BusinessListing = {
  id: string;
  title?: string;
  city?: string;
  state?: string;
  postalCode?: string | null;
  isMock?: boolean;
  seller?: { slug: string } | null;
  dealer?: {
    slug: string;
    displayName: string;
    city?: string | null;
    state?: string | null;
    website?: string | null;
    postalCode?: string | null;
  } | null;
  externalVehicle?: {
    sourceKind: string;
    dealer?: {
      id?: number | null;
      name?: string | null;
      website?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
    } | null;
    sourceUrl?: string | null;
  };
  directory?: { website?: string | null };
  job?: { employerName?: string } | null;
  externalHome?: { listedBy?: { brokerName?: string | null; agentName?: string | null } | null };
  externalMerchandise?: { source: string };
};
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const token = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
export function businessDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function businessHost(value: unknown) {
  try {
    return new URL(
      /^https?:\/\//i.test(text(value)) ? text(value) : "https://" + text(value),
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function isTestBusiness(value: { name: string; dealerSlug?: string; website?: string }) {
  return (
    /^(?:qa|audit)(?:\b|[-_])/i.test(value.name) ||
    /^bluebird-(?:qa|audit)-/i.test(value.dealerSlug ?? "") ||
    businessHost(value.website) === "example.com"
  );
}
export function businessForListing(listing: BusinessListing): BusinessIdentity | null {
  if (listing.isMock) return null;
  const dealer = listing.externalVehicle?.dealer,
    profile = listing.dealer;
  let kind: BusinessKind,
    key: string,
    name: string,
    website = "",
    slug = "",
    city = listing.city ?? "",
    state = listing.state ?? "",
    postalCode = "";
  if (profile?.slug || listing.externalVehicle?.sourceKind === "dealer") {
    kind = "dealer";
    name = text(profile?.displayName) || text(dealer?.name);
    slug = profile?.slug ?? "";
    website = businessHost(profile?.website || dealer?.website);
    city = text(profile?.city || dealer?.city) || city;
    state = text(profile?.state || dealer?.state) || state;
    postalCode = text(profile?.postalCode || dealer?.zip || listing.postalCode);
    key = slug
      ? "dealer:" + slug
      : dealer?.id != null
        ? "marketcheck-dealer:" +
          dealer.id +
          ":" +
          token(city) +
          ":" +
          token(state) +
          ":" +
          postalCode
        : "dealer-site:" +
          token(website || name) +
          ":" +
          token(city) +
          ":" +
          token(state) +
          ":" +
          postalCode;
  } else if (listing.directory) {
    kind = "service";
    name = listing.title ?? "";
    website = businessHost(listing.directory.website);
    key = "service:" + listing.id;
  } else if (listing.job) {
    kind = "employer";
    name = text(listing.job.employerName);
    key = "employer:" + token(name) + ":" + token(state);
  } else if (listing.externalHome?.listedBy) {
    kind = "broker";
    name = text(
      listing.externalHome.listedBy.brokerName || listing.externalHome.listedBy.agentName,
    );
    key = "broker:" + token(name) + ":" + token(state);
  } else if (listing.externalMerchandise) {
    kind = "retailer";
    name = listing.externalMerchandise.source;
    key = "retailer:" + token(name);
  } else return null;
  if (!name || /^(?:unknown|confidential|vehicle seller|private seller|not provided)$/i.test(name))
    return null;
  const identity = {
    key,
    canonicalKey: key,
    kind,
    name,
    city,
    state,
    website,
    dealerSlug: slug,
    postalCode,
  };
  return key.length > 300 || isTestBusiness(identity) ? null : identity;
}

export function businessProps(business: BusinessIdentity) {
  return {
    business_key: business.key,
    business_name: business.name,
    business_kind: business.kind,
    business_city: business.city,
    business_state: business.state,
    business_site: business.website,
    business_dealer_slug: business.dealerSlug,
    business_seller_slug: business.sellerSlug ?? "",
    business_postal_code: business.postalCode,
  };
}
export function businessFromProps(value: unknown): BusinessIdentity | null {
  const p = (value ?? {}) as Record<string, unknown>;
  if (
    !["dealer", "service", "employer", "broker", "retailer"].includes(text(p.business_kind)) ||
    !text(p.business_key) ||
    !text(p.business_name)
  )
    return null;
  if (text(p.business_key).length > 300) return null;
  return {
    key: text(p.business_key),
    canonicalKey: text(p.business_key),
    kind: p.business_kind as BusinessKind,
    name: text(p.business_name).slice(0, 200),
    city: text(p.business_city).slice(0, 100),
    state: text(p.business_state).slice(0, 30),
    website: businessHost(p.business_site),
    dealerSlug: text(p.business_dealer_slug).slice(0, 80),
    sellerSlug: text(p.business_seller_slug).slice(0, 120),
    postalCode: text(p.business_postal_code).slice(0, 20),
  };
}
export type BusinessAttribution = {
  listingId: string;
  businessKey: string;
  title: string;
  source: string;
  active: boolean;
};
export type BusinessMetricEvent = TrafficEvent & {
  id?: string;
  session_id?: string | null;
  is_demo?: boolean;
};
export type PerformanceCounts = {
  listingClicks: number;
  listingViews: number;
  profileViews: number;
  profileClicks: number;
  websiteClicks: number;
  vehicleClicks: number;
  calls: number;
  texts: number;
  emails: number;
  directions: number;
  inquiries: number;
  saves: number;
};
const emptyCounts = (): PerformanceCounts => ({
  listingClicks: 0,
  listingViews: 0,
  profileViews: 0,
  profileClicks: 0,
  websiteClicks: 0,
  vehicleClicks: 0,
  calls: 0,
  texts: 0,
  emails: 0,
  directions: 0,
  inquiries: 0,
  saves: 0,
});
export type BusinessPerformanceRow = BusinessIdentity &
  PerformanceCounts & {
    activeListings: number | null;
    uniqueBrowsers: number;
    interestedBrowsers: number;
    outboundBrowsers: number;
    sources: string[];
    conversionPercent: number | null;
    modeledSales: number | null;
    listings: ({
      id: string;
      title: string;
      source: string;
      active: boolean;
    } & PerformanceCounts)[];
    daily: ({ date: string } & PerformanceCounts)[];
  };

/** A profile match needs an actual official host and location. Never merge
 * different dealerships solely because their names look similar. */
export function canonicalBusiness(identity: BusinessIdentity, profiles: BusinessIdentity[]) {
  if (identity.kind !== "dealer" || identity.dealerSlug)
    return { ...identity, canonicalKey: identity.key };
  const matches = profiles.filter(
    (p) =>
      p.kind === "dealer" &&
      p.dealerSlug &&
      p.website &&
      p.website === identity.website &&
      token(p.city) === token(identity.city) &&
      token(p.state) === token(identity.state) &&
      (identity.postalCode && p.postalCode
        ? identity.postalCode === p.postalCode
        : token(p.name) === token(identity.name)),
  );
  return {
    ...identity,
    canonicalKey:
      matches.length === 1
        ? matches[0].key
        : /^marketcheck-dealer:\d+$/.test(identity.key)
          ? identity.key +
            ":" +
            token(identity.city) +
            ":" +
            token(identity.state) +
            ":" +
            identity.postalCode
          : identity.key,
  };
}

export function summarizeBusinessPerformance(input: {
  events: BusinessMetricEvent[];
  businesses: BusinessIdentity[];
  attributions: BusinessAttribution[];
  staffIds: Set<string>;
  excludedBrowserIds?: Set<string>;
  excludedVisitIds?: Set<string>;
  domain: string;
  rates: Map<string, number | null>;
  ownerIds?: Map<string, Set<string>>;
}) {
  const identities = new Map(input.businesses.map((b) => [b.key, b]));
  const profiles = input.businesses.filter((b) => b.dealerSlug);
  const canonical = (key: string) => {
    const item = identities.get(key);
    return item ? canonicalBusiness(item, profiles).canonicalKey : key;
  };
  const attribution = new Map(input.attributions.map((a) => [a.listingId, a]));
  const rows = new Map<string, BusinessPerformanceRow>();
  const browsers = new Map<string, Set<string>>(),
    interested = new Map<string, Set<string>>(),
    outbound = new Map<string, Set<string>>();
  const listingRows = new Map<string, Map<string, BusinessPerformanceRow["listings"][number]>>();
  const days = new Map<string, Map<string, PerformanceCounts>>();
  const rowFor = (identity: BusinessIdentity) => {
    const key = canonical(identity.key);
    const preferred = identities.get(key) ?? identity;
    if (isTestBusiness(preferred)) return null;
    if (!rows.has(key))
      rows.set(key, {
        ...preferred,
        key,
        canonicalKey: key,
        ...emptyCounts(),
        activeListings: preferred.kind === "dealer" ? 0 : null,
        uniqueBrowsers: 0,
        interestedBrowsers: 0,
        outboundBrowsers: 0,
        sources: [],
        conversionPercent: input.rates.get(key) ?? null,
        modeledSales: null,
        listings: [],
        daily: [],
      });
    return rows.get(key)!;
  };
  for (const identity of identities.values()) rowFor(identity);
  const listFor = (row: BusinessPerformanceRow, listingId: string) => {
    if (!listingRows.has(row.key)) listingRows.set(row.key, new Map());
    const items = listingRows.get(row.key)!;
    const info = attribution.get(listingId);
    if (!items.has(listingId))
      items.set(listingId, {
        id: listingId,
        title: info?.title || listingId,
        source: info?.source || "Recorded listing",
        active: info?.active ?? false,
        ...emptyCounts(),
      });
    return items.get(listingId)!;
  };
  for (const a of input.attributions) {
    const b = identities.get(a.businessKey);
    if (!b) continue;
    const row = rowFor(b);
    if (!row) continue;
    if (a.active && row.activeListings != null) row.activeListings++;
    if (!row.sources.includes(a.source)) row.sources.push(a.source);
    if (a.active) listFor(row, a.listingId);
  }
  const eligible = eligibleTrafficEvents(
    input.events.filter((e) => e.is_demo !== true),
    {
      staffIds: input.staffIds,
      excludedBrowserIds: input.excludedBrowserIds,
      excludedVisitIds: input.excludedVisitIds,
      domain: input.domain,
    },
  ) as BusinessMetricEvent[];
  const ownVisits = new Set<string>();
  for (const e of eligible) {
    const p = (e.props ?? {}) as Record<string, unknown>;
    if (e.user_id && p.traffic_visit)
      for (const [businessKey, users] of input.ownerIds ?? [])
        if (users.has(e.user_id)) ownVisits.add(canonical(businessKey) + ":" + p.traffic_visit);
  }
  let unattributedEvents = 0;
  const seenInquiries = new Set<string>();
  for (const event of eligible) {
    if (
      ![
        "listing_viewed",
        "business_listing_clicked",
        "business_profile_viewed",
        "watchlist_added",
        "inquiry_completed",
        "business_inquiry_completed",
        "business_action",
        "seller_contacted",
      ].includes(event.name)
    )
      continue;
    const p = (event.props ?? {}) as Record<string, unknown>;
    const listingId = text(p.listing_id);
    const rawKey =
      text(p.business_key) ||
      attribution.get(listingId)?.businessKey ||
      (text(p.seller_slug)
        ? input.businesses.find((b) => b.sellerSlug === text(p.seller_slug))?.key
        : undefined);
    const identity = (rawKey && identities.get(rawKey)) || businessFromProps(p);
    if (!identity) {
      if (
        listingId &&
        (listingId.startsWith("marketcheck-dealer-") || listingId.startsWith("dealerfeed-"))
      )
        unattributedEvents++;
      continue;
    }
    const row = rowFor(identity);
    if (!row) continue;
    if (
      (event.user_id && input.ownerIds?.get(row.key)?.has(event.user_id)) ||
      ownVisits.has(row.key + ":" + p.traffic_visit)
    )
      continue;
    const browser =
      event.session_id || text(p.traffic_visit) || (event.user_id ? "user:" + event.user_id : "");
    const mark = (collection: Map<string, Set<string>>) => {
      if (browser) {
        if (!collection.has(row.key)) collection.set(row.key, new Set());
        collection.get(row.key)!.add(browser);
      }
    };
    mark(browsers);
    const date = businessDate(event.occurred_at ?? "");
    if (!days.has(row.key)) days.set(row.key, new Map());
    if (!days.get(row.key)!.has(date)) days.get(row.key)!.set(date, emptyCounts());
    const counters = [row, days.get(row.key)!.get(date)!];
    if (listingId) counters.push(listFor(row, listingId));
    const add = (field: keyof PerformanceCounts) => {
      for (const counter of counters) counter[field]++;
    };
    if (event.name === "business_listing_clicked") add("listingClicks");
    else if (event.name === "listing_viewed") add("listingViews");
    else if (event.name === "business_profile_viewed") add("profileViews");
    else if (event.name === "watchlist_added") add("saves");
    else if (event.name === "inquiry_completed" || event.name === "business_inquiry_completed") {
      const id = text(p.event_id);
      const dedupe = row.key + ":" + (id || event.id || event.occurred_at + ":" + browser);
      if (seenInquiries.has(dedupe)) continue;
      seenInquiries.add(dedupe);
      add("inquiries");
      mark(interested);
    } else if (event.name === "business_action" || event.name === "seller_contacted") {
      const method = text(p.method);
      const field: keyof PerformanceCounts | undefined = (
        {
          website: "websiteClicks",
          vehicle_source: "vehicleClicks",
          dealer_profile: "profileClicks",
          call: "calls",
          text: "texts",
          email: "emails",
          directions: "directions",
          apply_external: "vehicleClicks",
        } as Record<string, keyof PerformanceCounts>
      )[method];
      if (field) add(field);
      if (["website", "vehicle_source", "call", "text", "email", "apply_external"].includes(method))
        mark(interested);
      if (["website", "vehicle_source", "apply_external"].includes(method)) mark(outbound);
    }
  }
  for (const row of rows.values()) {
    row.uniqueBrowsers = browsers.get(row.key)?.size ?? 0;
    row.interestedBrowsers = interested.get(row.key)?.size ?? 0;
    row.outboundBrowsers = outbound.get(row.key)?.size ?? 0;
    row.modeledSales =
      row.conversionPercent == null
        ? null
        : Math.round(row.interestedBrowsers * row.conversionPercent) / 100;
    row.listings = [...(listingRows.get(row.key)?.values() ?? [])].sort(
      (a, b) => b.listingViews - a.listingViews || a.title.localeCompare(b.title),
    );
    row.daily = [...(days.get(row.key)?.entries() ?? [])]
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return {
    businesses: [...rows.values()].sort(
      (a, b) => b.listingViews - a.listingViews || a.name.localeCompare(b.name),
    ),
    unattributedEvents,
  };
}

export function businessPerformanceCsv(
  rows: BusinessPerformanceRow[],
  coverage?: { period: { since: string; until: string }; trackingStartedAt: string },
) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^(?:\s*[=+\-@]|[\t\r\n])/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const header = [
    "Period start",
    "Period end",
    "Click tracking began",
    "Business",
    "Location",
    "Sources",
    "Active listings",
    "Listing-card clicks",
    "Listing views",
    "Unique browsers",
    "Profile views",
    "Profile clicks",
    "Website clicks",
    "Original listing clicks",
    "Call clicks",
    "Text clicks",
    "Email clicks",
    "Directions clicks",
    "Inquiry conversations",
    "Save actions",
    "Interested browsers",
    "Assumed conversion percent",
    "Modeled sales (unverified)",
  ];
  return [
    header,
    ...rows.map((r) => [
      coverage?.period.since ?? "",
      coverage?.period.until ?? "",
      coverage?.trackingStartedAt ?? "",
      r.name,
      [r.city, r.state].filter(Boolean).join(", "),
      r.sources.join("; "),
      r.activeListings,
      r.listingClicks,
      r.listingViews,
      r.uniqueBrowsers,
      r.profileViews,
      r.profileClicks,
      r.websiteClicks,
      r.vehicleClicks,
      r.calls,
      r.texts,
      r.emails,
      r.directions,
      r.inquiries,
      r.saves,
      r.interestedBrowsers,
      r.conversionPercent,
      r.modeledSales,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
