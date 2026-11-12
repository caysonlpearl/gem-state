import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { marketplaceStateCodes } from "@/config/classifieds";
import {
  businessForListing,
  businessFromProps,
  businessHost,
  canonicalBusiness,
  isTestBusiness,
  summarizeBusinessPerformance,
  type BusinessIdentity,
  type BusinessAttribution,
  type BusinessMetricEvent,
} from "./business-performance";

async function readAll(
  query: (offset: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const result: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await query(offset);
    if (batch.error) throw Error("Business performance data could not be loaded. Please retry.");
    result.push(...((batch.data ?? []) as Record<string, any>[]));
    if ((batch.data?.length ?? 0) < 500) return result;
  }
}
export async function loadBusinessPerformance(admin: SupabaseClient, days: number) {
  const db = admin as any;
  const until = new Date().toISOString(),
    since = new Date(Date.now() - days * 86400000).toISOString();
  const [profiles, staff, members, storedEntities, storedLinks, rates, release] = await Promise.all(
    [
      readAll((offset) =>
        db
          .from("dealer_profiles")
          .select("id,slug,display_name,city,state,postal_code,website,owner_user_id")
          .order("id")
          .range(offset, offset + 499),
      ),
      readAll((offset) =>
        db
          .from("user_roles")
          .select("user_id,role")
          .in("role", ["admin", "moderator"])
          .order("user_id")
          .range(offset, offset + 499),
      ),
      readAll((offset) =>
        db
          .from("dealer_members")
          .select("dealer_id,user_id,status")
          .eq("status", "active")
          .order("dealer_id")
          .order("user_id")
          .range(offset, offset + 499),
      ),
      readAll((offset) =>
        db
          .from("business_performance_entities")
          .select("business_key,canonical_key,metadata")
          .order("business_key")
          .range(offset, offset + 499),
      ),
      readAll((offset) =>
        db
          .from("business_listing_attribution")
          .select("listing_id,business_key,title,source")
          .order("listing_id")
          .range(offset, offset + 499),
      ),
      readAll((offset) =>
        db
          .from("business_sales_assumptions")
          .select("business_key,conversion_percent")
          .order("business_key")
          .range(offset, offset + 499),
      ),
      db.from("business_tracking_release").select("tracking_started_at").eq("id", true).single(),
    ],
  );
  if (release.error) throw Error("Business tracking setup is incomplete.");
  // A registered business can use an ordinary seller storefront (including
  // industrial/parts inventory). Do not promote it to a verified dealer account.
  const businessSlugs = storedEntities
    .map((row) => row.metadata?.sellerSlug)
    .filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9-]{1,120}$/.test(slug));
  const businessSellers = businessSlugs.length
    ? await readAll((offset) =>
        db
          .from("seller_profiles")
          .select("user_id,slug")
          .in("slug", businessSlugs)
          .order("user_id")
          .range(offset, offset + 499),
      )
    : [];
  const sellerBusinesses = new Map(
    businessSellers.flatMap((seller) => {
      const matches = storedEntities.filter((row) => row.metadata?.sellerSlug === seller.slug);
      return matches.length === 1 ? [[seller.user_id, matches[0].business_key] as const] : [];
    }),
  );
  // Include staff/owner events of every type: an admin-only login visit can
  // identify the anonymous listing views that happened before sign-in.
  const accountIds = [
    ...new Set(
      [
        ...staff.map((p) => p.user_id),
        ...profiles.map((p) => p.owner_user_id),
        ...members.map((p) => p.user_id),
        ...businessSellers.map((p) => p.user_id),
      ].filter(Boolean),
    ),
  ];
  const eventNames = [
    "listing_viewed",
    "business_listing_clicked",
    "visit_started",
    "page_viewed",
    "business_profile_viewed",
    "business_action",
    "seller_contacted",
    "inquiry_completed",
    "business_inquiry_completed",
    "watchlist_added",
  ];
  const eventFilter = `name.in.(${eventNames.join(",")})${accountIds.length ? `,user_id.in.(${accountIds.join(",")})` : ""}`;
  const events = await readAll((offset) =>
    db
      .from("analytics_events")
      .select("id,name,props,user_id,session_id,occurred_at,is_demo")
      .or(eventFilter)
      .eq("is_demo", false)
      .gte("occurred_at", since)
      .lt("occurred_at", until)
      .order("occurred_at")
      .order("id")
      .range(offset, offset + 499),
  );
  const official: BusinessIdentity[] = profiles
    .map((p) => ({
      key: "dealer:" + p.slug,
      canonicalKey: "dealer:" + p.slug,
      kind: "dealer" as const,
      name: p.display_name,
      city: p.city ?? "",
      state: p.state ?? "",
      postalCode: p.postal_code ?? "",
      website: businessHost(p.website),
      dealerSlug: p.slug,
    }))
    .filter((p) => !isTestBusiness(p));
  const identities = new Map<string, BusinessIdentity>(
    storedEntities.map((row) => [
      row.business_key,
      {
        ...row.metadata,
        key: row.business_key,
        canonicalKey: row.canonical_key,
      } as BusinessIdentity,
    ]),
  );
  for (const identity of official) identities.set(identity.key, identity);
  const links = new Map<string, BusinessAttribution>(
    storedLinks.map((row) => [
      row.listing_id,
      {
        listingId: row.listing_id,
        businessKey: row.business_key,
        title: row.title,
        source: row.source,
        active: false,
      },
    ]),
  );
  // These readers use saved inventory only. Opening a report cannot spend
  // an API allowance or modify member listings.
  const [{ dealerFeedCards }, { marketCheckCards }, { mergeDealerFeedVehicles }] =
    await Promise.all([
      import("./dealer-feed.server"),
      import("./marketcheck.server"),
      import("./dealer-feed-contract"),
    ]);
  const [feed, api] = await Promise.all([
    dealerFeedCards({ category: "cars-trucks" }),
    Promise.all(
      marketplaceStateCodes.map((state) =>
        marketCheckCards(
          { category: "cars-trucks", state },
          { cacheOnly: true, cacheReadTimeoutMs: 8000 },
        ),
      ),
    ).then((pools) => [...new Map(pools.flat().map((card) => [card.id, card])).values()]),
  ]);
  const visible = new Set(
    mergeDealerFeedVehicles(feed.cards, api, feed.dealers).map((card) => card.id),
  );
  const native = await readAll((offset) =>
    db
      .from("asks")
      .select("id,dealer_id,seller_id,products(name,status),is_demo,status,approved_at,expires_at")
      .or(
        `dealer_id.not.is.null${sellerBusinesses.size ? `,seller_id.in.(${[...sellerBusinesses.keys()].join(",")})` : ""}`,
      )
      .eq("is_demo", false)
      .order("id")
      .range(offset, offset + 499),
  );
  for (const card of [...feed.cards, ...api]) {
    const identity = businessForListing(card);
    if (!identity) continue;
    identities.set(identity.key, canonicalBusiness(identity, official));
    links.set(card.id, {
      listingId: card.id,
      businessKey: identity.key,
      title: card.title,
      source: card.id.startsWith("dealerfeed-") ? "Authorized feed" : "MarketCheck API",
      active: visible.has(card.id),
    });
  }
  for (const listing of native) {
    const p = profiles.find((p) => p.id === listing.dealer_id);
    const key = p ? "dealer:" + p.slug : sellerBusinesses.get(listing.seller_id);
    if (!key || listing.is_demo) continue;
    if (!identities.has(key)) continue;
    const product = Array.isArray(listing.products) ? listing.products[0] : listing.products;
    links.set(listing.id, {
      listingId: listing.id,
      businessKey: key,
      title: product?.name ?? listing.id,
      source: p ? "Dealer-posted listing" : "Business seller inventory",
      active:
        listing.status === "active" &&
        product?.status === "published" &&
        Boolean(listing.approved_at) &&
        Date.parse(listing.expires_at) > Date.now(),
    });
  }
  for (const event of events) {
    const identity = businessFromProps(event.props);
    if (identity && !isTestBusiness(identity)) {
      if (!identities.has(identity.key))
        identities.set(identity.key, canonicalBusiness(identity, official));
      const p = event.props ?? {};
      if (typeof p.listing_id === "string" && !links.has(p.listing_id))
        links.set(p.listing_id, {
          listingId: p.listing_id,
          businessKey: identity.key,
          title:
            typeof p.business_listing_title === "string" && p.business_listing_title
              ? p.business_listing_title.slice(0, 200)
              : p.listing_id,
          source:
            typeof p.business_listing_source === "string"
              ? p.business_listing_source.slice(0, 80)
              : "Recorded business listing",
          active: false,
        });
    }
  }
  // Retain aliases, public names, and listing titles after inventory expires.
  // Historical activity never depends on the listing still being for sale.
  const entities = [...identities.values()]
    .filter((identity) => !isTestBusiness(identity))
    .map((identity) => canonicalBusiness(identity, official));
  const validKeys = new Set(entities.map((identity) => identity.key));
  const previousEntities = new Map(storedEntities.map((row) => [row.business_key, row]));
  const entityChanges = entities.filter((identity) => {
    const old = previousEntities.get(identity.key);
    return (
      !old ||
      old.canonical_key !== identity.canonicalKey ||
      Object.entries(identity).some(([key, value]) => old.metadata?.[key] !== value)
    );
  });
  for (let offset = 0; offset < entityChanges.length; offset += 200) {
    const { error } = await db.from("business_performance_entities").upsert(
      entityChanges.slice(offset, offset + 200).map((identity) => ({
        business_key: identity.key,
        canonical_key: identity.canonicalKey,
        metadata: identity,
        updated_at: until,
      })),
    );
    if (error) throw Error("Business attribution could not be saved.");
  }
  const attributes = [...links.values()].filter((link) => validKeys.has(link.businessKey));
  const previousLinks = new Map(storedLinks.map((row) => [row.listing_id, row]));
  const linkChanges = attributes.filter((link) => {
    const old = previousLinks.get(link.listingId);
    return (
      !old ||
      old.business_key !== link.businessKey ||
      old.title !== link.title ||
      old.source !== link.source
    );
  });
  for (let offset = 0; offset < linkChanges.length; offset += 200) {
    const { error } = await db.from("business_listing_attribution").upsert(
      linkChanges.slice(offset, offset + 200).map((link) => ({
        listing_id: link.listingId,
        business_key: link.businessKey,
        title: link.title,
        source: link.source,
        updated_at: until,
      })),
    );
    if (error) throw Error("Listing attribution could not be saved.");
  }
  const owners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const ids = new Set<string>();
    if (profile.owner_user_id) ids.add(profile.owner_user_id);
    for (const member of members) if (member.dealer_id === profile.id) ids.add(member.user_id);
    owners.set("dealer:" + profile.slug, ids);
  }
  for (const [userId, businessKey] of sellerBusinesses) {
    if (!owners.has(businessKey)) owners.set(businessKey, new Set());
    owners.get(businessKey)!.add(userId);
  }
  return {
    period: { since, until, days },
    trackingStartedAt: String(release.data.tracking_started_at),
    aliases: Object.fromEntries(entities.map((e) => [e.key, e.canonicalKey])),
    ...summarizeBusinessPerformance({
      events: events as BusinessMetricEvent[],
      businesses: entities,
      attributions: attributes,
      staffIds: new Set(staff.map((p) => p.user_id)),
      domain: brand.domain,
      rates: new Map(
        rates.map((r) => [
          r.business_key,
          r.conversion_percent == null ? null : Number(r.conversion_percent),
        ]),
      ),
      ownerIds: owners,
    }),
  };
}
