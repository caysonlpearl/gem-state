/* eslint-disable @typescript-eslint/no-explicit-any -- existing domain handlers retain their own runtime validators. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from "@/config/supabase-public";
import { serverEnv } from "./runtime-env.server";
import { createMobileHandler, MobileApiError, mobileJson } from "./mobile-api";
import { mobileWriteId } from "./mobile-write";
import { mobileCachedBrowse, mobileSnapshotFirst, mobileHomepage } from "./mobile-catalog";
import {
  mobileCategories,
  mobileCategoryAllowed,
  mobileListingAllowed,
  mobilePublishableKey,
  mobileMediaUrl,
  MOBILE_POLICY_VERSION,
  type MobileListing,
} from "./mobile-contract";
import { formatClassifiedPrice, adoptionPriceLabel, formatJobPay } from "./classifieds-display";
import { dealerContactPriceLabel } from "./vehicle-shopping";

/** Calls domain middleware/validators inside this request, without public generated RPC URLs. */
async function domain(fn: any, data?: unknown): Promise<any> {
  try {
    // Calling the supported server function resolves its extracted handler on
    // the server. __executeServer on an SSR facade has no handler body.
    return await fn(data === undefined ? undefined : { data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unauthorized/i.test(message))
      throw new MobileApiError(401, "sign_in_required", "Please sign in again.");
    // Domain validation errors are useful, but database/provider diagnostics are not a public API.
    if (
      /^(Add |Choose |Keep |Tell |Accept |Complete seller setup|This .*no longer|Could not |We could not )/.test(
        message,
      )
    )
      throw new MobileApiError(400, "invalid_request", message.slice(0, 200));
    throw error;
  }
}
async function database() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
async function mobileControl(name: "push_enabled" | "advertising_enabled") {
  const result = await (
    await database()
  )
    .from("mobile_controls")
    .select(name)
    .eq("id", true)
    .single();
  return !result.error && result.data?.[name] === true;
}
async function actor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new MobileApiError(401, "sign_in_required", "Please sign in to continue.");
  const url =
    serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL") || PUBLIC_SUPABASE_URL;
  const key =
    serverEnv("GEM_STATE_SUPABASE_PUBLISHABLE_KEY") ||
    serverEnv("SUPABASE_PUBLISHABLE_KEY") ||
    PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!mobilePublishableKey(key))
    throw new MobileApiError(
      503,
      "configuration_unavailable",
      "Bluebird is temporarily unavailable.",
    );
  const token = authorization.slice(7);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new MobileApiError(401, "sign_in_required", "Please sign in again.");
  return { user: data.user, client };
}
function dto(card: any): MobileListing {
  return {
    display: {
      discoverySellerKey: card.discoverySellerKey,
      productSlug: card.productSlug ?? "",
      region: card.region ?? "",
      condition: card.condition ?? "",
      fulfillmentMode: card.fulfillmentMode ?? "local_pickup",
      isFeatured: card.isFeatured === true,
      vehicle: card.vehicle ?? null,
      pet: card.pet ?? null,
      home: card.home ?? null,
      job: card.job ?? null,
      service: card.service ?? null,
      vehiclePricing: card.vehiclePricing,
      dealer: card.dealer
        ? {
            displayName: card.dealer.displayName,
            slug: card.dealer.slug,
            logoUrl: mobileMediaUrl(card.dealer.logoUrl),
            city: card.dealer.city,
            state: card.dealer.state,
          }
        : null,
      externalVehicle: card.externalVehicle
        ? { sourceKind: card.externalVehicle.sourceKind }
        : undefined,
      externalJob: card.externalJob
        ? {
            source: "Adzuna",
            url: mobileMediaUrl(card.externalJob.url) ?? "",
            logoUrl: mobileMediaUrl(card.externalJob.logoUrl) ?? undefined,
          }
        : undefined,
      externalHome: card.externalHome
        ? {
            source: card.externalHome.source,
            sourceUrl: mobileMediaUrl(card.externalHome.sourceUrl),
            cacheExpiresAt: card.externalHome.cacheExpiresAt,
          }
        : undefined,
      directory: card.directory
        ? {
            source: "Foursquare",
            claimed: card.directory.claimed === true,
            logoUrl: mobileMediaUrl(card.directory.logoUrl),
            phone: card.directory.phone ?? null,
            website: mobileMediaUrl(card.directory.website),
            email: null,
            trades: [],
            rating: card.directory.rating ?? null,
            reviewCount: card.directory.reviewCount ?? null,
            googleUrl: null,
            hours: [],
          }
        : undefined,
    },
    shoppingFeatures: Object.fromEntries(
      Object.entries(card.shoppingFeatures ?? {})
        .filter(
          ([key, value]) =>
            /^rank_(visual|budget|location|freshness)$/.test(key) &&
            typeof value === "number" &&
            Number.isFinite(value),
        )
        .map(([key, value]) => [key, value as number]),
    ),
    available: !card.ended && (!card.expiresAt || Date.parse(card.expiresAt) > Date.now()),
    canSave:
      /^[0-9a-f-]{36}$/i.test(card.productId ?? "") ||
      /^(dealerfeed-|marketcheck-|openwebninja-|mashvisor-|adzuna-)/.test(card.id),
    canMessage:
      Boolean(card.seller?.allowInternalMessages) &&
      (/^[0-9a-f-]{36}$/i.test(card.id) || card.id.startsWith("dealerfeed-")),
    source:
      card.externalJob?.source ??
      card.externalHome?.source ??
      (card.externalPet ? "RescueGroups.org" : null) ??
      card.directory?.source ??
      card.dealer?.displayName ??
      null,
    sourceUrl: mobileMediaUrl(
      card.externalJob?.url ??
        card.externalHome?.sourceUrl ??
        card.externalPet?.sourceUrl ??
        card.originalListing?.url ??
        card.directory?.website,
    ),
    id: card.id,
    productId: card.productId ?? "",
    title: card.title,
    categorySlug: card.categorySlug,
    categoryName: card.categoryName ?? "",
    priceCents: card.priceCents,
    priceLabel: card.job
      ? formatJobPay(card.job)
      : (card.service?.pricing ??
        dealerContactPriceLabel(card) ??
        adoptionPriceLabel(card) ??
        formatClassifiedPrice(card.priceCents, {
          wholeDollars: true,
          monthly: card.home?.mode === "rent",
        })),
    currency: card.currency ?? "USD",
    city: card.city,
    state: card.state,
    imageUrl: mobileMediaUrl(card.imageUrl),
    createdAt: card.createdAt,
    ...(typeof card.description === "string" ? { description: card.description } : {}),
    ...(card.images
      ? {
          images: card.images.flatMap((i: any) => {
            const url = mobileMediaUrl(i.url);
            return url ? [{ url, alt: i.alt }] : [];
          }),
        }
      : {}),
    ...(card.seller
      ? {
          seller: {
            displayName: card.seller.displayName,
            contactPhone: card.seller.contactPhone ?? null,
            contactEmail: card.seller.contactEmail ?? null,
          },
        }
      : {}),
  };
}
async function listing(id: string) {
  if (!/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(id) || id.startsWith("avantlink-"))
    throw new MobileApiError(404, "listing_unavailable", "This listing is unavailable in the app.");
  const { getClassifiedListing } = await import("./classifieds.functions");
  const card = await domain(getClassifiedListing, { id, recordView: false });
  if (!card || !mobileListingAllowed(card))
    throw new MobileApiError(404, "listing_unavailable", "This listing is unavailable in the app.");
  return card;
}
async function consent(userId: string) {
  const { data, error } = await (
    await database()
  )
    .from("shopping_accounts")
    .select("terms_version,shopping_alerts")
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new MobileApiError(
      503,
      "consent_unavailable",
      "Account preferences are temporarily unavailable.",
    );
  return data ?? { terms_version: null, shopping_alerts: false };
}
async function requireTerms(userId: string) {
  if ((await consent(userId)).terms_version !== MOBILE_POLICY_VERSION)
    throw new MobileApiError(
      409,
      "terms_required",
      "Please accept the current Terms of Service first.",
    );
}
async function allowedConversation(id: string) {
  const { getConversation } = await import("./conversation.functions");
  const detail = await domain(getConversation, { id });
  // Store apps may not use general dealer chats to bypass catalog restrictions.
  if (!detail.listingId)
    throw new MobileApiError(
      404,
      "conversation_unavailable",
      "This conversation is unavailable in the app.",
    );
  await listing(detail.listingId);
  return detail;
}
const browseSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(60).optional(),
  group: z.enum(["motors", "classifieds"]).optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  postalCode: z.string().max(12).optional(),
  state: z.string().length(2).optional(),
  sort: z.enum(["newest", "price_low", "price_high", "mileage_low"]).default("newest"),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

export const handleMobileRequest = createMobileHandler(async (request, path) => {
  const method = request.method;
  if (method === "GET" && path === "bootstrap") {
    const supabaseUrl =
      serverEnv("GEM_STATE_SUPABASE_URL") || serverEnv("SUPABASE_URL") || PUBLIC_SUPABASE_URL;
    const supabaseKey =
      serverEnv("GEM_STATE_SUPABASE_PUBLISHABLE_KEY") ||
      serverEnv("SUPABASE_PUBLISHABLE_KEY") ||
      PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !mobilePublishableKey(supabaseKey))
      throw new MobileApiError(
        503,
        "configuration_unavailable",
        "Bluebird is temporarily unavailable.",
      );
    return {
      apiVersion: 1,
      policyVersion: MOBILE_POLICY_VERSION,
      categories: mobileCategories,
      supabaseUrl,
      supabaseKey,
      features: {
        paidUpgrades: false,
        push:
          serverEnv("BLUEBIRD_MOBILE_PUSH_ENABLED") === "true" &&
          (await mobileControl("push_enabled")),
        advertising:
          serverEnv("BLUEBIRD_MOBILE_ADS_ENABLED") === "true" &&
          (await mobileControl("advertising_enabled")),
      },
    };
  }
  if (method === "GET" && path === "home") {
    const snapshot = await (await import("./homepage-snapshot.server")).readHomepageSnapshot();
    const home = mobileHomepage(snapshot);
    return { motors: home.motors.map(dto), recent: home.recent.map(dto) };
  }
  if (method === "GET" && path === "listings") {
    const parsed = browseSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success)
      throw new MobileApiError(400, "invalid_filters", "Check your search filters.");
    if (parsed.data.category && !mobileCategoryAllowed(parsed.data.category))
      return { items: [], nextPage: null, incomplete: false };
    let page;
    let selection = false;
    if (mobileSnapshotFirst(parsed.data)) {
      try {
        const cached = mobileCachedBrowse(
          await (await import("./homepage-snapshot.server")).readHomepageSnapshot(),
          parsed.data,
        );
        if (cached.total > 0) {
          page = cached;
          selection = true;
        }
      } catch {
        /* A failed snapshot must not prevent a complete catalog attempt. */
      }
    }
    if (!page) {
      const { loadMobileBrowseInventory } = await import("./classifieds.functions");
      try {
        page = await loadMobileBrowseInventory(parsed.data);
      } catch {
        const snapshot = await (await import("./homepage-snapshot.server")).readHomepageSnapshot();
        page = mobileCachedBrowse(snapshot, parsed.data);
      }
    }
    return {
      items: page.listings.filter(mobileListingAllowed).map(dto),
      nextPage: page.page * page.pageSize < page.total ? page.page + 1 : null,
      incomplete: page.incomplete === true,
      selection,
    };
  }
  const listingMatch = /^listings\/([^/]+)$/.exec(path);
  if (method === "GET" && listingMatch) return dto(await listing(listingMatch[1]!));

  if (
    [
      "shopping",
      "recommendations",
      "similar",
      "activity",
      "shopping/privacy",
      "shopping/clear",
    ].includes(path)
  ) {
    const user = request.headers.has("authorization") ? (await actor(request)).user : null;
    const result = await (
      await import("./mobile-shopping.server")
    ).handleMobileShopping(request, path, await database(), user);
    if (path === "recommendations" && "recent" in result)
      return {
        ...result,
        recent: result.recent.map(dto),
        continuing: result.continuing.map(dto),
        recommended: result.recommended.map(dto),
      };
    if (path === "similar" && "cards" in result) return { ...result, cards: result.cards.map(dto) };
    return result;
  }
  const { user, client } = await actor(request);
  if (method === "GET" && path === "account") {
    const { getMyAccount } = await import("./account.functions");
    return { account: await domain(getMyAccount), consent: await consent(user.id) };
  }
  if (method === "GET" && path === "advertising") {
    const platform = z
      .enum(["ios", "android"])
      .parse(new URL(request.url).searchParams.get("platform"));
    const result = await (
      await database()
    )
      .from("mobile_ad_consents")
      .select("advertising,att,platform")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data
      ? {
          ...result.data,
          advertising:
            result.data.advertising &&
            serverEnv("BLUEBIRD_MOBILE_ADS_ENABLED") === "true" &&
            (await mobileControl("advertising_enabled")),
        }
      : null;
  }
  if (["POST", "PUT"].includes(method) && path !== "account/deletion") {
    const pending = await (
      await database()
    )
      .from("mobile_account_deletions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pending.error) throw pending.error;
    if (pending.data)
      throw new MobileApiError(
        409,
        "deletion_pending",
        "Your account deletion is pending. Contact Bluebird if you need help.",
      );
  }
  if (method === "PUT" && path === "consent") {
    const body = await mobileJson(request);
    const parsed = z
      .object({
        acceptTerms: z.literal(true),
        shoppingAlerts: z.boolean(),
        version: z.literal(MOBILE_POLICY_VERSION),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new MobileApiError(
        400,
        "invalid_consent",
        "Accept the current terms and choose your shopping-alert preference.",
      );
    const { error } = await (
      await database()
    ).rpc("mobile_accept_terms", {
      _user: user.id,
      _version: parsed.data.version,
      _shopping_alerts: parsed.data.shoppingAlerts,
    });
    if (error) throw error;
    return consent(user.id);
  }
  if (method === "DELETE" && path === "devices") {
    const body = await mobileJson(request),
      token = z.string().min(16).max(4096).parse(body.token);
    const { error } = await (
      await database()
    )
      .from("mobile_push_devices")
      .delete()
      .eq("user_id", user.id)
      .eq("token", token);
    if (error) throw error;
    return { removed: true };
  }
  if (method === "GET" && path === "account/deletion") {
    const result = await (
      await database()
    )
      .from("mobile_account_deletions")
      .select("status,requested_at,completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  if (method === "POST" && path === "account/deletion") {
    const body = await mobileJson(request);
    if (body.confirm !== "DELETE")
      throw new MobileApiError(
        400,
        "confirmation_required",
        "Type DELETE to request account deletion.",
      );
    const { error } = await (await database()).rpc("mobile_request_deletion", { _user: user.id });
    if (error) throw error;
    return {
      requested: true,
      message:
        "Your deletion request has been received. Bluebird will confirm when it is completed.",
    };
  }
  if (method === "GET" && path === "seller")
    return domain((await import("./seller.functions")).getSellerSetup);
  if (method === "GET" && path === "saved") {
    const [
      { getMyWatchlist },
      { getMySavedPartnerVehicles },
      { getMySavedPartnerHomes },
      { getMySavedPartnerJobs },
    ] = await Promise.all([
      import("./community.functions"),
      import("./saved-vehicles.functions"),
      import("./saved-homes.functions"),
      import("./saved-jobs.functions"),
    ]);
    const [watched, vehicles, homes, jobs] = await Promise.all([
      domain(getMyWatchlist),
      domain(getMySavedPartnerVehicles),
      domain(getMySavedPartnerHomes),
      domain(getMySavedPartnerJobs),
    ]);
    const native = await Promise.all(
      watched
        .filter((w: any) => w.listingId)
        .map((w: any) =>
          listing(w.listingId).catch((error) => {
            if (error instanceof MobileApiError && error.status === 404) return null;
            throw error;
          }),
        ),
    );
    return {
      items: [...native, ...vehicles, ...homes, ...jobs]
        .filter(Boolean)
        .filter(mobileListingAllowed)
        .map(dto),
    };
  }
  if (method === "GET" && path === "saved-state") {
    const id = new URL(request.url).searchParams.get("listingId");
    const card = await listing(z.string().parse(id));
    if (/^(marketcheck-|dealerfeed-)/.test(card.id))
      return domain((await import("./saved-vehicles.functions")).getPartnerVehicleSaved, {
        listingId: card.id,
      });
    if (/^(openwebninja-|mashvisor-)/.test(card.id))
      return domain((await import("./saved-homes.functions")).getPartnerHomeSaved, {
        listingId: card.id,
      });
    if (card.id.startsWith("adzuna-"))
      return domain((await import("./saved-jobs.functions")).getPartnerJobSaved, {
        listingId: card.id,
      });
    const state = await domain((await import("./community.functions")).getProductWatchState, {
      productId: card.productId,
    });
    return { saved: state.watching };
  }
  if (method === "GET" && path === "conversations") {
    const { getMyConversations } = await import("./conversation.functions");
    const all = await domain(getMyConversations);
    const safe = await Promise.all(
      all.map(async (c: any) => {
        if (!c.listingId) return null;
        try {
          await listing(c.listingId);
          return c;
        } catch (error) {
          if (error instanceof MobileApiError && error.status === 404) return null;
          throw error;
        }
      }),
    );
    return safe.filter(Boolean);
  }
  const conversationMatch = /^conversations\/([0-9a-f-]{36})$/.exec(path);
  if (method === "GET" && conversationMatch) return allowedConversation(conversationMatch[1]!);
  if (!["POST", "PUT"].includes(method))
    throw new MobileApiError(404, "not_found", "This app action was not found.");
  await requireTerms(user.id);
  const body = await mobileJson(request);
  if (method === "PUT" && path === "advertising") {
    const parsed = z
      .object({
        advertising: z.boolean(),
        platform: z.enum(["ios", "android"]),
        att: z.enum(["authorized", "denied", "restricted", "not_determined", "not_applicable"]),
      })
      .parse(body);
    const permitted =
      parsed.advertising &&
      serverEnv("BLUEBIRD_MOBILE_ADS_ENABLED") === "true" &&
      (await mobileControl("advertising_enabled")) &&
      (parsed.platform === "ios" ? parsed.att === "authorized" : parsed.att === "not_applicable");
    const result = await (await database()).from("mobile_ad_consents").upsert(
      {
        user_id: user.id,
        ...parsed,
        advertising: permitted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" },
    );
    if (result.error) throw result.error;
    return { ...parsed, advertising: permitted };
  }
  if (method === "POST" && path === "seller")
    return domain((await import("./seller.functions")).saveSellerSetup, body);
  if (method === "PUT" && path === "devices") {
    const parsed = z
      .object({ token: z.string().min(16).max(4096), platform: z.enum(["ios", "android"]) })
      .parse(body);
    const { error } = await (
      await database()
    ).rpc("mobile_register_device", {
      _user: user.id,
      _token: parsed.token,
      _platform: parsed.platform,
    });
    if (error) throw error;
    return { registered: true };
  }
  if (method === "POST" && path === "saved") {
    const card = await listing(z.string().parse(body.listingId));
    const saved = z.boolean().parse(body.saved);
    if (/^(marketcheck-|dealerfeed-)/.test(card.id))
      return domain((await import("./saved-vehicles.functions")).setPartnerVehicleSaved, {
        listingId: card.id,
        saved,
      });
    if (/^(openwebninja-|mashvisor-)/.test(card.id))
      return domain((await import("./saved-homes.functions")).setPartnerHomeSaved, {
        listingId: card.id,
        saved,
      });
    if (card.id.startsWith("adzuna-"))
      return domain((await import("./saved-jobs.functions")).setPartnerJobSaved, {
        listingId: card.id,
        saved,
      });
    if (!/^[0-9a-f-]{36}$/.test(card.productId))
      throw new MobileApiError(
        400,
        "save_unavailable",
        "This listing does not support saving yet.",
      );
    return domain((await import("./community.functions")).setProductWatchState, {
      productId: card.productId,
      watching: saved,
    });
  }
  if (method === "POST" && path === "conversations") {
    const card = await listing(z.string().parse(body.listingId));
    return domain((await import("./conversation.functions")).startConversation, {
      listingId: card.id,
      body: body.body,
      requestId: mobileWriteId(request.headers.get("Idempotency-Key")),
    });
  }
  const actionMatch = /^conversations\/([0-9a-f-]{36})\/(messages|read|block|report)$/.exec(path);
  if (method === "POST" && actionMatch) {
    const id = actionMatch[1]!,
      action = actionMatch[2];
    await allowedConversation(id);
    const f = await import("./conversation.functions");
    const fn =
      action === "messages"
        ? f.sendConversationMessage
        : action === "read"
          ? f.markConversationRead
          : action === "block"
            ? f.blockConversation
            : f.reportConversation;
    return domain(fn, {
      conversationId: id,
      body: body.body,
      reason: body.reason,
      ...(action === "messages"
        ? { requestId: mobileWriteId(request.headers.get("Idempotency-Key")) }
        : {}),
    });
  }
  if (method === "POST" && path === "reports") {
    await listing(z.string().parse(body.listingId));
    return domain((await import("./classifieds.functions")).reportClassifiedListing, body);
  }
  if (method === "POST" && path === "listings") {
    if (
      !mobileListingAllowed({
        categorySlug: body.category,
        title: body.title,
        description: body.description,
      })
    )
      throw new MobileApiError(
        400,
        "listing_restricted",
        "This listing is not supported in the mobile app.",
      );
    return domain((await import("./classifieds.functions")).createClassifiedListing, body);
  }
  if (method === "POST" && path.startsWith("photos/")) {
    const f = await import("./photo-storage.functions");
    if (path === "photos/mode") return domain(f.getPhotoUploadMode);
    if (path === "photos/begin") return domain(f.beginPrivatePhotoUpload, body);
    if (path === "photos/finish") return domain(f.finishPrivatePhotoUpload, body);
  }
  // Explicitly no payment, checkout, arbitrary RPC, SQL, or web-URL forwarding endpoint.
  throw new MobileApiError(404, "not_found", "This app action was not found.");
}, process.env["NODE_ENV"] !== "production");
